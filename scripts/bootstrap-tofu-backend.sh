#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"
enable_error_trap

require_tofu
require_command jq

load_env_if_present "${ENV_FILE:-$REPO_ROOT/.env}"

SERVICE_NAME="${SERVICE_NAME:-pr-concierge}"
ENVIRONMENT="$(default_tofu_environment_name)"
AWS_REGION="${AWS_REGION:-us-east-1}"
TOFU_STATE_BUCKET="${TOFU_STATE_BUCKET:-}"
TOFU_STATE_REGION="${TOFU_STATE_REGION:-$AWS_REGION}"
TOFU_LOCK_TABLE="${TOFU_LOCK_TABLE:-}"
TOFU_STATE_BUCKET_FORCE_DESTROY="$(normalize_bool "${TOFU_STATE_BUCKET_FORCE_DESTROY:-false}")"
TOFU_STATE_BUCKET_VERSIONING_ENABLED="$(normalize_bool "${TOFU_STATE_BUCKET_VERSIONING_ENABLED:-true}")"
TOFU_LOCK_TABLE_POINT_IN_TIME_RECOVERY_ENABLED="$(normalize_bool "${TOFU_LOCK_TABLE_POINT_IN_TIME_RECOVERY_ENABLED:-false}")"
TOFU_LOCK_TABLE_DELETION_PROTECTION_ENABLED="$(normalize_bool "${TOFU_LOCK_TABLE_DELETION_PROTECTION_ENABLED:-false}")"

require_env TOFU_STATE_BUCKET
require_env TOFU_LOCK_TABLE

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

bootstrap_tofu_cmd() {
  tofu_cmd_in_dir "$TOFU_BACKEND_BOOTSTRAP_ROOT" "$@"
}

create_tfvars_file() {
  local tfvars_base
  local tfvars_file

  tfvars_base=$(make_temp_file pr-concierge-backend-bootstrap)
  rm -f -- "$tfvars_base"
  tfvars_file="${tfvars_base}.tfvars.json"
  register_temp_file "$tfvars_file"

  jq -n \
    --arg awsRegion "$TOFU_STATE_REGION" \
    --arg environment "$ENVIRONMENT" \
    --arg serviceName "$SERVICE_NAME" \
    --arg stateBucket "$TOFU_STATE_BUCKET" \
    --arg lockTable "$TOFU_LOCK_TABLE" \
    --argjson stateBucketForceDestroy "$TOFU_STATE_BUCKET_FORCE_DESTROY" \
    --argjson stateBucketVersioningEnabled "$TOFU_STATE_BUCKET_VERSIONING_ENABLED" \
    --argjson lockTablePointInTimeRecoveryEnabled "$TOFU_LOCK_TABLE_POINT_IN_TIME_RECOVERY_ENABLED" \
    --argjson lockTableDeletionProtectionEnabled "$TOFU_LOCK_TABLE_DELETION_PROTECTION_ENABLED" \
    '{
      aws_region: $awsRegion,
      environment: $environment,
      service_name: $serviceName,
      tofu_state_bucket: $stateBucket,
      tofu_lock_table: $lockTable,
      tofu_state_bucket_force_destroy: $stateBucketForceDestroy,
      tofu_state_bucket_versioning_enabled: $stateBucketVersioningEnabled,
      tofu_lock_table_point_in_time_recovery_enabled: $lockTablePointInTimeRecoveryEnabled,
      tofu_lock_table_deletion_protection_enabled: $lockTableDeletionProtectionEnabled
    }' >"$tfvars_file"

  printf '%s\n' "$tfvars_file"
}

ensure_imported_resource() {
  local -r address="$1"
  local -r resource_id="$2"
  local -r description="$3"

  if bootstrap_tofu_cmd state show "$address" >/dev/null 2>&1; then
    info "Using managed ${description}"
    return
  fi

  if bootstrap_tofu_cmd import -input=false -var-file="$TFVARS_FILE" "$address" "$resource_id" >/dev/null 2>&1; then
    info "Imported existing ${description}"
    return
  fi

  info "No existing ${description} found; OpenTofu will create it"
}

write_bootstrap_summary() {
  local output_json

  output_json=$(bootstrap_tofu_cmd output -json)

  info "Backend bootstrap complete"
  printf 'State bucket: %s\n' "$(printf '%s' "$output_json" | jq -r '.tofu_state_bucket_name.value')"
  printf 'Lock table: %s\n' "$(printf '%s' "$output_json" | jq -r '.tofu_lock_table_name.value')"
  printf 'Suggested TOFU_STATE_KEY: %s\n' "$(default_tofu_state_key "$SERVICE_NAME" "$ENVIRONMENT")"
  printf 'Next step: %s\n' "scripts/deploy.sh"
}

TFVARS_FILE="$(create_tfvars_file)"

info "Initializing backend bootstrap root in ${TOFU_BACKEND_BOOTSTRAP_ROOT}"
bootstrap_tofu_cmd init -input=false

ensure_imported_resource "aws_s3_bucket.state" "$TOFU_STATE_BUCKET" "state bucket ${TOFU_STATE_BUCKET}"
ensure_imported_resource "aws_dynamodb_table.lock" "$TOFU_LOCK_TABLE" "lock table ${TOFU_LOCK_TABLE}"

info "Applying backend bootstrap resources in ${TOFU_STATE_REGION}"
bootstrap_tofu_cmd apply -auto-approve -input=false -var-file="$TFVARS_FILE"

write_bootstrap_summary
