#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"
enable_error_trap

require_command aws
require_command jq
require_command npm
require_command zip

load_env "${ENV_FILE:-$REPO_ROOT/.env}"

SERVICE_NAME="${SERVICE_NAME:-pr-concierge}"
FUNCTION_NAME="${FUNCTION_NAME:-$SERVICE_NAME}"
ROLE_NAME="${ROLE_NAME:-${SERVICE_NAME}-lambda-role}"
API_NAME="${API_NAME:-${SERVICE_NAME}-http-api}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_LAMBDA_RUNTIME="${AWS_LAMBDA_RUNTIME:-nodejs20.x}"
AWS_LAMBDA_TIMEOUT="${AWS_LAMBDA_TIMEOUT:-30}"
AWS_LAMBDA_MEMORY_SIZE="${AWS_LAMBDA_MEMORY_SIZE:-256}"
ENABLE_RAW_EVENT_ARCHIVE="$(normalize_bool "${ENABLE_RAW_EVENT_ARCHIVE:-false}")"
LAMBDA_EVALUATION_REPOSITORY="dynamodb"
ARTIFACT_PATH="$REPO_ROOT/.artifacts/${FUNCTION_NAME}.zip"
DEPLOYMENT_OUTPUT_PATH="$REPO_ROOT/.artifacts/${SERVICE_NAME}-deployment.json"
INLINE_POLICY_NAME="${SERVICE_NAME}-runtime-access"

require_env GITHUB_WEBHOOK_SECRET
require_env GITHUB_TOKEN
require_env EVALUATIONS_TABLE_NAME
warn_if_placeholder GITHUB_WEBHOOK_SECRET
warn_if_placeholder GITHUB_TOKEN

ACCOUNT_ID=$(aws_account_id)
PARTITION=$(aws_partition "$AWS_REGION")
TABLE_ARN="arn:${PARTITION}:dynamodb:${AWS_REGION}:${ACCOUNT_ID}:table/${EVALUATIONS_TABLE_NAME}"
ROLE_ARN=""
FUNCTION_ARN=""
API_ID=""
API_ENDPOINT=""

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

ensure_dynamodb_table() {
  if aws dynamodb describe-table --region "$AWS_REGION" --table-name "$EVALUATIONS_TABLE_NAME" >/dev/null 2>&1; then
    info "Using existing DynamoDB table ${EVALUATIONS_TABLE_NAME}"
    return
  fi

  info "Creating DynamoDB table ${EVALUATIONS_TABLE_NAME}"
  aws dynamodb create-table \
    --region "$AWS_REGION" \
    --table-name "$EVALUATIONS_TABLE_NAME" \
    --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST \
    >/dev/null

  aws dynamodb wait table-exists --region "$AWS_REGION" --table-name "$EVALUATIONS_TABLE_NAME"
}

