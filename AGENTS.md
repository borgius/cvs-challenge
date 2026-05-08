# AGENTS.md

## Project overview

PR Concierge is a small TypeScript service for pull request hygiene and release awareness.
It accepts GitHub pull request webhooks, validates the signature, fetches changed files from the GitHub API, applies deterministic checks, scores risk, publishes a `pr-concierge` GitHub check run for supported PR events, and returns a short summary.

The current application surface is:

- `GET /health`
- `POST /webhooks/github`

The HTTP layer uses Hono. The local server and AWS Lambda handler both come from `src/index.ts`, and the main route orchestration lives in `src/app.ts`.

## Read these docs first

Before making architecture or workflow changes, read these files:

- `README.md` for the current scaffold, route list, and environment variables
- `docs/ai-workflow.md` for the current AI workflow evidence and course corrections
- `docs/project-overview.md` for the intended product and AWS target architecture
- `docs/build-by-stages.md` and `docs/multiagent-stage-briefs.md` for planning context

Important: the planning docs are slightly ahead of the implementation. For example, some stage docs still refer to a `service/` directory, but the real application code lives in `src/`. Follow the current code first, then update docs if they drift.

## Repository layout

- `src/app.ts` — Hono app, middleware, route handlers, webhook orchestration
- `src/index.ts` — local Node server bootstrap and AWS Lambda `handler` export
- `src/config/env.ts` — environment variable loading and validation
- `src/github/` — GitHub signature validation, changed-file API clients, and check publication helpers
- `src/services/evaluatePullRequest.ts` — PR evaluation workflow
- `src/risk/classifier.ts` — deterministic risk classification rules
- `src/storage/evaluationRepository.ts` — persistence interface and placeholder repository
- `src/types/` — shared domain and GitHub payload types
- `infra/bootstrap/tofu-backend/` — one-time backend bootstrap root for the OpenTofu S3 bucket and DynamoDB lock table
- `infra/terraform/` — OpenTofu root and local wrapper modules for the AWS footprint
- `docs/` — product, build-plan, and multi-agent planning notes
- `.github/workflows/` — CI and deployment workflows
- `dist/` — generated build output; do not edit by hand

## Setup commands

Use `npm` in this repository. The lockfile is `package-lock.json`.

- Install dependencies: `npm install`
- Build the app: `npm run build`
- Validate the OpenTofu roots: `npm run validate:infra`
- Type-check only: `npm run typecheck`
- Type-check the Vitest harness: `npm run typecheck:tests`
- Run the default local verification command: `npm run test`
- Run only the local Lambda integration suite: `npm run test:integration:local`
- Run the deployed HTTP API integration suite: `npm run test:integration:deployed`
- Start the local development server: `npm run dev`
- Start the compiled build: `npm start`
- Configure this repository's managed `pull_request` webhook explicitly after deploy: `bash scripts/configure-self-webhook.sh`

Local development is most reliable on the same major Node version used in CI. The workflows use Node.js 22. The project docs still target AWS Lambda Node.js 20 for deployment, so keep runtime code compatible with Lambda expectations.

## Environment setup

Use `.env.example` as the canonical template. `.env` is gitignored.

Keep `.env` focused on local runtime values and the deployment secrets that `scripts/deploy.sh` writes to encrypted SSM parameters for the deployed Lambda runtime:

- `GITHUB_WEBHOOK_SECRET` — required for local direct-env signature validation, reused by `scripts/configure-self-webhook.sh`, and used by `scripts/deploy.sh` to refresh the deployed webhook secret SSM parameter
- `GITHUB_APP_ID` — required for local direct-env GitHub App auth and used by `scripts/deploy.sh` to refresh the deployed GitHub App ID SSM parameter
- `GITHUB_APP_PRIVATE_KEY` — required for local direct-env GitHub App auth and used by `scripts/deploy.sh` to refresh the deployed GitHub App private key SSM parameter; use the PEM value directly or store it on one line with escaped newlines in `.env`
- `GITHUB_APP_INSTALLATION_ID` — optional explicit installation ID for local direct-env auth and deploys
- `GITHUB_TOKEN` — optional fallback for changed-file lookups; when present, `scripts/deploy.sh` refreshes the deployed fallback-token SSM parameter. Do not reuse it as the repository-admin token for webhook management
- `GITHUB_WEBHOOK_SECRET_SSM_PARAMETER_NAME` — optional runtime override used when you want the app to read the webhook secret from SSM instead of direct env
- `GITHUB_APP_ID_SSM_PARAMETER_NAME` — optional runtime override for `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY_SSM_PARAMETER_NAME` — optional runtime override for `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_APP_INSTALLATION_ID_SSM_PARAMETER_NAME` — optional runtime override for `GITHUB_APP_INSTALLATION_ID`
- `GITHUB_TOKEN_SSM_PARAMETER_NAME` — optional runtime override for `GITHUB_TOKEN`
- `AWS_REGION` — optional, defaults to `us-east-1`
- `EVALUATIONS_TABLE_NAME` — required by `loadAppConfig()`
- `RAW_EVENT_BUCKET_NAME` — optional
- `ENABLE_RAW_EVENT_ARCHIVE` — optional boolean flag
- `REQUIRED_LABELS` — optional comma-separated labels
- `EVALUATION_REPOSITORY` — optional local runtime override

