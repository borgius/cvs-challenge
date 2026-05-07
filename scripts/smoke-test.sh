#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"
enable_error_trap

require_command curl

resolve_health_url() {
  local -r requested_url="${1:-}"
  local service_name
  local deployment_output_path
  local health_url

  if [[ -n "$requested_url" ]]; then
    printf '%s\n' "$requested_url"
    return
  fi

  require_command jq
  load_env_if_present "${ENV_FILE:-$REPO_ROOT/.env}"

  service_name="${SERVICE_NAME:-pr-concierge}"
  deployment_output_path="$(default_deployment_output_path "$service_name")"

  if [[ ! -f "$deployment_output_path" ]]; then
    error "No health URL argument was provided and ${deployment_output_path} does not exist. Deploy first or pass the URL explicitly."
  fi

  if ! health_url=$(jq -er '.healthUrl // empty' "$deployment_output_path"); then
    error "Deployment output file ${deployment_output_path} is missing a valid healthUrl."
  fi

  printf '%s\n' "$health_url"
}

HEALTH_URL="$(resolve_health_url "${1:-}")"

info "Calling ${HEALTH_URL}"
curl --fail --silent --show-error "$HEALTH_URL"
printf '\n'
