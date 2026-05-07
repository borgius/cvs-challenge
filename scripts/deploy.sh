#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"
enable_error_trap

require_tofu
require_command jq
require_command npm
require_command zip

load_env "${ENV_FILE:-$REPO_ROOT/.env}"

SERVICE_NAME="${SERVICE_NAME:-pr-concierge}"
FUNCTION_NAME="${FUNCTION_NAME:-$SERVICE_NAME}"
API_NAME="${API_NAME:-${SERVICE_NAME}-http-api}"
ROLE_NAME="${ROLE_NAME:-${SERVICE_NAME}-lambda-role}"
ALARM_TOPIC_NAME="${ALARM_TOPIC_NAME:-${SERVICE_NAME}-alarms}"
ENVIRONMENT="${ENVIRONMENT:-dev}"
AWS_REGION="${AWS_REGION:-us-east-1}"
TOFU_STATE_BUCKET="${TOFU_STATE_BUCKET:-}"
TOFU_STATE_KEY="${TOFU_STATE_KEY:-$(default_tofu_state_key "$SERVICE_NAME" "$ENVIRONMENT")}"
TOFU_STATE_REGION="${TOFU_STATE_REGION:-$AWS_REGION}"
TOFU_LOCK_TABLE="${TOFU_LOCK_TABLE:-}"
AWS_LAMBDA_RUNTIME="${AWS_LAMBDA_RUNTIME:-nodejs20.x}"
AWS_LAMBDA_HANDLER="${AWS_LAMBDA_HANDLER:-dist/index.handler}"
AWS_LAMBDA_TIMEOUT="${AWS_LAMBDA_TIMEOUT:-30}"
AWS_LAMBDA_MEMORY_SIZE="${AWS_LAMBDA_MEMORY_SIZE:-256}"
LAMBDA_LOG_RETENTION_IN_DAYS="${LAMBDA_LOG_RETENTION_IN_DAYS:-14}"
API_STAGE_NAME="${API_STAGE_NAME:-\$default}"
API_ACCESS_LOG_RETENTION_IN_DAYS="${API_ACCESS_LOG_RETENTION_IN_DAYS:-14}"
API_INTEGRATION_TIMEOUT_MILLISECONDS="${API_INTEGRATION_TIMEOUT_MILLISECONDS:-29000}"
ENABLE_RAW_EVENT_ARCHIVE="$(normalize_bool "${ENABLE_RAW_EVENT_ARCHIVE:-false}")"
DYNAMODB_POINT_IN_TIME_RECOVERY_ENABLED="$(normalize_bool "${DYNAMODB_POINT_IN_TIME_RECOVERY_ENABLED:-true}")"
DYNAMODB_DELETION_PROTECTION_ENABLED="$(normalize_bool "${DYNAMODB_DELETION_PROTECTION_ENABLED:-false}")"
DYNAMODB_SERVER_SIDE_ENCRYPTION_ENABLED="$(normalize_bool "${DYNAMODB_SERVER_SIDE_ENCRYPTION_ENABLED:-true}")"
RAW_EVENT_BUCKET_FORCE_DESTROY="$(normalize_bool "${RAW_EVENT_BUCKET_FORCE_DESTROY:-false}")"
RAW_EVENT_BUCKET_VERSIONING_ENABLED="$(normalize_bool "${RAW_EVENT_BUCKET_VERSIONING_ENABLED:-true}")"
ALARM_EMAIL_SUBSCRIPTIONS_JSON="$(csv_to_json_array "${ALARM_EMAIL_ENDPOINTS:-}")"
ARTIFACT_PATH="$REPO_ROOT/.artifacts/${FUNCTION_NAME}.zip"
DEPLOYMENT_OUTPUT_PATH="$REPO_ROOT/.artifacts/${SERVICE_NAME}-deployment.json"
LAMBDA_EVALUATION_REPOSITORY="dynamodb"

require_env GITHUB_WEBHOOK_SECRET
require_env GITHUB_TOKEN
require_env EVALUATIONS_TABLE_NAME
require_env TOFU_STATE_BUCKET
require_env TOFU_LOCK_TABLE
warn_if_placeholder GITHUB_WEBHOOK_SECRET
warn_if_placeholder GITHUB_TOKEN

declare -a TEMP_FILES=()

register_temp_file() {
  local -r temp_file="$1"

  TEMP_FILES+=("$temp_file")
}

cleanup_temp_files() {
  local temp_file

  for temp_file in "${TEMP_FILES[@]}"; do
    if [[ -n "$temp_file" && -e "$temp_file" ]]; then
      rm -f -- "$temp_file"
    fi
  done
}

trap cleanup_temp_files EXIT

