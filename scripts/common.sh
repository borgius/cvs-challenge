#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
TOFU_ROOT="$REPO_ROOT/infra/terraform"
TOFU_BACKEND_BOOTSTRAP_ROOT="$REPO_ROOT/infra/bootstrap/tofu-backend"

info() {
  printf '==> %s\n' "$*"
}

warn() {
  printf 'warning: %s\n' "$*" >&2
}

error() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

handle_script_error() {
  local -r exit_code="$1"
  local -r line_number="$2"
  local -r failed_command="${3:-unknown command}"

  trap - ERR
  printf 'error: command failed with exit code %s at line %s: %s\n' \
    "$exit_code" "$line_number" "$failed_command" >&2
  exit "$exit_code"
}

enable_error_trap() {
  trap 'handle_script_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
}

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    error "Missing required command: ${command_name}"
  fi
}

require_tofu() {
  if ! command -v tofu >/dev/null 2>&1; then
    error "Missing required command: tofu. Install OpenTofu and re-run this script. See the repository README for setup guidance."
  fi
}

load_env() {
  local env_file="${1:-$REPO_ROOT/.env}"

  if [[ ! -f "$env_file" ]]; then
    error "Missing ${env_file}. Copy .env.example to .env and fill in the placeholders first."
  fi

  set -a
  # shellcheck source=/dev/null
  source "$env_file"
  set +a
}

load_env_if_present() {
  local env_file="${1:-$REPO_ROOT/.env}"

  if [[ ! -f "$env_file" ]]; then
    return
  fi

  set -a
  # shellcheck source=/dev/null
  source "$env_file"
  set +a
}

require_env() {
  local env_name="$1"

  if [[ -z "${!env_name:-}" ]]; then
    error "Missing required environment variable: ${env_name}"
  fi
}

require_file() {
  local -r file_path="$1"
  local -r error_message="${2:-Missing required file: ${file_path}}"

  if [[ ! -f "$file_path" ]]; then
    error "$error_message"
  fi
}

warn_if_placeholder() {
  local env_name="$1"
  local env_value="${!env_name:-}"

  if [[ -z "$env_value" || "$env_value" == "replace-me" ]]; then
    warn "${env_name} is still using a placeholder value."
  fi
}

normalize_bool() {
  local value="${1:-false}"
  local normalized_value

  normalized_value=$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')

  if [[ "$normalized_value" == "true" ]]; then
    printf 'true\n'
    return
  fi

  printf 'false\n'
}

make_temp_file() {
  local prefix="$1"
  local temp_root="${TMPDIR:-/tmp}"

  temp_root="${temp_root%/}"
  mktemp "${temp_root}/${prefix}.XXXXXX"
}

make_temp_dir() {
  local prefix="$1"
  local temp_root="${TMPDIR:-/tmp}"

  temp_root="${temp_root%/}"
  mktemp -d "${temp_root}/${prefix}.XXXXXX"
}

default_tofu_state_key() {
  local service_name="$1"
  local environment="$2"

  printf '%s/%s/terraform.tfstate\n' "$service_name" "$environment"
}

default_tofu_environment_name() {
  printf '%s\n' "${TOFU_ENVIRONMENT:-${ENVIRONMENT:-dev}}"
}

default_tofu_var_file() {
  local env_name="$1"

  printf '%s/env/%s.auto.tfvars\n' "$TOFU_ROOT" "$env_name"
}

resolve_tofu_var_file() {
  local env_name="$1"

  if [[ -n "${TOFU_VAR_FILE:-}" ]]; then
    printf '%s\n' "$TOFU_VAR_FILE"
    return
  fi

  default_tofu_var_file "$env_name"
}

default_tofu_backend_config_file() {
  local env_name="$1"

  printf '%s/backend/%s.s3.tfbackend\n' "$TOFU_ROOT" "$env_name"
}

resolve_tofu_backend_config_file() {
  local env_name="$1"

  if [[ -n "${TOFU_BACKEND_FILE:-}" ]]; then
    printf '%s\n' "$TOFU_BACKEND_FILE"
    return
  fi

  default_tofu_backend_config_file "$env_name"
}

export_tofu_root_secret_from_env() {
  local -r source_env_name="$1"
  local -r target_variable_name="$2"
  local -r target_env_name="TF_VAR_${target_variable_name}"
  local -r source_value="${!source_env_name:-}"
  local -r target_value="${!target_env_name:-}"

  if [[ -n "$target_value" ]]; then
    export "${target_env_name}=${target_value}"
    return
  fi

  if [[ -n "$source_value" ]]; then
    export "${target_env_name}=${source_value}"
    return
  fi

  error "Missing required deployment secret. Set ${source_env_name} in .env or export ${target_env_name}."
}

tofu_cmd_in_dir() {
  local tofu_root="$1"
  shift

  tofu -chdir="$tofu_root" "$@"
}

tofu_cmd() {
  tofu_cmd_in_dir "$TOFU_ROOT" "$@"
}

tofu_init_with_backend() {
  local backend_config_file="$1"

  tofu_cmd init \
    -input=false \
    -migrate-state \
    -force-copy \
    -backend-config="$backend_config_file"
}
