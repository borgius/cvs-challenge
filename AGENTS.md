# AGENTS.md

## Project overview

PR Concierge is a small TypeScript service for pull request hygiene and release awareness.
It accepts GitHub pull request webhooks, validates the signature, fetches changed files from the GitHub API, applies deterministic checks, scores risk, and returns a short summary.

The current application surface is:

- `GET /health`
- `POST /webhooks/github`

The HTTP layer uses Hono. The local server and AWS Lambda handler both come from `src/index.ts`, and the main route orchestration lives in `src/app.ts`.

## Read these docs first

Before making architecture or workflow changes, read these files:

- `README.md` for the current scaffold, route list, and environment variables
- `docs/project-overview.md` for the intended product and AWS target architecture
- `docs/build-by-stages.md` and `docs/multiagent-stage-briefs.md` for planning context

Important: the planning docs are slightly ahead of the implementation. For example, some stage docs still refer to a `service/` directory, but the real application code lives in `src/`. Follow the current code first, then update docs if they drift.

## Repository layout

- `src/app.ts` — Hono app, middleware, route handlers, webhook orchestration
- `src/index.ts` — local Node server bootstrap and AWS Lambda `handler` export
- `src/config/env.ts` — environment variable loading and validation
- `src/github/` — GitHub signature validation and changed-file API client
- `src/services/evaluatePullRequest.ts` — PR evaluation workflow
- `src/risk/classifier.ts` — deterministic risk classification rules
- `src/storage/evaluationRepository.ts` — persistence interface and placeholder repository
- `src/types/` — shared domain and GitHub payload types
- `infra/bootstrap/tofu-backend/` — one-time backend bootstrap root for the OpenTofu S3 bucket and DynamoDB lock table
- `infra/terraform/` — OpenTofu root and local wrapper modules for the AWS footprint
- `docs/` — product, build-plan, and multi-agent planning notes
- `.github/workflows/` — CI and deploy-readiness workflows
- `dist/` — generated build output; do not edit by hand

## Setup commands

Use `npm` in this repository. The lockfile is `package-lock.json`.

- Install dependencies: `npm install`
- Build the app: `npm run build`
- Type-check only: `npm run typecheck`
- Type-check the Vitest harness: `npm run typecheck:tests`
- Run the default local verification command: `npm run test`
- Run only the local Lambda integration suite: `npm run test:integration:local`
- Run the deployed HTTP API integration suite: `npm run test:integration:deployed`
- Start the local development server: `npm run dev`
- Start the compiled build: `npm start`

Local development is most reliable on the same major Node version used in CI. The workflows use Node.js 22. The project docs still target AWS Lambda Node.js 20 for deployment, so keep runtime code compatible with Lambda expectations.

## Environment setup

Use `.env.example` as the canonical template. `.env` is gitignored.

Variables currently defined by the repo:

- `GITHUB_WEBHOOK_SECRET` — required for webhook signature validation
- `GITHUB_TOKEN` — required for GitHub API file lookups
- `AWS_REGION` — optional, defaults to `us-east-1`
- `TOFU_STATE_BUCKET` — required by the deployment scripts for remote OpenTofu state
- `TOFU_LOCK_TABLE` — required by the deployment scripts for DynamoDB-backed state locking
- `TOFU_STATE_KEY` — optional override for the remote state object key
- `TOFU_STATE_REGION` — optional override for the remote state bucket and lock table region
- `TOFU_STATE_BUCKET_FORCE_DESTROY` — optional override for backend bootstrap destroy behavior
- `TOFU_STATE_BUCKET_VERSIONING_ENABLED` — optional toggle for backend state bucket versioning
- `TOFU_LOCK_TABLE_POINT_IN_TIME_RECOVERY_ENABLED` — optional toggle for backend lock table PITR
- `TOFU_LOCK_TABLE_DELETION_PROTECTION_ENABLED` — optional toggle for backend lock table deletion protection
- `EVALUATIONS_TABLE_NAME` — required by `loadAppConfig()`
- `RAW_EVENT_BUCKET_NAME` — optional
- `ENABLE_RAW_EVENT_ARCHIVE` — optional boolean flag
- `REQUIRED_LABELS` — optional comma-separated labels

Deployment-specific overrides are also available in `.env.example`, including OpenTofu backend settings, resource naming overrides, log retention settings, alarm email subscriptions, and data protection toggles used by the OpenTofu-backed scripts.

Notes:

- `GET /health` can run without the required webhook secrets because config loading happens inside the webhook handler.
- `POST /webhooks/github` will fail at runtime if required environment variables are missing.
- Never commit real secrets, personal identifiers, or live cloud resource IDs. Use placeholders in docs and examples.

## Development workflow

