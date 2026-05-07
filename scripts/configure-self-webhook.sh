#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"
enable_error_trap

usage() {
  cat <<'EOF'
Usage: scripts/configure-self-webhook.sh [OPTIONS]

Create or update the managed PR Concierge repository webhook for pull_request
events.

This script intentionally keeps GitHub repository-admin auth separate from the
Lambda runtime GITHUB_TOKEN. Use one of these operator-auth paths instead:

- authenticate with 'gh auth login' as a repository admin
- export GH_TOKEN from a fine-grained token with Webhooks: write

Options:
  --repository owner/repo   Override the target repository slug
  --deployment-output PATH  Override the deployment summary path
  --metadata-output PATH    Override the managed webhook metadata path
  --skip-ping               Skip the manual ping after an update
  -h, --help                Show this help text
EOF
}

resolve_webhook_url() {
  local -r deployment_output_path="$1"
  local webhook_url

  webhook_url="$(jq -er '.webhookUrl // empty' "$deployment_output_path")" || \
    error "Deployment summary at ${deployment_output_path} does not contain webhookUrl. Run scripts/deploy.sh first."

  if [[ ! "$webhook_url" =~ ^https://.+ ]]; then
    error "Resolved webhookUrl must be an absolute HTTPS URL. Received '${webhook_url}'."
  fi

  printf '%s\n' "$webhook_url"
}

validate_webhook_secret() {
  require_env GITHUB_WEBHOOK_SECRET

  if [[ "$GITHUB_WEBHOOK_SECRET" == 'replace-me' ]]; then
    error "GITHUB_WEBHOOK_SECRET is still set to the placeholder value. Update .env or export a real shared secret before configuring the repository webhook."
  fi
}

load_saved_hook_id() {
  local -r metadata_output_path="$1"
  local -r expected_repository="$2"
  local saved_repository=""
  local saved_hook_id=""

  if [[ ! -f "$metadata_output_path" ]]; then
    return
  fi

  saved_repository="$(jq -r '.repository // empty' "$metadata_output_path")"
  saved_hook_id="$(jq -r '.hookId // empty' "$metadata_output_path")"

  if [[ -n "$saved_repository" && "$saved_repository" != "$expected_repository" ]]; then
    error "Managed webhook metadata at ${metadata_output_path} targets ${saved_repository}, but this run resolved ${expected_repository}. Remove the metadata file or pass --repository owner/repo explicitly."
  fi

  if [[ "$saved_hook_id" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$saved_hook_id"
  fi
}

write_webhook_payload() {
  local -r payload_path="$1"
  local -r webhook_url="$2"
  local -r webhook_secret="$3"

  jq -n \
    --arg url "$webhook_url" \
    --arg secret "$webhook_secret" \
    '{
      name: "web",
      active: true,
      events: ["pull_request"],
      config: {
        url: $url,
        content_type: "json",
        secret: $secret,
        insecure_ssl: "0"
      }
    }' >"$payload_path"
}

persist_webhook_metadata() {
  local -r hook_json="$1"
  local -r repository_slug="$2"
  local -r webhook_url="$3"
  local -r deployment_output_path="$4"
  local -r metadata_output_path="$5"
  local -r configured_action="$6"
  local -r resolved_by="$7"

  mkdir -p "$(dirname -- "$metadata_output_path")"

  printf '%s' "$hook_json" | jq \
    --arg repository "$repository_slug" \
    --arg webhookUrl "$webhook_url" \
    --arg deploymentOutputPath "$deployment_output_path" \
    --arg metadataOutputPath "$metadata_output_path" \
    --arg configuredAt "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --arg configuredAction "$configured_action" \
    --arg resolvedBy "$resolved_by" \
    '{
      repository: $repository,
      hookId: .id,
      webhookUrl: $webhookUrl,
      hookApiUrl: .url,
      testUrl: .test_url,
      pingUrl: .ping_url,
      deliveriesUrl: .deliveries_url,
      active: .active,
      events: .events,
      contentType: .config.content_type,
      insecureSsl: .config.insecure_ssl,
      createdAt: .created_at,
      updatedAt: .updated_at,
      configuredAt: $configuredAt,
      configuredAction: $configuredAction,
      resolvedBy: $resolvedBy,
      deploymentOutputPath: $deploymentOutputPath,
      metadataOutputPath: $metadataOutputPath,
      lastResponse: .last_response
    }' >"$metadata_output_path"
}

print_recent_deliveries() {
  local -r owner="$1"
  local -r repo="$2"
  local -r hook_id="$3"

  local deliveries_json
  if ! deliveries_json="$(gh_api "repos/${owner}/${repo}/hooks/${hook_id}/deliveries?per_page=5" 2>/dev/null)"; then
    warn "Unable to read recent deliveries for hook ${hook_id}. You can inspect them later with gh api repos/${owner}/${repo}/hooks/${hook_id}/deliveries."
    return
  fi

  if [[ "$(printf '%s' "$deliveries_json" | jq 'length')" -eq 0 ]]; then
    info "Recent deliveries: none yet. GitHub may still be catching up."
    return
  fi

  info "Recent deliveries"
  printf '%s' "$deliveries_json" | jq -r '.[] | "- deliveryId=\(.id) event=\(.event) action=\(.action // "n/a") status=\(.status) statusCode=\(.status_code // "n/a") deliveredAt=\(.delivered_at)"'
}

print_verification_guidance() {
  local -r repository_slug="$1"
  local -r hook_id="$2"
  local -r metadata_output_path="$3"

  cat <<EOF
Managed webhook metadata: ${metadata_output_path}
Repository: ${repository_slug}
Hook ID: ${hook_id}

Inspect recent deliveries:
gh api "repos/${repository_slug}/hooks/${hook_id}/deliveries?per_page=10" --jq '.[] | {id, event, action, status, status_code, delivered_at}'

Inspect one delivery in detail:
gh api "repos/${repository_slug}/hooks/${hook_id}/deliveries/DELIVERY_ID"

Optional end-to-end proof against a real pull request:
DEPLOYED_WEBHOOK_SECRET=<same-secret> DEPLOYED_PR_REPOSITORY=${repository_slug} DEPLOYED_PR_NUMBER=<pr-number> npm run test:integration:deployed
EOF
}

require_command git
require_command jq
require_command gh

load_env_if_present "${ENV_FILE:-$REPO_ROOT/.env}"
unset GITHUB_TOKEN || true

repository_override=""
deployment_output_override=""
metadata_output_override=""
skip_ping="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repository)
      [[ $# -ge 2 ]] || error "--repository requires an owner/repo value."
      repository_override="${2:-}"
      shift 2
      ;;
    --deployment-output)
      [[ $# -ge 2 ]] || error "--deployment-output requires a file path."
      deployment_output_override="${2:-}"
      shift 2
      ;;
    --metadata-output)
      [[ $# -ge 2 ]] || error "--metadata-output requires a file path."
      metadata_output_override="${2:-}"
      shift 2
      ;;
    --skip-ping)
      skip_ping="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    *)
      error "Unknown option: $1"
      ;;
  esac
done

if [[ -n "$deployment_output_override" && ! -f "$deployment_output_override" ]]; then
  error "Deployment summary file not found: ${deployment_output_override}"
fi

SERVICE_NAME="${SERVICE_NAME:-pr-concierge}"
DEPLOYMENT_OUTPUT_PATH="${deployment_output_override:-$(default_deployment_output_path "$SERVICE_NAME")}"
METADATA_OUTPUT_PATH="${metadata_output_override:-$(default_github_webhook_metadata_path "$SERVICE_NAME")}"
REPOSITORY_SLUG="$(resolve_github_repository_slug "${repository_override:-${SELF_WEBHOOK_REPOSITORY:-${GH_REPO:-${GITHUB_REPOSITORY:-}}}}")"
REPOSITORY_OWNER="${REPOSITORY_SLUG%%/*}"
REPOSITORY_NAME="${REPOSITORY_SLUG#*/}"

require_file \
  "$DEPLOYMENT_OUTPUT_PATH" \
  "Missing deployment summary: ${DEPLOYMENT_OUTPUT_PATH}. Run scripts/deploy.sh first so the webhook URL is recorded under .artifacts/."
validate_webhook_secret
require_github_operator_auth

TEMP_DIR="$(make_temp_dir self-webhook-config)"
cleanup_temp_dir() {
  rm -rf -- "$TEMP_DIR"
}
trap cleanup_temp_dir EXIT

WEBHOOK_URL="$(resolve_webhook_url "$DEPLOYMENT_OUTPUT_PATH")"
SAVED_HOOK_ID="$(load_saved_hook_id "$METADATA_OUTPUT_PATH" "$REPOSITORY_SLUG" || true)"
HOOK_RESPONSE_JSON=""
RESOLVED_BY="new"
CONFIGURED_ACTION="create"

if [[ -n "$SAVED_HOOK_ID" ]]; then
  if HOOK_RESPONSE_JSON="$(gh_api "repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/hooks/${SAVED_HOOK_ID}" 2>/dev/null)"; then
    RESOLVED_BY="hook-id"
    CONFIGURED_ACTION="update"
  else
    warn "Saved hook ID ${SAVED_HOOK_ID} was not found in ${REPOSITORY_SLUG}. Falling back to an exact webhook URL lookup."
  fi
fi

if [[ -z "$HOOK_RESPONSE_JSON" ]]; then
  HOOKS_JSON="$(gh_api "repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/hooks?per_page=100")"
  URL_MATCHES_JSON="$(printf '%s' "$HOOKS_JSON" | jq --arg url "$WEBHOOK_URL" '[.[] | select(.config.url == $url)]')"
  URL_MATCH_COUNT="$(printf '%s' "$URL_MATCHES_JSON" | jq 'length')"

  if [[ "$URL_MATCH_COUNT" -gt 1 ]]; then
    printf '%s' "$URL_MATCHES_JSON" | jq -r '.[] | "hookId=\(.id) events=\(.events | join(",")) active=\(.active) deliveriesUrl=\(.deliveries_url)"' >&2
    error "Found multiple repository webhooks in ${REPOSITORY_SLUG} that already target ${WEBHOOK_URL}. Clean them up manually before rerunning this script."
  fi

  if [[ "$URL_MATCH_COUNT" -eq 1 ]]; then
    HOOK_RESPONSE_JSON="$(printf '%s' "$URL_MATCHES_JSON" | jq '.[0]')"
    RESOLVED_BY="webhook-url"
    CONFIGURED_ACTION="update"
  fi
fi

PAYLOAD_PATH="$TEMP_DIR/webhook-payload.json"
write_webhook_payload "$PAYLOAD_PATH" "$WEBHOOK_URL" "$GITHUB_WEBHOOK_SECRET"

if [[ "$CONFIGURED_ACTION" == 'update' ]]; then
  HOOK_ID="$(printf '%s' "$HOOK_RESPONSE_JSON" | jq -r '.id')"
  info "Updating managed pull_request webhook ${HOOK_ID} for ${REPOSITORY_SLUG}"
  HOOK_RESPONSE_JSON="$(gh_api --method PATCH "repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/hooks/${HOOK_ID}" --input "$PAYLOAD_PATH")"
else
  info "Creating managed pull_request webhook for ${REPOSITORY_SLUG}"
  HOOK_RESPONSE_JSON="$(gh_api --method POST "repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/hooks" --input "$PAYLOAD_PATH")"
fi

HOOK_ID="$(printf '%s' "$HOOK_RESPONSE_JSON" | jq -r '.id')"
persist_webhook_metadata \
  "$HOOK_RESPONSE_JSON" \
  "$REPOSITORY_SLUG" \
  "$WEBHOOK_URL" \
  "$DEPLOYMENT_OUTPUT_PATH" \
  "$METADATA_OUTPUT_PATH" \
  "$CONFIGURED_ACTION" \
  "$RESOLVED_BY"

if [[ "$CONFIGURED_ACTION" == 'create' ]]; then
  info "GitHub automatically sends a ping event after webhook creation."
elif [[ "$skip_ping" == 'true' ]]; then
  warn "Skipping manual ping because --skip-ping was requested."
else
  if gh_api --method POST "repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/hooks/${HOOK_ID}/pings" >/dev/null; then
    info "Triggered a GitHub ping event for hook ${HOOK_ID}."
  else
    warn "The webhook was updated, but the follow-up ping request failed. You can retry it with gh api repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/hooks/${HOOK_ID}/pings --method POST."
  fi
fi

info "Managed webhook metadata written to ${METADATA_OUTPUT_PATH}"
printf 'Repository: %s\n' "$REPOSITORY_SLUG"
printf 'Hook ID: %s\n' "$HOOK_ID"
printf 'Webhook URL: %s\n' "$WEBHOOK_URL"
print_recent_deliveries "$REPOSITORY_OWNER" "$REPOSITORY_NAME" "$HOOK_ID"
print_verification_guidance "$REPOSITORY_SLUG" "$HOOK_ID" "$METADATA_OUTPUT_PATH"