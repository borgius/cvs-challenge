# OpenTofu root

This directory is the source of truth for the PR Concierge AWS footprint.

The operator entrypoints still live in `scripts/deploy.sh` and `scripts/destroy.sh`, but those scripts now package the Lambda artifact and run OpenTofu against this root.

## Module layout

- `backend.tf` — partial S3 backend declaration populated by the deployment scripts at init time
- `main.tf` — root composition for service, API, data, and observability
- `variables.tf` — operator inputs and infrastructure tuning knobs
- `outputs.tf` — deployment outputs, including `deployment_summary`
- `modules/service/` — Lambda wrapper around `terraform-aws-modules/lambda/aws`
- `modules/http_api/` — HTTP API wrapper around `terraform-aws-modules/apigateway-v2/aws`
- `modules/data/` — DynamoDB and optional S3 wrapper modules
- `modules/observability/` — SNS topic plus CloudWatch metric alarms

## Input lanes

Use four distinct input lanes with this root:

- `env/<env>.auto.tfvars` — non-secret root variables such as naming, region, runtime tuning, data-protection flags, alarm settings, and the optional `allowed_account_ids` safety rail
- `backend/<env>.s3.tfbackend` — backend coordinates only, such as `bucket`, `key`, `region`, `encrypt`, and `dynamodb_table`
- the standard AWS credential chain — AWS profile, AWS SSO, assume-role, or OIDC/web identity for both the provider and the S3 backend
- `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, the optional `GITHUB_APP_INSTALLATION_ID`, and the optional `GITHUB_TOKEN` fallback — deployment-time values read by `scripts/deploy.sh` from `.env` or matching legacy `TF_VAR_...` exports so the script can refresh encrypted SSM parameters outside OpenTofu state. OpenTofu receives only SSM parameter names.

Keep AWS credentials out of `.env`, `*.auto.tfvars`, and `*.s3.tfbackend` files.

## What this root provisions

- Lambda function for the Hono application
- API Gateway HTTP API with `GET /health` and `POST /webhooks/github`
- DynamoDB table for evaluation records
- Lambda environment variables and IAM grants for encrypted SSM parameters that hold GitHub webhook and runtime auth inputs
- optional S3 bucket for raw webhook archive storage
- SNS topic for alarm delivery
- CloudWatch alarms for Lambda `Errors` and HTTP API `5xx`

## Validation workflow

Use `npm run validate:infra` from the repository root when you want the full OpenTofu validation pass.

That wrapper runs these checks for the application root, the backend bootstrap root, and the HTTP API wrapper module:

- `tofu fmt -check`
- `tofu init -backend=false -input=false`
- `tofu validate`
- `tofu test -filter=tests/root_validation_unit_test.tftest.hcl` for the module-level guardrail suites

The test files are plan-mode guardrails for input validation, so they do not need AWS credentials or create live resources. The full application root still uses backend-free `tofu validate` because upstream modules rely on live caller-identity data sources that do not mock cleanly today.

The GitHub Actions workflows run the same validation steps before deployment, but they do not apply infrastructure changes during the ordinary CI path.

## Operational notes

- The root uses a partial S3 backend. `scripts/deploy.sh` and `scripts/destroy.sh` read a local `backend/<env>.s3.tfbackend` file and pass it to `tofu init`.
- The same scripts read a local `env/<env>.auto.tfvars` file for non-secret root variables. `scripts/deploy.sh` reads GitHub runtime values separately and writes them to SSM before `tofu apply`.
- `scripts/deploy.sh` now fails early unless GitHub App credentials are present because the deployed runtime publishes GitHub check runs. `scripts/destroy.sh` can still proceed without those values because the root variables default to `null` when they are omitted.
- By default the deploy and destroy scripts use the `dev` files. Set `TOFU_ENVIRONMENT=<name>` to switch to another `<name>.auto.tfvars` and `<name>.s3.tfbackend` pair, or set `TOFU_VAR_FILE` and `TOFU_BACKEND_FILE` directly.
- The remote state bucket and DynamoDB lock table must exist before the first apply. `scripts/bootstrap-tofu-backend.sh` can create them through the separate local-state root in `infra/bootstrap/tofu-backend/`.
- `scripts/deploy.sh` writes `.artifacts/<service>-deployment.json` from the `deployment_summary` output.
- `scripts/configure-self-webhook.sh` is a separate, explicit repository-mutation step. It reads `.artifacts/<service>-deployment.json` to find the deployed `webhookUrl`, then creates or updates the managed repository webhook under a separate GitHub admin-auth lane.
- Keep label bootstrap conditional. If you leave `required_labels` empty, basic self-hook setup stops at webhook wiring. If you later set `required_labels`, create the matching GitHub labels as a separate repository task.
- `scripts/destroy.sh` preserves DynamoDB and S3 data by default through targeted destroy. Set `DELETE_DATA=true` for full stack removal.
- The root injects only SSM parameter names into the Lambda environment and grants `ssm:GetParameter`/`ssm:GetParameters` on those exact parameter ARNs. GitHub runtime values are refreshed by `scripts/deploy.sh` with AWS CLI calls, not by OpenTofu-managed `aws_ssm_parameter` resources.
