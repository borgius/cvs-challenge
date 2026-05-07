# PR Concierge

PR Concierge is a small internal platform service for pull request hygiene and release awareness.
It accepts GitHub pull request webhooks, validates the signature, applies a few deterministic platform rules, scores PR risk from changed files, and produces a short summary that developers can act on.

The HTTP layer now runs on [Hono](https://hono.dev/) so the project uses Hono routing, JSON helpers, AWS Lambda integration, and built-in middleware instead of custom response and handler modules.

## What is included

- Hono app with `GET /health` and `POST /webhooks/github`
- AWS Lambda export via `hono/aws-lambda`
- local Node.js server via `@hono/node-server`
- Hono middleware for request IDs, access logging, pretty JSON, and secure headers
- deterministic risk scoring from changed file paths
- branch naming and optional required-label checks
- structured JSON logging
- DynamoDB-backed evaluation persistence for deployed environments, with console logging available for local development
- OpenTofu root configuration and local wrapper modules for Lambda, HTTP API, DynamoDB, optional S3, SNS, and CloudWatch alarms
- a separate OpenTofu bootstrap root for the remote state bucket and DynamoDB lock table
- deployment scripts in `scripts/` that bootstrap the backend once, package the Lambda artifact, and drive `tofu init`, `tofu apply`, and `tofu destroy`
- Vitest integration suites for the local Lambda handler and the deployed HTTP API
- GitHub Actions workflows that build, test, and validate the OpenTofu roots

## Quick start

1. Copy `.env.example` to `.env` if the file does not already exist.
2. Fill in the placeholders in `.env`.
3. Install dependencies with `npm install` if you have not already.
4. Build the project with `npm run build`.
5. Run `npm test` to type-check the app and execute the local Lambda integration suite.
6. Run `npm run dev` to start the local Hono server on port `3000`.
7. Call `GET /health` or send a GitHub webhook to `POST /webhooks/github`.

## Integration tests

The repository now ships with two Vitest integration projects:

- `npm test` — type-checks the production source, type-checks the test harness, and runs the local Lambda integration suite
- `npm run test:integration:local` — runs only the local Lambda integration suite
- `npm run test:integration:deployed` — runs the deployed HTTP API integration suite

### Local Lambda suite

The local suite invokes the exported `handler` from `src/index.ts` with API Gateway HTTP API v2 events. It does not start the Node dev server, does not require AWS credentials, and keeps `EVALUATION_REPOSITORY=console` so webhook evaluations stay deterministic.

### Deployed HTTP API suite

The deployed suite resolves target URLs in this order:

1. `DEPLOYED_HEALTH_URL` and `DEPLOYED_WEBHOOK_URL`
2. `.artifacts/<service>-deployment.json`, which `scripts/deploy.sh` writes after a successful deploy

The safe-by-default deployed checks cover:

- `GET /health`
- empty-body webhook rejection
- invalid-signature webhook rejection

To opt into the real deployed webhook success path, set these environment variables before running `npm run test:integration:deployed`:

- `DEPLOYED_WEBHOOK_SECRET`
- `DEPLOYED_PR_REPOSITORY`
- `DEPLOYED_PR_NUMBER`

Optional overrides for the live success-path payload are also supported:

- `DEPLOYED_PR_BRANCH_NAME`
- `DEPLOYED_PR_BASE_BRANCH`
- `DEPLOYED_PR_HEAD_SHA`
- `DEPLOYED_PR_LABELS`

If the URL overrides and deployment summary are both missing, the deployed suite stops with a clear resolution error. If the live webhook variables are missing, the success-path test is skipped.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GITHUB_WEBHOOK_SECRET` | Yes | Validates the `x-hub-signature-256` header from GitHub |
| `GITHUB_TOKEN` | Yes | Reads changed files from the GitHub REST API |
| `AWS_REGION` | No | Default AWS region for local AWS clients and OpenTofu provider configuration |
| `EVALUATIONS_TABLE_NAME` | Yes | Target DynamoDB table name |
| `RAW_EVENT_BUCKET_NAME` | No | Optional S3 bucket name for raw webhook archiving |
| `ENABLE_RAW_EVENT_ARCHIVE` | No | Enables raw event S3 key generation when set to `true` |
| `REQUIRED_LABELS` | No | Comma-separated labels to enforce, such as `safe-to-deploy,needs-platform-review` |
| `EVALUATION_REPOSITORY` | No | `console` for local logging or `dynamodb` for deployed persistence |

## Deployment overrides

These optional variables tune naming and infrastructure behavior for `scripts/deploy.sh` and `scripts/destroy.sh`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `ENVIRONMENT` | No | Environment label used in shared tags |
| `SERVICE_NAME` | No | Base name used for resources and artifacts |
| `FUNCTION_NAME` | No | Override for the Lambda function name |
| `ROLE_NAME` | No | Override for the Lambda execution role name |
| `API_NAME` | No | Override for the HTTP API name |
| `ALARM_TOPIC_NAME` | No | Override for the SNS alarm topic name |
| `ALARM_EMAIL_ENDPOINTS` | No | Comma-separated email subscriptions for the alarm topic |
| `AWS_LAMBDA_RUNTIME` | No | Lambda runtime override |
| `AWS_LAMBDA_HANDLER` | No | Lambda handler override |
| `AWS_LAMBDA_TIMEOUT` | No | Lambda timeout in seconds |
| `AWS_LAMBDA_MEMORY_SIZE` | No | Lambda memory size in MB |
| `LAMBDA_LOG_RETENTION_IN_DAYS` | No | Lambda log retention period |
| `API_STAGE_NAME` | No | HTTP API stage name; defaults to `$default` |
| `API_ACCESS_LOG_RETENTION_IN_DAYS` | No | HTTP API access log retention period |
| `API_INTEGRATION_TIMEOUT_MILLISECONDS` | No | Lambda integration timeout for API routes |
| `DYNAMODB_POINT_IN_TIME_RECOVERY_ENABLED` | No | Enables DynamoDB point-in-time recovery |
| `DYNAMODB_DELETION_PROTECTION_ENABLED` | No | Enables DynamoDB deletion protection |
| `DYNAMODB_SERVER_SIDE_ENCRYPTION_ENABLED` | No | Enables DynamoDB server-side encryption |
| `RAW_EVENT_BUCKET_FORCE_DESTROY` | No | Allows full destroy to remove a non-empty archive bucket |
| `RAW_EVENT_BUCKET_VERSIONING_ENABLED` | No | Enables archive bucket versioning |

## OpenTofu state backend

These variables tell the deployment scripts where to keep OpenTofu state. The backend resources must exist before the first deploy because OpenTofu cannot bootstrap the backend it is currently using.

| Variable | Required | Purpose |
| --- | --- | --- |
| `TOFU_STATE_BUCKET` | Yes | Existing S3 bucket used for remote OpenTofu state |
| `TOFU_LOCK_TABLE` | Yes | Existing DynamoDB table with a string partition key named `LockID` used for state locking |
| `TOFU_STATE_KEY` | No | Object key for the state file; defaults to `<service>/<environment>/terraform.tfstate` |
| `TOFU_STATE_REGION` | No | Region for the S3 bucket and DynamoDB lock table; defaults to `AWS_REGION` |
| `TOFU_STATE_BUCKET_FORCE_DESTROY` | No | Allows the one-time backend bootstrap root to remove a non-empty state bucket during destroy |
| `TOFU_STATE_BUCKET_VERSIONING_ENABLED` | No | Enables versioning on the backend state bucket |
| `TOFU_LOCK_TABLE_POINT_IN_TIME_RECOVERY_ENABLED` | No | Enables point-in-time recovery on the backend lock table |
| `TOFU_LOCK_TABLE_DELETION_PROTECTION_ENABLED` | No | Enables deletion protection on the backend lock table |

## Bootstrap the backend once

If the remote backend resources do not exist yet, run `scripts/bootstrap-tofu-backend.sh` first.

That script wraps the local-state OpenTofu root in `infra/bootstrap/tofu-backend/`, creates the S3 bucket and DynamoDB lock table, and tries to import those resources if they already exist.

The bootstrap root keeps its own local state file at `infra/bootstrap/tofu-backend/.bootstrap.tfstate`, which is gitignored.

## OpenTofu deployment

The supported deployment path in this repo is Bash automation backed by OpenTofu.

Prerequisites:

- AWS credentials that the OpenTofu AWS provider can use
- OpenTofu installed and available as `tofu`
- either existing backend resources or the ability to run `scripts/bootstrap-tofu-backend.sh` once first
- `jq`
- `zip`
- `npm`

Scripts:

- `scripts/bootstrap-tofu-backend.sh` — creates or imports the S3 bucket and DynamoDB lock table used by the OpenTofu backend
- `scripts/package-lambda.sh` — builds the app and creates a Lambda zip in `.artifacts/`
- `scripts/deploy.sh` — packages the app, generates temporary `.tfvars.json` and `.tfbackend` files, runs `tofu init` against the configured S3 backend, runs `tofu apply`, and writes `.artifacts/<service>-deployment.json`
- `scripts/smoke-test.sh` — calls the deployed `GET /health` endpoint
- `scripts/destroy.sh` — reuses the configured S3 backend, then runs targeted `tofu destroy` by default to preserve DynamoDB and S3 data; set `DELETE_DATA=true` for a full stack destroy

Notes:

- The deploy script forces the Lambda environment to use DynamoDB persistence.
- The backend bootstrap script uses a separate local-state root because OpenTofu cannot create the backend it is currently using.
- The deploy and destroy scripts stop early with a clear error if `tofu` is not installed.
- The deploy and destroy scripts also stop early if `TOFU_STATE_BUCKET` or `TOFU_LOCK_TABLE` is missing.
- The scripts pass `dynamodb_table` into the S3 backend, so OpenTofu state locking uses DynamoDB rather than native S3 lockfiles.
- The root OpenTofu module emits a `deployment_summary` output, and `scripts/deploy.sh` persists it to `.artifacts/<service>-deployment.json` for operators and follow-on scripts.
- If `GITHUB_WEBHOOK_SECRET` or `GITHUB_TOKEN` still use placeholder values, deployment can still complete, but real webhook processing will not be useful yet.
- Sensitive values are marked sensitive in OpenTofu output, but the raw values still live in state. Protect state storage accordingly.

## Project layout

- `src/app.ts` — Hono routes, middleware, and webhook orchestration
- `src/index.ts` — local Node server bootstrapping plus AWS Lambda `handler` export
- `src/github/` — GitHub signature validation and changed-file API lookup
- `src/risk/` — deterministic risk classification rules
- `src/services/` — PR evaluation workflow assembly
- `src/storage/` — persistence abstraction with console and DynamoDB implementations
- `tests/integration/` — local Lambda and deployed HTTP API integration suites
- `scripts/` — backend bootstrap, packaging, deployment, smoke-test, and teardown scripts that wrap OpenTofu
- `infra/bootstrap/tofu-backend/` — one-time backend bootstrap root for the remote state bucket and lock table
- `infra/terraform/` — OpenTofu root and local wrapper modules for the AWS footprint
- `.github/workflows/` — CI and deployment-readiness workflows

## What is intentionally still a placeholder

This scaffold keeps the MVP foundation small and honest:

- Raw event S3 archiving is still a placeholder and currently only generates the future object key, even though the optional archive bucket can now be provisioned.
- GitHub Actions validate the repo and OpenTofu layout, but they do not apply infrastructure changes.

That keeps the repo ready for the next implementation pass without overselling unfinished infrastructure. A little less smoke, a little more signal.
