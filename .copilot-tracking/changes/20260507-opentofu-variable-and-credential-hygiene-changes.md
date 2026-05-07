<!-- markdownlint-disable-file -->

# OpenTofu Variable and Credential Hygiene Changes

## Status

- Started: 2026-05-07
- Prompt: `implement-opentofu-variable-and-credential-hygiene.prompt.md`
- Branch: `csv-deploy`

## Progress Log

### 2026-05-07

- Created this tracking file.
- Read the implementation plan, details, and research artifacts.
- Verified the current deploy and destroy scripts still generate one mixed temporary `*.tfvars.json` file for ordinary root inputs and app secrets.
- Verified the backend flow is already partially separated, but deploy and destroy still synthesize a temporary backend config instead of using a local partial-backend file convention.
- Verified `.env` already exists locally, so no placeholder `.env` file was needed for this task.
- Fetched the cited OpenTofu and AWS provider documentation for variable files, partial backend configuration, S3 backend auth, provider auth, and account guardrails.
- Refactored the repo toward four input lanes: non-secret root variables, backend coordinates, AWS authentication, and app secrets that still enter managed resources.
- Added checked-in example files at `infra/terraform/env/dev.auto.tfvars.example` and `infra/terraform/backend/dev.s3.tfbackend.example`.
- Added ignore rules for local `*.auto.tfvars` and `*.s3.tfbackend` files.
- Reworked `scripts/common.sh`, `scripts/deploy.sh`, and `scripts/destroy.sh` so deploy and destroy now read local tfvars and backend files, export only the remaining GitHub secrets through `TF_VAR_...`, and stop generating a mixed temporary `*.tfvars.json` blob.
- Updated `scripts/bootstrap-tofu-backend.sh` so it can use shell-exported backend bootstrap variables even when `.env` is absent.
- Added an optional `allowed_account_ids` root variable and wired it into the AWS provider as an account safety rail.
- Updated `.env.example`, `README.md`, `infra/terraform/README.md`, and `AGENTS.md` so the operator workflow matches the new file split and documents the remaining state exposure for Lambda environment secrets.
- Deleted the one-off implementation prompt from `.copilot-tracking/prompts/` after the work was complete.

## Changes made

- Non-secret OpenTofu root inputs now live in local `infra/terraform/env/<env>.auto.tfvars` files based on a checked-in example.
- Backend coordinates now live in local `infra/terraform/backend/<env>.s3.tfbackend` files based on a checked-in example.
- AWS credentials remain on the AWS credential chain and are documented as profile, SSO, assume-role, or OIDC inputs rather than repo-local config values.
- The only remaining environment-driven OpenTofu root inputs in the steady-state deploy and destroy flow are the GitHub secrets that still become Lambda environment variables.
- The docs now say plainly that `sensitive = true` redacts CLI output but does not remove those Lambda secrets from OpenTofu state.

## Validation Notes

- `bash -n scripts/common.sh scripts/bootstrap-tofu-backend.sh scripts/deploy.sh scripts/destroy.sh scripts/package-lambda.sh scripts/smoke-test.sh` — passed.
- `cd infra && tofu fmt -check -recursive` — passed.
- `cd infra/bootstrap/tofu-backend && tofu init -backend=false -input=false && tofu validate -no-color` — passed.
- `cd infra/terraform && tofu init -backend=false -input=false && tofu validate -no-color` — passed.
- `npm run test` — passed.
