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

## What this root provisions

- Lambda function for the Hono application
- API Gateway HTTP API with `GET /health` and `POST /webhooks/github`
- DynamoDB table for evaluation records
- optional S3 bucket for raw webhook archive storage
- SNS topic for alarm delivery
- CloudWatch alarms for Lambda `Errors` and HTTP API `5xx`

## Validation workflow

Use these commands from this directory when you want to validate the infrastructure locally:

- `tofu fmt -check`
- `tofu init -backend=false -input=false`
- `tofu validate`

The GitHub Actions deploy-readiness workflow runs the same validation steps, but it does not apply infrastructure changes.

## Operational notes

- The root uses a partial S3 backend. `scripts/deploy.sh` and `scripts/destroy.sh` generate a temporary `.tfbackend` file with `bucket`, `key`, `region`, `encrypt`, and `dynamodb_table`, then pass it to `tofu init`.
- The remote state bucket and DynamoDB lock table must exist before the first apply. `scripts/bootstrap-tofu-backend.sh` can create them through the separate local-state root in `infra/bootstrap/tofu-backend/`.
- `scripts/deploy.sh` writes `.artifacts/<service>-deployment.json` from the `deployment_summary` output.
- `scripts/destroy.sh` preserves DynamoDB and S3 data by default through targeted destroy. Set `DELETE_DATA=true` for full stack removal.
- The root accepts raw application secrets because the Lambda runtime still expects them as environment variables. OpenTofu marks them sensitive in CLI output, but they still exist in state.
