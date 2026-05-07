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
- placeholder evaluation persistence that currently logs records and is ready to be swapped for DynamoDB
- starter GitHub Actions and Terraform scaffolding

## Quick start

1. Fill in the placeholders in `.env`.
2. Install dependencies with `npm install` if you have not already.
3. Build the project with `npm run build`.
4. Run `npm run dev` to start the local Hono server on port `3000`.
5. Call `GET /health` or send a GitHub webhook to `POST /webhooks/github`.

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

## Project layout

- `src/app.ts` — Hono routes, middleware, and webhook orchestration
- `src/index.ts` — local Node server bootstrapping plus AWS Lambda `handler` export
- `src/github/` — GitHub signature validation and changed-file API lookup
- `src/risk/` — deterministic risk classification rules
- `src/services/` — PR evaluation workflow assembly
- `src/storage/` — persistence abstraction and placeholder implementation
- `infra/terraform/` — starter Terraform configuration for the AWS footprint
- `.github/workflows/` — CI and deployment-readiness workflows

## What is intentionally still a placeholder

This scaffold keeps the MVP foundation small and honest:

- DynamoDB persistence is represented by `ConsoleEvaluationRepository` for now.
- Terraform is only the starter frame, not the full AWS resource graph yet.
- GitHub Actions validate the repo and Terraform layout, but do not apply infrastructure yet.

That keeps the repo ready for the next implementation pass without overselling unfinished infrastructure. A little less smoke, a little more signal.