ensure_archive_bucket() {
  if [[ "$ENABLE_RAW_EVENT_ARCHIVE" != "true" ]]; then
    return
  fi

  if [[ -z "${RAW_EVENT_BUCKET_NAME:-}" ]]; then
    warn "ENABLE_RAW_EVENT_ARCHIVE is true, but RAW_EVENT_BUCKET_NAME is empty. Skipping S3 bucket creation."
    return
  fi

  if aws s3api head-bucket --bucket "$RAW_EVENT_BUCKET_NAME" >/dev/null 2>&1; then
    info "Using existing S3 bucket ${RAW_EVENT_BUCKET_NAME}"
    return
  fi

  info "Creating S3 bucket ${RAW_EVENT_BUCKET_NAME}"
  if [[ "$AWS_REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$RAW_EVENT_BUCKET_NAME" >/dev/null
    return
  fi

  aws s3api create-bucket \
    --bucket "$RAW_EVENT_BUCKET_NAME" \
    --create-bucket-configuration "LocationConstraint=${AWS_REGION}" \
    >/dev/null
}

ensure_lambda_role() {
  local trust_policy_file
  local inline_policy_file

  trust_policy_file=$(make_temp_file pr-concierge-trust-policy)
  inline_policy_file=$(make_temp_file pr-concierge-inline-policy)
  register_temp_file "$trust_policy_file"
  register_temp_file "$inline_policy_file"

  cat >"$trust_policy_file" <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
JSON

  if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
    info "Using existing IAM role ${ROLE_NAME}"
  else
    info "Creating IAM role ${ROLE_NAME}"
    aws iam create-role \
      --role-name "$ROLE_NAME" \
      --assume-role-policy-document "file://$trust_policy_file" \
      >/dev/null

    aws iam wait role-exists --role-name "$ROLE_NAME"
  fi

  aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn "arn:${PARTITION}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" \
    >/dev/null

  jq -n \
    --arg tableArn "$TABLE_ARN" \
    --arg archiveEnabled "$ENABLE_RAW_EVENT_ARCHIVE" \
    --arg bucketName "${RAW_EVENT_BUCKET_NAME:-}" \
    --arg partition "$PARTITION" \
    '{
      Version: "2012-10-17",
      Statement: (
        [
          {
            Effect: "Allow",
            Action: ["dynamodb:DescribeTable", "dynamodb:PutItem"],
            Resource: $tableArn
          }
        ] + (
          if $archiveEnabled == "true" and $bucketName != "" then
            [
              {
                Effect: "Allow",
                Action: ["s3:PutObject"],
                Resource: "arn:\($partition):s3:::\($bucketName)/*"
              }
            ]
          else
            []
          end
        )
      )
    }' >"$inline_policy_file"

  aws iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name "$INLINE_POLICY_NAME" \
    --policy-document "file://$inline_policy_file" \
    >/dev/null

  ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)
}

build_lambda_environment_file() {
  local environment_file="$1"

  jq -n \
    --arg webhookSecret "$GITHUB_WEBHOOK_SECRET" \
    --arg githubToken "$GITHUB_TOKEN" \
    --arg evaluationsTableName "$EVALUATIONS_TABLE_NAME" \
    --arg rawEventBucketName "${RAW_EVENT_BUCKET_NAME:-}" \
    --arg enableRawEventArchive "$ENABLE_RAW_EVENT_ARCHIVE" \
    --arg requiredLabels "${REQUIRED_LABELS:-}" \
    --arg evaluationRepository "$LAMBDA_EVALUATION_REPOSITORY" \
    '{
      Variables: {
        GITHUB_WEBHOOK_SECRET: $webhookSecret,
        GITHUB_TOKEN: $githubToken,
        EVALUATIONS_TABLE_NAME: $evaluationsTableName,
        RAW_EVENT_BUCKET_NAME: $rawEventBucketName,
        ENABLE_RAW_EVENT_ARCHIVE: $enableRawEventArchive,
        REQUIRED_LABELS: $requiredLabels,
        EVALUATION_REPOSITORY: $evaluationRepository
      }
    }' >"$environment_file"
}

ensure_lambda_function() {
  local environment_file

  environment_file=$(make_temp_file pr-concierge-lambda-environment)
  register_temp_file "$environment_file"

  build_lambda_environment_file "$environment_file"

  info "Packaging the Lambda artifact"
  "$SCRIPT_DIR/package-lambda.sh" "$ARTIFACT_PATH"

  if aws lambda get-function --region "$AWS_REGION" --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
    info "Updating Lambda code for ${FUNCTION_NAME}"
    aws lambda update-function-code \
      --region "$AWS_REGION" \
      --function-name "$FUNCTION_NAME" \
      --zip-file "fileb://${ARTIFACT_PATH}" \
      >/dev/null

    aws lambda wait function-updated-v2 --region "$AWS_REGION" --function-name "$FUNCTION_NAME"

    info "Updating Lambda configuration for ${FUNCTION_NAME}"
    aws lambda update-function-configuration \
      --region "$AWS_REGION" \
      --function-name "$FUNCTION_NAME" \
      --role "$ROLE_ARN" \
      --handler dist/index.handler \
      --runtime "$AWS_LAMBDA_RUNTIME" \
      --timeout "$AWS_LAMBDA_TIMEOUT" \
      --memory-size "$AWS_LAMBDA_MEMORY_SIZE" \
      --environment "file://${environment_file}" \
      >/dev/null

    aws lambda wait function-updated-v2 --region "$AWS_REGION" --function-name "$FUNCTION_NAME"
  else
    info "Creating Lambda function ${FUNCTION_NAME}"
    aws lambda create-function \
      --region "$AWS_REGION" \
      --function-name "$FUNCTION_NAME" \
      --role "$ROLE_ARN" \
      --handler dist/index.handler \
      --runtime "$AWS_LAMBDA_RUNTIME" \
      --timeout "$AWS_LAMBDA_TIMEOUT" \
      --memory-size "$AWS_LAMBDA_MEMORY_SIZE" \
      --environment "file://${environment_file}" \
      --zip-file "fileb://${ARTIFACT_PATH}" \
      >/dev/null

    aws lambda wait function-active-v2 --region "$AWS_REGION" --function-name "$FUNCTION_NAME"
  fi

  FUNCTION_ARN=$(aws lambda get-function --region "$AWS_REGION" --function-name "$FUNCTION_NAME" --query 'Configuration.FunctionArn' --output text)
}

