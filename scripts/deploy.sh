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

if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  warn_if_placeholder GITHUB_TOKEN
fi

warn_if_placeholder GITHUB_APP_ID
warn_if_placeholder GITHUB_APP_PRIVATE_KEY

if [[ -n "${GITHUB_APP_INSTALLATION_ID:-}" ]]; then
  warn_if_placeholder GITHUB_APP_INSTALLATION_ID
fi

require_github_check_runtime_auth_inputs

resource_is_managed_in_state() {
  local -r address="$1"

  tofu_cmd state show "$address" >/dev/null 2>&1
}

forget_legacy_ssm_parameter_resources_if_present() {
  local -ra legacy_ssm_parameter_addresses=(
    'module.service.aws_ssm_parameter.github_webhook_secret[0]'
    'module.service.aws_ssm_parameter.github_token[0]'
    'module.service.aws_ssm_parameter.github_app_id[0]'
    'module.service.aws_ssm_parameter.github_app_private_key[0]'
    'module.service.aws_ssm_parameter.github_app_installation_id[0]'
  )

  for address in "${legacy_ssm_parameter_addresses[@]}"; do
    if resource_is_managed_in_state "$address"; then
      info "Removing legacy SSM parameter resource ${address} from OpenTofu state without deleting the parameter"
      tofu_cmd state rm "$address" >/dev/null
    fi
  done
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

put_secure_ssm_parameter() {
  local -r aws_region="$1"
  local -r parameter_name="$2"
  local -r parameter_value="$3"
  local -r description="$4"

  aws ssm put-parameter \
    --region "$aws_region" \
    --name "$parameter_name" \
    --description "$description" \
    --type SecureString \
    --value "$parameter_value" \
    --overwrite >/dev/null

  info "Updated SSM SecureString ${parameter_name}"
}

clear_github_runtime_secret_env() {
  unset GITHUB_WEBHOOK_SECRET || true
  unset GITHUB_TOKEN || true
  unset GITHUB_APP_ID || true
  unset GITHUB_APP_PRIVATE_KEY || true
  unset GITHUB_APP_INSTALLATION_ID || true
  unset TF_VAR_github_webhook_secret || true
  unset TF_VAR_github_token || true
  unset TF_VAR_github_app_id || true
  unset TF_VAR_github_app_private_key || true
  unset TF_VAR_github_app_installation_id || true
}

sync_github_runtime_ssm_parameters() {
  local aws_region
  local github_webhook_secret
  local github_token
  local github_app_id
  local github_app_private_key
  local github_app_installation_id
  local webhook_secret_parameter_name
  local token_parameter_name
  local app_id_parameter_name
  local app_private_key_parameter_name
  local app_installation_id_parameter_name

  aws_region="$(resolve_tofu_string 'var.aws_region')"
  github_webhook_secret="$(resolve_tofu_root_input_value GITHUB_WEBHOOK_SECRET github_webhook_secret)"
  github_token="$(resolve_tofu_root_input_value GITHUB_TOKEN github_token)"
  github_app_id="$(resolve_tofu_root_input_value GITHUB_APP_ID github_app_id)"
  github_app_private_key="$(resolve_tofu_root_input_value GITHUB_APP_PRIVATE_KEY github_app_private_key)"
  github_app_installation_id="$(resolve_tofu_root_input_value GITHUB_APP_INSTALLATION_ID github_app_installation_id)"

  if [[ -z "$github_webhook_secret" ]]; then
    error "Missing required deployment secret. Set GITHUB_WEBHOOK_SECRET in .env or export TF_VAR_github_webhook_secret."
  fi

  webhook_secret_parameter_name="$(resolve_tofu_string 'local.github_webhook_secret_ssm_parameter_name')"
  app_id_parameter_name="$(resolve_tofu_string 'local.github_app_id_ssm_parameter_name')"
  app_private_key_parameter_name="$(resolve_tofu_string 'local.github_app_private_key_ssm_parameter_name')"

  export TF_VAR_github_webhook_secret_ssm_parameter_name="$webhook_secret_parameter_name"
  export TF_VAR_github_app_id_ssm_parameter_name="$app_id_parameter_name"
  export TF_VAR_github_app_private_key_ssm_parameter_name="$app_private_key_parameter_name"

  put_secure_ssm_parameter \
    "$aws_region" \
    "$webhook_secret_parameter_name" \
    "$github_webhook_secret" \
    "GitHub webhook secret for PR Concierge runtime signature validation."
  put_secure_ssm_parameter \
    "$aws_region" \
    "$app_id_parameter_name" \
    "$github_app_id" \
    "GitHub App ID used by PR Concierge to mint installation tokens."
  put_secure_ssm_parameter \
    "$aws_region" \
    "$app_private_key_parameter_name" \
    "$github_app_private_key" \
    "GitHub App private key used by PR Concierge to mint installation tokens."

  if [[ -n "$github_token" ]]; then
    token_parameter_name="$(resolve_tofu_string 'coalesce(var.github_token_ssm_parameter_name, local.default_github_token_ssm_parameter_name)')"
    export TF_VAR_github_token_ssm_parameter_name="$token_parameter_name"
    put_secure_ssm_parameter \
      "$aws_region" \
      "$token_parameter_name" \
      "$github_token" \
      "Optional GitHub token fallback for PR Concierge runtime file reads."
  fi

  if [[ -n "$github_app_installation_id" ]]; then
    app_installation_id_parameter_name="$(resolve_tofu_string 'coalesce(var.github_app_installation_id_ssm_parameter_name, local.default_github_app_installation_id_ssm_parameter_name)')"
    export TF_VAR_github_app_installation_id_ssm_parameter_name="$app_installation_id_parameter_name"
    put_secure_ssm_parameter \
      "$aws_region" \
      "$app_installation_id_parameter_name" \
      "$github_app_installation_id" \
      "Optional GitHub App installation ID override for PR Concierge."
  fi

  clear_github_runtime_secret_env
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

info "Refreshing GitHub runtime values in encrypted SSM Parameter Store"
sync_github_runtime_ssm_parameters

forget_legacy_ssm_parameter_resources_if_present

import_legacy_service_resources_if_present

info "Applying the PR Concierge stack with variables from ${TOFU_VAR_FILE}"
tofu_cmd apply \
  -auto-approve \
  -input=false \
  -var-file="$TOFU_VAR_FILE" \
  "-var=artifact_path=$ARTIFACT_PATH"

write_deployment_output
