# PR Concierge

PR Concierge is a small internal platform service for pull request hygiene and release awareness.
It accepts GitHub pull request webhooks, validates the signature, applies a few deterministic platform rules, scores PR risk from changed files, and produces a short summary that developers can act on.

The HTTP layer now runs on [Hono](https://hono.dev/) so the project uses Hono routing, JSON helpers, AWS Lambda integration, and built-in middleware instead of custom response and handler modules.

## What is scaffolded

- Hono app with `GET /health` and `POST /webhooks/github`
- AWS Lambda export via `hono/aws-lambda`
- local Node.js server via `@hono/node-server`
- Hono middleware for request IDs, access logging, pretty JSON, and secure headers
- deterministic risk scoring from changed file paths
- branch naming and optional required-label checks
- structured JSON logging
- DynamoDB-backed evaluation persistence for deployed environments, with console logging available for local development
- manual AWS deployment scripts in `scripts/`
- starter GitHub Actions and Terraform validation scaffolding

## Quick start

1. Copy `.env.example` to `.env` if the file does not already exist.
2. Fill in the placeholders in `.env`.
3. Install dependencies with `npm install` if you have not already.
4. Build the project with `npm run build`.
5. Run `npm run dev` to start the local Hono server on port `3000`.
6. Call `GET /health` or send a GitHub webhook to `POST /webhooks/github`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GITHUB_WEBHOOK_SECRET` | Yes | Validates the `x-hub-signature-256` header from GitHub |
| `GITHUB_TOKEN` | Yes | Reads changed files from the GitHub REST API |
| `AWS_REGION` | No | Default AWS region for future infrastructure wiring |
| `EVALUATIONS_TABLE_NAME` | Yes | Target DynamoDB table name |
| `RAW_EVENT_BUCKET_NAME` | No | Optional S3 bucket name for raw webhook archiving |
| `ENABLE_RAW_EVENT_ARCHIVE` | No | Enables raw event S3 key generation when set to `true` |
| `REQUIRED_LABELS` | No | Comma-separated labels to enforce, such as `safe-to-deploy,needs-platform-review` |
| `EVALUATION_REPOSITORY` | No | `console` for local logging or `dynamodb` for deployed persistence |

## Manual AWS deployment

The supported deployment path in this repo is now manual Bash automation with the AWS CLI.

Prerequisites:

- AWS CLI authenticated against the target account
- `jq`
- `zip`
- `npm`

Scripts:

- `scripts/package-lambda.sh` — builds the app and creates a Lambda zip in `.artifacts/`
- `scripts/deploy.sh` — creates or updates DynamoDB, IAM, Lambda, and an HTTP API
- `scripts/smoke-test.sh` — calls the deployed `GET /health` endpoint
- `scripts/destroy.sh` — removes the deployed API, Lambda, and IAM role; set `DELETE_DATA=true` to also remove DynamoDB and S3 resources

Notes:

- The deploy script forces the Lambda environment to use DynamoDB persistence.
- If `GITHUB_WEBHOOK_SECRET` or `GITHUB_TOKEN` still use placeholder values, deployment can still complete, but real webhook processing will not be useful yet.
- Terraform remains in the repo as a validation scaffold, not the active deployment path.

## Project layout

- `src/app.ts` — Hono routes, middleware, and webhook orchestration
- `src/index.ts` — local Node server bootstrapping plus AWS Lambda `handler` export
- `src/github/` — GitHub signature validation and changed-file API lookup
- `src/risk/` — deterministic risk classification rules
- `src/services/` — PR evaluation workflow assembly
- `src/storage/` — persistence abstraction with console and DynamoDB implementations
- `scripts/` — manual packaging, deployment, smoke-test, and teardown scripts
- `infra/terraform/` — starter Terraform configuration for the AWS footprint
- `.github/workflows/` — CI and deployment-readiness workflows

## What is intentionally still a placeholder

This scaffold keeps the MVP foundation small and honest:

- Raw event S3 archiving is still a placeholder and currently only generates the future object key.
- Terraform is only the starter frame, not the full AWS resource graph yet.
- GitHub Actions validate the repo and Terraform layout, but they do not deploy infrastructure.

That keeps the repo ready for the next implementation pass without overselling unfinished infrastructure. A little less smoke, a little more signal.