create_tfvars_file() {
  local tfvars_base
  local tfvars_file

  tfvars_base=$(make_temp_file pr-concierge-tfvars)
  rm -f -- "$tfvars_base"
  tfvars_file="${tfvars_base}.tfvars.json"
  register_temp_file "$tfvars_file"

  jq -n \
    --arg awsRegion "$AWS_REGION" \
    --arg environment "$ENVIRONMENT" \
    --arg serviceName "$SERVICE_NAME" \
    --arg functionName "$FUNCTION_NAME" \
    --arg lambdaRoleName "$ROLE_NAME" \
    --arg apiName "$API_NAME" \
    --arg alarmTopicName "$ALARM_TOPIC_NAME" \
    --arg artifactPath "$ARTIFACT_PATH" \
    --arg runtime "$AWS_LAMBDA_RUNTIME" \
    --arg handler "$AWS_LAMBDA_HANDLER" \
    --argjson timeout "$AWS_LAMBDA_TIMEOUT" \
    --argjson memorySize "$AWS_LAMBDA_MEMORY_SIZE" \
    --argjson lambdaLogRetentionInDays "$LAMBDA_LOG_RETENTION_IN_DAYS" \
    --arg apiStageName "$API_STAGE_NAME" \
    --argjson apiAccessLogRetentionInDays "$API_ACCESS_LOG_RETENTION_IN_DAYS" \
    --argjson apiIntegrationTimeoutMilliseconds "$API_INTEGRATION_TIMEOUT_MILLISECONDS" \
    --arg githubWebhookSecret "$GITHUB_WEBHOOK_SECRET" \
    --arg githubToken "$GITHUB_TOKEN" \
    --arg evaluationsTableName "$EVALUATIONS_TABLE_NAME" \
    --arg rawEventBucketName "${RAW_EVENT_BUCKET_NAME:-}" \
    --argjson enableRawEventArchive "$ENABLE_RAW_EVENT_ARCHIVE" \
    --arg requiredLabels "${REQUIRED_LABELS:-}" \
    --arg evaluationRepository "$LAMBDA_EVALUATION_REPOSITORY" \
    --argjson dynamodbPointInTimeRecoveryEnabled "$DYNAMODB_POINT_IN_TIME_RECOVERY_ENABLED" \
    --argjson dynamodbDeletionProtectionEnabled "$DYNAMODB_DELETION_PROTECTION_ENABLED" \
    --argjson dynamodbServerSideEncryptionEnabled "$DYNAMODB_SERVER_SIDE_ENCRYPTION_ENABLED" \
    --argjson rawEventBucketForceDestroy "$RAW_EVENT_BUCKET_FORCE_DESTROY" \
    --argjson rawEventBucketVersioningEnabled "$RAW_EVENT_BUCKET_VERSIONING_ENABLED" \
    --argjson alarmEmailSubscriptions "$ALARM_EMAIL_SUBSCRIPTIONS_JSON" \
    '{
      aws_region: $awsRegion,
      environment: $environment,
      service_name: $serviceName,
      function_name: $functionName,
      lambda_role_name: $lambdaRoleName,
      api_name: $apiName,
      alarm_topic_name: $alarmTopicName,
      artifact_path: $artifactPath,
      aws_lambda_runtime: $runtime,
      aws_lambda_handler: $handler,
      aws_lambda_timeout: $timeout,
      aws_lambda_memory_size: $memorySize,
      lambda_log_retention_in_days: $lambdaLogRetentionInDays,
      api_stage_name: $apiStageName,
      api_access_log_retention_in_days: $apiAccessLogRetentionInDays,
      api_integration_timeout_milliseconds: $apiIntegrationTimeoutMilliseconds,
      github_webhook_secret: $githubWebhookSecret,
      github_token: $githubToken,
      evaluations_table_name: $evaluationsTableName,
      raw_event_bucket_name: ($rawEventBucketName | if length == 0 then null else . end),
      enable_raw_event_archive: $enableRawEventArchive,
      required_labels: $requiredLabels,
      evaluation_repository: $evaluationRepository,
      dynamodb_point_in_time_recovery_enabled: $dynamodbPointInTimeRecoveryEnabled,
      dynamodb_deletion_protection_enabled: $dynamodbDeletionProtectionEnabled,
      dynamodb_server_side_encryption_enabled: $dynamodbServerSideEncryptionEnabled,
      raw_event_bucket_force_destroy: $rawEventBucketForceDestroy,
      raw_event_bucket_versioning_enabled: $rawEventBucketVersioningEnabled,
      alarm_email_subscriptions: $alarmEmailSubscriptions
    }' >"$tfvars_file"

  printf '%s\n' "$tfvars_file"
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

TFVARS_FILE="$(create_tfvars_file)"
BACKEND_CONFIG_FILE="$(create_tofu_backend_config_file "$TOFU_STATE_BUCKET" "$TOFU_STATE_KEY" "$TOFU_STATE_REGION" "$TOFU_LOCK_TABLE")"
register_temp_file "$BACKEND_CONFIG_FILE"

info "Initializing OpenTofu in ${TOFU_ROOT} with remote state s3://${TOFU_STATE_BUCKET}/${TOFU_STATE_KEY}"
tofu_init_with_backend "$BACKEND_CONFIG_FILE"

info "Applying the PR Concierge stack in ${AWS_REGION}"
tofu_cmd apply -auto-approve -input=false -var-file="$TFVARS_FILE"

write_deployment_output
