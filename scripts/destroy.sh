#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"
enable_error_trap

require_command aws

load_env "${ENV_FILE:-$REPO_ROOT/.env}"

SERVICE_NAME="${SERVICE_NAME:-pr-concierge}"
FUNCTION_NAME="${FUNCTION_NAME:-$SERVICE_NAME}"
ROLE_NAME="${ROLE_NAME:-${SERVICE_NAME}-lambda-role}"
API_NAME="${API_NAME:-${SERVICE_NAME}-http-api}"
AWS_REGION="${AWS_REGION:-us-east-1}"
DELETE_DATA="$(normalize_bool "${DELETE_DATA:-false}")"
INLINE_POLICY_NAME="${SERVICE_NAME}-runtime-access"
PARTITION=$(aws_partition "$AWS_REGION")

API_ID=$(aws apigatewayv2 get-apis --region "$AWS_REGION" --query "Items[?Name=='${API_NAME}'].ApiId | [0]" --output text)

if [[ "$API_ID" != "None" && -n "$API_ID" ]]; then
  info "Deleting HTTP API ${API_NAME}"
  aws apigatewayv2 delete-api --region "$AWS_REGION" --api-id "$API_ID"
else
  info "HTTP API ${API_NAME} does not exist"
fi

if aws lambda get-function --region "$AWS_REGION" --function-name "$FUNCTION_NAME" >/dev/null 2>&1; then
  info "Deleting Lambda function ${FUNCTION_NAME}"
  aws lambda delete-function --region "$AWS_REGION" --function-name "$FUNCTION_NAME"
else
  info "Lambda function ${FUNCTION_NAME} does not exist"
fi

if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  info "Removing IAM policies from ${ROLE_NAME}"
  aws iam delete-role-policy --role-name "$ROLE_NAME" --policy-name "$INLINE_POLICY_NAME" >/dev/null 2>&1 || true
  aws iam detach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn "arn:${PARTITION}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" \
    >/dev/null 2>&1 || true

  info "Deleting IAM role ${ROLE_NAME}"
  aws iam delete-role --role-name "$ROLE_NAME"
else
  info "IAM role ${ROLE_NAME} does not exist"
fi

if [[ "$DELETE_DATA" == "true" ]]; then
  require_env EVALUATIONS_TABLE_NAME

  if aws dynamodb describe-table --region "$AWS_REGION" --table-name "$EVALUATIONS_TABLE_NAME" >/dev/null 2>&1; then
    info "Deleting DynamoDB table ${EVALUATIONS_TABLE_NAME}"
    aws dynamodb delete-table --region "$AWS_REGION" --table-name "$EVALUATIONS_TABLE_NAME" >/dev/null
  fi

  if [[ -n "${RAW_EVENT_BUCKET_NAME:-}" ]]; then
    info "Deleting S3 bucket ${RAW_EVENT_BUCKET_NAME}"
    aws s3 rm "s3://${RAW_EVENT_BUCKET_NAME}" --recursive >/dev/null 2>&1 || true
    aws s3api delete-bucket --bucket "$RAW_EVENT_BUCKET_NAME" >/dev/null 2>&1 || true
  fi
else
  info "Keeping DynamoDB and S3 data resources. Re-run with DELETE_DATA=true to remove them too."
fi

info "Manual teardown complete"