Do not use `.env` as the home for ordinary OpenTofu root variables. Copy `infra/terraform/env/dev.auto.tfvars.example` to `infra/terraform/env/dev.auto.tfvars` and keep non-secret root variables there instead. Copy `infra/terraform/backend/dev.s3.tfbackend.example` to `infra/terraform/backend/dev.s3.tfbackend` and keep backend coordinates there.

For the one-time backend bootstrap script, `.env` or the shell may also provide:

- `TOFU_STATE_BUCKET`
- `TOFU_LOCK_TABLE`
- `TOFU_STATE_REGION`
- `TOFU_STATE_BUCKET_FORCE_DESTROY`
- `TOFU_STATE_BUCKET_VERSIONING_ENABLED`
- `TOFU_LOCK_TABLE_POINT_IN_TIME_RECOVERY_ENABLED`
- `TOFU_LOCK_TABLE_DELETION_PROTECTION_ENABLED`

Supported AWS authentication paths are the standard AWS credential-chain options such as `AWS_PROFILE`, `aws sso login`, shared-config assume-role, and OIDC/web identity. Do not add AWS credentials to `.env`, `*.auto.tfvars`, or `*.s3.tfbackend` files.

Notes:

- `GET /health` can run without the required webhook secrets because config loading happens inside the webhook handler.
- `POST /webhooks/github` will fail at runtime if the required direct GitHub values or SSM parameter names are missing, if GitHub App auth is absent, or if the configured GitHub App is not installed on the target repository.
- `scripts/configure-self-webhook.sh` expects the same `GITHUB_WEBHOOK_SECRET`, but it uses a separate GitHub operator-auth lane: either `gh auth login` as a repository admin or `GH_TOKEN` with `Webhooks: write`.
- Never commit real secrets, personal identifiers, or live cloud resource IDs. Use placeholders in docs and examples.

## Development workflow

- The main entrypoint for behavior changes is usually `src/app.ts`.
- New PR evaluation rules should stay deterministic unless the repo explicitly adds a runtime AI integration.
- Keep webhook parsing, validation, GitHub API integration, and risk evaluation separate. The current split is:
  - request parsing and HTTP responses in `src/app.ts`
  - GitHub API interaction, including check publication, in `src/github/`
  - risk logic in `src/risk/`
  - orchestration in `src/services/`
  - persistence behind `src/storage/`
- Edit source files in `src/`, then rebuild; do not hand-edit `dist/`.
- Keep docs honest. The repo intentionally contains roadmap material, so if you implement or remove a feature, update the relevant docs.
- Keep the self-hook flow explicit. `scripts/deploy.sh` stays focused on AWS packaging and OpenTofu apply, while `scripts/configure-self-webhook.sh` is the separate operator step that mutates repository webhook settings.

## Testing and verification

The repo now uses Vitest for integration coverage.
`npm run test` type-checks the production source, type-checks the Vitest harness, and runs the local Lambda integration suite.
`npm run validate:infra` checks OpenTofu formatting, runs backend-free init and validate for both roots, and executes the plan-mode input-validation tests for the backend bootstrap root and HTTP API wrapper module.
`npm run test:integration:deployed` runs the deployed HTTP API suite and expects either `DEPLOYED_HEALTH_URL` / `DEPLOYED_WEBHOOK_URL` or `.artifacts/<service>-deployment.json`.
The deployed suite keeps its default checks safe by covering `GET /health`, empty-body webhook rejection, and invalid-signature rejection. A real deployed webhook success-path case is opt-in and skipped unless `DEPLOYED_WEBHOOK_SECRET`, `DEPLOYED_PR_REPOSITORY`, and `DEPLOYED_PR_NUMBER` are set.
The local Lambda suite now also verifies the mocked GitHub check-run create/update flow and the pass/fail/skip outcomes of the CVS phrase rule.

Self-dogfooding notes:

- The repo starts with zero GitHub repository webhooks. After deploy, run `bash scripts/configure-self-webhook.sh` explicitly if you want this repository to send its own `pull_request` events to the deployed PR Concierge endpoint.
- That script writes `.artifacts/<service>-github-webhook.json` with the managed hook ID and GitHub API links for ping and delivery inspection.
- Use the script's ping plus recent-deliveries guidance for configuration verification, then optionally reuse `npm run test:integration:deployed` with the live webhook env vars for a full PR-level proof.

