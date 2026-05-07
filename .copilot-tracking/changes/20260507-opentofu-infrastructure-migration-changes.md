<!-- markdownlint-disable-file -->

# OpenTofu Infrastructure Migration Changes

## Status

- Started: 2026-05-07
- Prompt: `implement-opentofu-infrastructure-migration.prompt.md`
- Branch: `main`

## Progress Log

### 2026-05-07

- Created the migration tracking file.
- Read the implementation plan, details, and research artifacts.
- Verified the current deployment path is still Bash plus AWS CLI and that `infra/terraform/` is only starter scaffolding.
- Verified `.env` already exists locally, so no placeholder `.env` file needed for this task.
- Fetched the referenced OpenTofu documentation for module structure, local module paths, `-chdir`, and automation flags.
- Expanded `infra/terraform/` into a real OpenTofu root with full variables, outputs, and a `deployment_summary` output.
- Added local wrapper modules for the Lambda service, HTTP API, data resources, and observability resources under `infra/terraform/modules/`.
- Replaced AWS CLI provisioning in `scripts/deploy.sh` and `scripts/destroy.sh` with OpenTofu automation while preserving the existing `.artifacts/` deployment summary contract.
- Updated `README.md`, `infra/terraform/README.md`, `AGENTS.md`, `.env.example`, `docs/project-overview.md`, and `.github/workflows/deploy.yml` so the repository describes OpenTofu as the active deployment path.
- Refreshed `infra/terraform/.terraform.lock.hcl` with OpenTofu-managed provider selections compatible with the new upstream modules.
- Deleted the one-off implementation prompt from `.copilot-tracking/prompts/` after the migration checklist was completed.
- Added partial S3 backend configuration for `infra/terraform/` and taught the deploy and destroy scripts to generate temporary `.tfbackend` files that use S3 state plus DynamoDB locking.
- Added the one-time backend bootstrap root under `infra/bootstrap/tofu-backend/` and wrapped it with `scripts/bootstrap-tofu-backend.sh` so the remote state bucket and lock table can be created or imported before the first deploy.
- Updated the repo docs, environment template, and deploy-readiness workflow so both OpenTofu roots are validated and the backend bootstrap path is part of the documented operator flow.
- Generated and checked in `infra/bootstrap/tofu-backend/.terraform.lock.hcl` after validating the new bootstrap root.

## Planned Work

- Expand `infra/terraform/` into a real OpenTofu root with full variables, outputs, and module composition.
- Add local wrapper modules for service, HTTP API, data, and observability.
- Replace AWS CLI provisioning in `scripts/deploy.sh` and `scripts/destroy.sh` with `tofu` automation.
- Update docs and workflow messaging so OpenTofu is the active deployment path.
- Run the relevant validation commands and capture the outcomes.

## Validation Notes

- `tofu fmt -check -recursive` — passed after formatting fixes.
- `tofu init -backend=false -input=false -upgrade` — passed and refreshed `.terraform.lock.hcl`.
- `tofu validate -no-color` — passed.
- `npm run build` — passed.
- `npm run test` — passed.
- `bash -n scripts/common.sh scripts/bootstrap-tofu-backend.sh scripts/deploy.sh scripts/destroy.sh scripts/package-lambda.sh scripts/smoke-test.sh` — passed.
- `cd infra/bootstrap/tofu-backend && tofu init -backend=false -input=false && tofu validate -no-color` — passed.
- `cd infra/terraform && tofu init -backend=false -input=false && tofu validate -no-color` — passed after the backend bootstrap additions.