ensure_http_api() {
  API_ID=$(aws apigatewayv2 get-apis --region "$AWS_REGION" --query "Items[?Name=='${API_NAME}'].ApiId | [0]" --output text)

  if [[ "$API_ID" == "None" || -z "$API_ID" ]]; then
    local create_api_output

    info "Creating HTTP API ${API_NAME}"
    create_api_output=$(aws apigatewayv2 create-api \
      --region "$AWS_REGION" \
      --name "$API_NAME" \
      --protocol-type HTTP \
      --target "$FUNCTION_ARN" \
      --output json)

    API_ID=$(printf '%s' "$create_api_output" | jq -r '.ApiId')
    API_ENDPOINT=$(printf '%s' "$create_api_output" | jq -r '.ApiEndpoint')
  else
    info "Using existing HTTP API ${API_NAME}"
    API_ENDPOINT=$(aws apigatewayv2 get-api --region "$AWS_REGION" --api-id "$API_ID" --query 'ApiEndpoint' --output text)
  fi
}

ensure_lambda_permission() {
  local statement_id
  local source_arn
  local permission_output

  statement_id="${FUNCTION_NAME//[^[:alnum:]]/-}-http-api-invoke"
  source_arn="arn:${PARTITION}:execute-api:${AWS_REGION}:${ACCOUNT_ID}:${API_ID}/*"

  if permission_output=$(aws lambda add-permission \
    --region "$AWS_REGION" \
    --function-name "$FUNCTION_NAME" \
    --statement-id "$statement_id" \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "$source_arn" 2>&1); then
    info "Granted API Gateway permission to invoke ${FUNCTION_NAME}"
    return
  fi

  if [[ "$permission_output" == *"ResourceConflictException"* || "$permission_output" == *"already exists"* ]]; then
    info "Lambda permission already exists for API Gateway"
    return
  fi

  error "$permission_output"
}

write_deployment_output() {
  local health_url webhook_url

  health_url="${API_ENDPOINT%/}/health"
  webhook_url="${API_ENDPOINT%/}/webhooks/github"

  mkdir -p "$REPO_ROOT/.artifacts"
  jq -n \
    --arg serviceName "$SERVICE_NAME" \
    --arg functionName "$FUNCTION_NAME" \
    --arg apiName "$API_NAME" \
    --arg apiId "$API_ID" \
    --arg apiEndpoint "$API_ENDPOINT" \
    --arg healthUrl "$health_url" \
    --arg webhookUrl "$webhook_url" \
    --arg evaluationsTableName "$EVALUATIONS_TABLE_NAME" \
    '{
      serviceName: $serviceName,
      functionName: $functionName,
      apiName: $apiName,
      apiId: $apiId,
      apiEndpoint: $apiEndpoint,
      healthUrl: $healthUrl,
      webhookUrl: $webhookUrl,
      evaluationsTableName: $evaluationsTableName
    }' >"$DEPLOYMENT_OUTPUT_PATH"

  info "Wrote deployment details to $DEPLOYMENT_OUTPUT_PATH"
  printf 'Health URL: %s\n' "$health_url"
  printf 'Webhook URL: %s\n' "$webhook_url"
}

info "Deploying ${SERVICE_NAME} into ${AWS_REGION}"
ensure_dynamodb_table
ensure_archive_bucket
ensure_lambda_role
ensure_lambda_function
ensure_http_api
ensure_lambda_permission
write_deployment_output
