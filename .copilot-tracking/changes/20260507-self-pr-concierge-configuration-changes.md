<!-- markdownlint-disable-file -->

# Self PR Concierge Configuration Changes

## Status

- Started: 2026-05-07
- Prompt: `implement-self-pr-concierge-configuration.prompt.md`
- Branch: `csv-deploy`

## Progress Log

### 2026-05-07

- Created this tracking file.
- Read the implementation prompt, plan, details, and research artifacts.
- Read the repository guidance in `AGENTS.md`, plus the current `README.md` and related architecture docs.
- Verified the existing deployment flow already writes `.artifacts/<service>-deployment.json` with `webhookUrl` and that `.env` already exists locally, so no placeholder `.env` file was needed for this task.
- Fetched the linked GitHub documentation for repository webhooks, event payloads, webhook creation, webhook editing, delivery validation, delivery handling, and webhook best practices.
- Confirmed the implementation should stay on an explicit, opt-in GitHub repository-admin lane rather than expanding the Lambda runtime `GITHUB_TOKEN` or hiding repository mutation inside `scripts/deploy.sh`.
- Added shared helpers in `scripts/common.sh` for deployment-summary paths, GitHub repository-slug resolution, GitHub operator-auth checks, and authenticated GitHub API calls.
- Added `scripts/configure-self-webhook.sh` as an idempotent operator script that reads `.artifacts/<service>-deployment.json`, reuses `GITHUB_WEBHOOK_SECRET`, creates or updates only the `pull_request` webhook, persists `.artifacts/<service>-github-webhook.json`, and surfaces ping plus delivery-inspection guidance.
- Updated `.env.example`, `README.md`, `infra/terraform/README.md`, and `AGENTS.md` so the docs describe the separate GitHub admin-auth lane, the explicit self-hook step after deploy, the generated metadata artifact, the optional deployed live-test proof, and the conditional required-label follow-up.
- Marked the new script executable locally and verified its help path without mutating GitHub repository settings.
- Deleted the one-off implementation prompt from `.copilot-tracking/prompts/` after the implementation was complete.

## Changes made

- `scripts/common.sh`
	- Added reusable helpers for deployment artifact paths, GitHub repository-slug normalization, GitHub operator-auth validation, and GitHub REST API calls.
- `scripts/configure-self-webhook.sh`
	- Added the explicit, idempotent self-webhook configuration flow for `pull_request` events.
- `.env.example`
	- Clarified that `GITHUB_WEBHOOK_SECRET` is reused for explicit self-hook configuration and that `GITHUB_TOKEN` remains runtime-only.
- `README.md`
	- Documented the self-PR-Concierge workflow, verification path, metadata artifact, and optional required-label follow-up.
- `infra/terraform/README.md`
	- Documented that self-hook configuration is a separate repository-mutation step and kept label bootstrap conditional.
- `AGENTS.md`
	- Aligned repository instructions with the new explicit self-hook workflow and separate GitHub admin-auth lane.
- `.copilot-tracking/prompts/implement-self-pr-concierge-configuration.prompt.md`
	- Deleted after completion, per the implementation prompt.

## Validation Notes

- `chmod +x scripts/configure-self-webhook.sh` — applied locally so the new script behaves like the other operator scripts.
- `bash -n scripts/common.sh scripts/configure-self-webhook.sh scripts/deploy.sh scripts/destroy.sh scripts/package-lambda.sh scripts/smoke-test.sh scripts/bootstrap-tofu-backend.sh` — passed.
- `bash scripts/configure-self-webhook.sh --help` — passed.
- `npm run build` — passed.
- `npm run test` — passed.
