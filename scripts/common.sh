#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"

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

require_env() {
  local env_name="$1"

  if [[ -z "${!env_name:-}" ]]; then
    error "Missing required environment variable: ${env_name}"
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

aws_account_id() {
  aws sts get-caller-identity --query 'Account' --output text
}

aws_partition() {
  local region="$1"

  case "$region" in
    cn-*)
      printf 'aws-cn\n'
      ;;
    us-gov-*)
      printf 'aws-us-gov\n'
      ;;
    *)
      printf 'aws\n'
      ;;
  esac
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
