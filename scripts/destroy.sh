#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"
enable_error_trap

require_tofu
require_command npm
require_command zip

load_env_if_present "${ENV_FILE:-$REPO_ROOT/.env}"

SERVICE_NAME="${SERVICE_NAME:-pr-concierge}"
FUNCTION_NAME="${FUNCTION_NAME:-$SERVICE_NAME}"
TOFU_ENVIRONMENT_NAME="$(default_tofu_environment_name)"
TOFU_VAR_FILE="$(resolve_tofu_var_file "$TOFU_ENVIRONMENT_NAME")"
TOFU_BACKEND_CONFIG_FILE="$(resolve_tofu_backend_config_file "$TOFU_ENVIRONMENT_NAME")"
DELETE_DATA="$(normalize_bool "${DELETE_DATA:-false}")"
ARTIFACT_PATH="${ARTIFACT_PATH:-$REPO_ROOT/.artifacts/${FUNCTION_NAME}.zip}"
DEPLOYMENT_OUTPUT_PATH="${DEPLOYMENT_OUTPUT_PATH:-$REPO_ROOT/.artifacts/${SERVICE_NAME}-deployment.json}"

require_file \
  "$TOFU_VAR_FILE" \
  "Missing OpenTofu variable file: ${TOFU_VAR_FILE}. Copy infra/terraform/env/${TOFU_ENVIRONMENT_NAME}.auto.tfvars.example to that path and fill in the non-secret root variables first."
require_file \
  "$TOFU_BACKEND_CONFIG_FILE" \
  "Missing OpenTofu backend config file: ${TOFU_BACKEND_CONFIG_FILE}. Copy infra/terraform/backend/${TOFU_ENVIRONMENT_NAME}.s3.tfbackend.example to that path and fill in the backend coordinates first."

export_tofu_root_value_from_env_if_present GITHUB_WEBHOOK_SECRET github_webhook_secret
export_tofu_root_value_from_env_if_present GITHUB_TOKEN github_token
export_tofu_root_value_from_env_if_present GITHUB_APP_ID github_app_id
export_tofu_root_value_from_env_if_present GITHUB_APP_PRIVATE_KEY github_app_private_key
export_tofu_root_value_from_env_if_present GITHUB_APP_INSTALLATION_ID github_app_installation_id

ensure_artifact_exists() {
  if [[ -f "$ARTIFACT_PATH" ]]; then
    info "Using existing Lambda artifact at $ARTIFACT_PATH"
    return
  fi

  info "Packaging the Lambda artifact so OpenTofu can evaluate the stack"
  "$SCRIPT_DIR/package-lambda.sh" "$ARTIFACT_PATH" >/dev/null
}

ensure_artifact_exists
info "Initializing OpenTofu in ${TOFU_ROOT} with backend config ${TOFU_BACKEND_CONFIG_FILE}"
tofu_init_with_backend "$TOFU_BACKEND_CONFIG_FILE"

if [[ "$DELETE_DATA" == "true" ]]; then
  info "Destroying the full PR Concierge stack, including data resources"
  tofu_cmd destroy \
    -auto-approve \
    -input=false \
    -var-file="$TOFU_VAR_FILE" \
    "-var=artifact_path=$ARTIFACT_PATH"
else
  info "Destroying compute, API, and observability resources while keeping DynamoDB and S3 data resources"
  tofu_cmd destroy \
    -auto-approve \
    -input=false \
    -var-file="$TOFU_VAR_FILE" \
    "-var=artifact_path=$ARTIFACT_PATH" \
    -target=aws_lambda_permission.http_api \
    -target=module.http_api \
    -target=module.observability \
    -target=module.service
  info "Keeping DynamoDB and S3 data resources. Re-run with DELETE_DATA=true to remove them too."
fi

rm -f -- "$DEPLOYMENT_OUTPUT_PATH"
info "OpenTofu teardown complete"
