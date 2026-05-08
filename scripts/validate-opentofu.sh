#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"
enable_error_trap

require_tofu

validate_tofu_root() {
  local -r root_dir="$1"
  local -r label="$2"
  local -r test_filter="${3:-}"
  local -r tf_data_dir="$(make_temp_dir "validate-opentofu")"

  info "Initializing OpenTofu (${label})"
  TF_DATA_DIR="$tf_data_dir" tofu_cmd_in_dir "$root_dir" init -backend=false -input=false >/dev/null

  info "Validating OpenTofu (${label})"
  TF_DATA_DIR="$tf_data_dir" tofu_cmd_in_dir "$root_dir" validate -no-color

  if [[ -n "$test_filter" ]]; then
    info "Running OpenTofu validation tests (${label})"
    AWS_ACCESS_KEY_ID="validation-test-access-key" \
      AWS_SECRET_ACCESS_KEY="validation-test-secret-key" \
      AWS_SESSION_TOKEN="validation-test-session-token" \
      AWS_REGION="${AWS_REGION:-us-east-1}" \
      AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}" \
      AWS_EC2_METADATA_DISABLED=true \
      AWS_SDK_LOAD_CONFIG=0 \
      AWS_PROFILE="" \
      TF_DATA_DIR="$tf_data_dir" \
      tofu_cmd_in_dir "$root_dir" test \
        -filter="$test_filter" \
        -no-color
  fi

  rm -rf -- "$tf_data_dir"
}

info "Checking OpenTofu formatting"
tofu_cmd_in_dir "$REPO_ROOT/infra" fmt -check -recursive

validate_tofu_root \
  "$TOFU_BACKEND_BOOTSTRAP_ROOT" \
  "backend bootstrap root" \
  "tests/root_validation_unit_test.tftest.hcl"
validate_tofu_root "$TOFU_ROOT" "application stack"
validate_tofu_root \
  "$TOFU_ROOT/modules/http_api" \
  "HTTP API module" \
  "tests/root_validation_unit_test.tftest.hcl"

info "OpenTofu validation completed"
