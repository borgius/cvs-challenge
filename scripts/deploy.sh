#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"
enable_error_trap

require_tofu
require_command aws
require_command jq
require_command npm
require_command zip

load_env_if_present "${ENV_FILE:-$REPO_ROOT/.env}"

SERVICE_NAME="${SERVICE_NAME:-pr-concierge}"
FUNCTION_NAME="${FUNCTION_NAME:-$SERVICE_NAME}"
TOFU_ENVIRONMENT_NAME="$(default_tofu_environment_name)"
TOFU_VAR_FILE="$(resolve_tofu_var_file "$TOFU_ENVIRONMENT_NAME")"
TOFU_BACKEND_CONFIG_FILE="$(resolve_tofu_backend_config_file "$TOFU_ENVIRONMENT_NAME")"
ARTIFACT_PATH="${ARTIFACT_PATH:-$REPO_ROOT/.artifacts/${FUNCTION_NAME}.zip}"
DEPLOYMENT_OUTPUT_PATH="${DEPLOYMENT_OUTPUT_PATH:-$REPO_ROOT/.artifacts/${SERVICE_NAME}-deployment.json}"

require_file \
  "$TOFU_VAR_FILE" \
  "Missing OpenTofu variable file: ${TOFU_VAR_FILE}. Copy infra/terraform/env/${TOFU_ENVIRONMENT_NAME}.auto.tfvars.example to that path and fill in the non-secret root variables first."
require_file \
  "$TOFU_BACKEND_CONFIG_FILE" \
  "Missing OpenTofu backend config file: ${TOFU_BACKEND_CONFIG_FILE}. Copy infra/terraform/backend/${TOFU_ENVIRONMENT_NAME}.s3.tfbackend.example to that path and fill in the backend coordinates first."
warn_if_placeholder GITHUB_WEBHOOK_SECRET
warn_if_placeholder GITHUB_TOKEN

export_tofu_root_secret_from_env GITHUB_WEBHOOK_SECRET github_webhook_secret
export_tofu_root_secret_from_env GITHUB_TOKEN github_token

resource_is_managed_in_state() {
  local -r address="$1"

  tofu_cmd state show "$address" >/dev/null 2>&1
}

resolve_tofu_string() {
  local -r expression="$1"
  local value

  value="$(printf '%s\n' "$expression" | tofu_cmd console \
    -var-file="$TOFU_VAR_FILE" \
    "-var=artifact_path=$ARTIFACT_PATH")"
  value="${value%\"}"
  value="${value#\"}"

  printf '%s\n' "$value"
}

lambda_log_group_exists() {
  local -r log_group_name="$1"

  aws logs describe-log-groups \
    --log-group-name-prefix "$log_group_name" \
    --output json | jq -er --arg logGroupName "$log_group_name" \
    '.logGroups[]? | select(.logGroupName == $logGroupName) | .logGroupName' >/dev/null
}

import_existing_resource() {
  local -r address="$1"
  local -r import_id="$2"
  local -r description="$3"

  if resource_is_managed_in_state "$address"; then
    info "Using managed ${description}"
    return
  fi

  info "Importing existing ${description} into OpenTofu state"
  tofu_cmd import \
    -input=false \
    -var-file="$TOFU_VAR_FILE" \
    "-var=artifact_path=$ARTIFACT_PATH" \
    "$address" \
    "$import_id" >/dev/null
}

import_legacy_service_resources_if_present() {
  local function_name
  local lambda_role_name
  local lambda_log_group_name

  function_name="$(resolve_tofu_string 'local.function_name')"
  lambda_role_name="$(resolve_tofu_string 'local.lambda_role_name')"
  lambda_log_group_name="/aws/lambda/${function_name}"

  if aws iam get-role --role-name "$lambda_role_name" >/dev/null 2>&1; then
    import_existing_resource \
      'module.service.module.lambda_function.aws_iam_role.lambda[0]' \
      "$lambda_role_name" \
      "Lambda role ${lambda_role_name}"
  fi

  if lambda_log_group_exists "$lambda_log_group_name"; then
    import_existing_resource \
      'module.service.module.lambda_function.aws_cloudwatch_log_group.lambda[0]' \
      "$lambda_log_group_name" \
      "Lambda log group ${lambda_log_group_name}"
  fi

  if aws lambda get-function --function-name "$function_name" >/dev/null 2>&1; then
    import_existing_resource \
      'module.service.module.lambda_function.aws_lambda_function.this[0]' \
      "$function_name" \
      "Lambda function ${function_name}"
  fi
}

write_deployment_output() {
  mkdir -p "$REPO_ROOT/.artifacts"
  tofu_cmd output -json deployment_summary | jq '.' >"$DEPLOYMENT_OUTPUT_PATH"

  info "Wrote deployment details to $DEPLOYMENT_OUTPUT_PATH"
  printf 'Health URL: %s\n' "$(jq -r '.healthUrl' "$DEPLOYMENT_OUTPUT_PATH")"
  printf 'Webhook URL: %s\n' "$(jq -r '.webhookUrl' "$DEPLOYMENT_OUTPUT_PATH")"
}

info "Packaging the Lambda artifact"
"$SCRIPT_DIR/package-lambda.sh" "$ARTIFACT_PATH" >/dev/null

info "Initializing OpenTofu in ${TOFU_ROOT} with backend config ${TOFU_BACKEND_CONFIG_FILE}"
tofu_init_with_backend "$TOFU_BACKEND_CONFIG_FILE"

import_legacy_service_resources_if_present

info "Applying the PR Concierge stack with variables from ${TOFU_VAR_FILE}"
tofu_cmd apply \
  -auto-approve \
  -input=false \
  -var-file="$TOFU_VAR_FILE" \
  "-var=artifact_path=$ARTIFACT_PATH"

write_deployment_output
