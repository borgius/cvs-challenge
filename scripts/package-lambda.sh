#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"
enable_error_trap

require_command npm
require_command zip

DEFAULT_ARTIFACT_PATH="$REPO_ROOT/.artifacts/pr-concierge-lambda.zip"
REQUESTED_ARTIFACT_PATH="${1:-$DEFAULT_ARTIFACT_PATH}"
ARTIFACT_DIR="$(dirname -- "$REQUESTED_ARTIFACT_PATH")"
mkdir -p "$ARTIFACT_DIR"
ARTIFACT_PATH="$(cd -- "$ARTIFACT_DIR" && pwd -P)/$(basename -- "$REQUESTED_ARTIFACT_PATH")"
PACKAGE_ROOT="$(make_temp_dir pr-concierge-package)"

cleanup() {
  if [[ -d "${PACKAGE_ROOT:-}" ]]; then
    rm -rf -- "$PACKAGE_ROOT"
  fi
}

trap cleanup EXIT

info "Building the TypeScript project"
(
  cd "$REPO_ROOT"
  npm run build
)

info "Preparing the Lambda package"
cp "$REPO_ROOT/package.json" "$REPO_ROOT/package-lock.json" "$PACKAGE_ROOT/"
cp -R "$REPO_ROOT/dist" "$PACKAGE_ROOT/dist"

npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix "$PACKAGE_ROOT"

rm -f "$ARTIFACT_PATH"
(
  cd "$PACKAGE_ROOT"
  zip -qr "$ARTIFACT_PATH" dist node_modules package.json package-lock.json
)

info "Created Lambda artifact at $ARTIFACT_PATH"
printf '%s\n' "$ARTIFACT_PATH"