Commands verified in this repository:

- `npm run build`
- `npm run test`
- `npm run validate:infra`
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
- Keep logs structured. Existing code uses AWS Lambda Powertools logging and JSON-friendly metadata.
- New JSON API responses should stay consistent with the existing routes: clear message, useful metadata, and `requestId` where available.
- When changing environment variables or public behavior, update `.env.example`, `README.md`, and any affected docs in the same change.

## Infrastructure and deployment notes

`infra/terraform` now defines the active AWS footprint for PR Concierge through OpenTofu, including the Lambda function, HTTP API, DynamoDB table, optional S3 bucket, SNS topic, and CloudWatch alarms.

The root uses an S3 backend configured at init time, with DynamoDB used for state locking. The steady-state deploy and destroy scripts read backend coordinates from `infra/terraform/backend/<env>.s3.tfbackend` and non-secret root variables from `infra/terraform/env/<env>.auto.tfvars`.

The deploy script reads the remaining GitHub values from `.env` or legacy `TF_VAR_...` exports, writes them to encrypted SSM Parameter Store with AWS CLI, and passes only SSM parameter names into OpenTofu. AWS credentials stay on the AWS credential chain rather than in repo-local config files.

`scripts/deploy.sh` imports the Lambda function, IAM role, and Lambda log group into OpenTofu state when those resources already exist from an earlier manual or partially managed deployment.

The one-time backend bootstrap path lives in `infra/bootstrap/tofu-backend/` and is wrapped by `scripts/bootstrap-tofu-backend.sh`. That root keeps local state on purpose so it can create the remote backend resources for the main stack.

The GitHub Actions workflows are:

- `.github/workflows/ci.yml` runs install, build, and the default test workflow on push and pull request
- `.github/workflows/deploy.yml` runs install, build, the default test workflow, OpenTofu format/init/validate, authenticates to AWS with GitHub OIDC, bootstraps the OpenTofu backend if needed, deploys with `scripts/deploy.sh`, and then runs smoke plus safe deployed integration tests

Repository secrets required by `.github/workflows/deploy.yml`:

- `AWS_DEPLOY_ROLE_ARN`
- `PR_CONCIERGE_GITHUB_APP_ID`
- `PR_CONCIERGE_GITHUB_APP_PRIVATE_KEY`
- `PR_CONCIERGE_GITHUB_APP_INSTALLATION_ID` (optional)
- `PR_CONCIERGE_GITHUB_TOKEN` (optional fallback)
- `PR_CONCIERGE_WEBHOOK_SECRET`

The workflow deploy path intentionally still runs through `scripts/bootstrap-tofu-backend.sh` and `scripts/deploy.sh`, so workflow changes should continue to keep those scripts as the source of truth.

## Security considerations

- Preserve GitHub webhook signature validation in `src/github/signature.ts` and `src/app.ts`.
- Keep secrets in `.env` locally and in secret managers or CI configuration remotely.
- Keep GitHub repository-admin auth for webhook management separate from the Lambda runtime GitHub App credentials and any optional `GITHUB_TOKEN` fallback. Use GitHub CLI auth or a dedicated `GH_TOKEN` when running `scripts/configure-self-webhook.sh`.
- Keep AWS provider and backend credentials out of `.env`, `*.auto.tfvars`, and `*.s3.tfbackend` files. Use the AWS credential chain instead.
- Remember that historical OpenTofu state revisions may still contain GitHub runtime values from older deployments that managed encrypted SSM parameter values directly. Protect the backend bucket and lock table accordingly, and rotate credentials after migrating older environments.
- If you add AWS integrations, document the required IAM permissions and environment variables.
- Prefer least-privilege changes in Terraform and keep security-sensitive behavior explicit and reviewable.

## Known implementation gaps

Be careful not to confuse planned architecture with shipped behavior:

- The deployed path can use DynamoDB-backed persistence, but local development often still uses `EVALUATION_REPOSITORY=console` to avoid requiring AWS resources.
- The docs describe optional raw event archiving, but the app currently only computes an S3 key placeholder when the feature flag is enabled.
- `required_labels` is empty by default. If an operator enables required labels later, they must create the matching GitHub labels separately; the basic self-hook flow does not bootstrap labels.
- Some planning docs describe paths that no longer exist. The code in `src/` is authoritative.

## Pull request expectations

- Keep changes scoped and consistent with the MVP nature of the repo.
- Run the relevant verification commands before finishing.
- Update docs when routes, environment variables, workflows, or infrastructure assumptions change.
- If the repo later grows into multiple subprojects, add nested `AGENTS.md` files closer to those subtrees.