- The main entrypoint for behavior changes is usually `src/app.ts`.
- New PR evaluation rules should stay deterministic unless the repo explicitly adds a runtime AI integration.
- Keep webhook parsing, validation, and risk evaluation separate. The current split is:
  - request parsing and HTTP responses in `src/app.ts`
  - GitHub API interaction in `src/github/`
  - risk logic in `src/risk/`
  - orchestration in `src/services/`
  - persistence behind `src/storage/`
- Edit source files in `src/`, then rebuild; do not hand-edit `dist/`.
- Keep docs honest. The repo intentionally contains roadmap material, so if you implement or remove a feature, update the relevant docs.

## Testing and verification

The repo now uses Vitest for integration coverage.
`npm run test` type-checks the production source, type-checks the Vitest harness, and runs the local Lambda integration suite.
`npm run test:integration:deployed` runs the deployed HTTP API suite and expects either `DEPLOYED_HEALTH_URL` / `DEPLOYED_WEBHOOK_URL` or `.artifacts/<service>-deployment.json`.
The deployed suite keeps its default checks safe by covering `GET /health`, empty-body webhook rejection, and invalid-signature rejection. A real deployed webhook success-path case is opt-in and skipped unless `DEPLOYED_WEBHOOK_SECRET`, `DEPLOYED_PR_REPOSITORY`, and `DEPLOYED_PR_NUMBER` are set.

Commands verified in this repository:

- `npm run build`
- `npm run test`
- `npm run test:integration:deployed`
- `tofu fmt -check`
- `tofu init -backend=false -input=false`
- `tofu validate`

Infrastructure commands should be run from `infra/terraform` for the app stack and `infra/bootstrap/tofu-backend` for backend bootstrap work.

If you add tests:

- Prefer `*.spec.ts` files or a `tests/` directory; the risk classifier already treats those locations as test-only changes.
- Keep integration coverage under `tests/integration/` and prefer the exported Lambda `handler` for local verification.
- Keep tests focused on changed behavior.
- Update `package.json` scripts and this file if you introduce a real test runner.

Before finishing a change, run the relevant app checks plus any targeted tests you added.

## Code style and conventions

- TypeScript is compiled in strict mode.
- The repo uses ESM with `module` and `moduleResolution` set to `nodenext`.
- Keep explicit `.ts` extensions in relative imports inside `src/`.
- Prefer `import type` for type-only imports.
- Follow the existing style: semicolons, trailing commas, named exports, and small focused helpers.
- Keep logs structured. Existing code uses `console.log(JSON.stringify({...}))` and similar JSON logging patterns.
- New JSON API responses should stay consistent with the existing routes: clear message, useful metadata, and `requestId` where available.
- When changing environment variables or public behavior, update `.env.example`, `README.md`, and any affected docs in the same change.

## Infrastructure and deployment notes

`infra/terraform` now defines the active AWS footprint for PR Concierge through OpenTofu, including the Lambda function, HTTP API, DynamoDB table, optional S3 bucket, SNS topic, and CloudWatch alarms.

The root uses an S3 backend configured at init time, with DynamoDB used for state locking. The deployment scripts generate the temporary backend config and pass it to `tofu init`.

The one-time backend bootstrap path lives in `infra/bootstrap/tofu-backend/` and is wrapped by `scripts/bootstrap-tofu-backend.sh`. That root keeps local state on purpose so it can create the remote backend resources for the main stack.

The GitHub Actions workflows are still validation/readiness workflows:

- `.github/workflows/ci.yml` runs install, build, and the default test workflow on push and pull request
- `.github/workflows/deploy.yml` runs build plus OpenTofu format/init/validate and prints a deployment note

Do not describe deployment as fully automated unless you also add the missing CI-side plan/apply or packaging steps. Today the supported operator path still runs through `scripts/deploy.sh` and `scripts/destroy.sh`.

## Security considerations

- Preserve GitHub webhook signature validation in `src/github/signature.ts` and `src/app.ts`.
- Keep secrets in `.env` locally and in secret managers or CI configuration remotely.
- If you add AWS integrations, document the required IAM permissions and environment variables.
- Prefer least-privilege changes in Terraform and keep security-sensitive behavior explicit and reviewable.

## Known implementation gaps

Be careful not to confuse planned architecture with shipped behavior:

- The deployed path can use DynamoDB-backed persistence, but local development often still uses `EVALUATION_REPOSITORY=console` to avoid requiring AWS resources.
- The docs describe optional raw event archiving, but the app currently only computes an S3 key placeholder when the feature flag is enabled.
- Some planning docs describe paths that no longer exist. The code in `src/` is authoritative.

## Pull request expectations

- Keep changes scoped and consistent with the MVP nature of the repo.
- Run the relevant verification commands before finishing.
- Update docs when routes, environment variables, workflows, or infrastructure assumptions change.
- If the repo later grows into multiple subprojects, add nested `AGENTS.md` files closer to those subtrees.
