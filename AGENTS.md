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
- `infra/terraform/` — starter Terraform configuration
- `docs/` — product, build-plan, and multi-agent planning notes
- `.github/workflows/` — CI and deploy-readiness workflows
- `dist/` — generated build output; do not edit by hand

## Setup commands

Use `npm` in this repository. The lockfile is `package-lock.json`.

- Install dependencies: `npm install`
- Build the app: `npm run build`
- Type-check only: `npm run typecheck`
- Run the current test command: `npm run test`
- Start the local development server: `npm run dev`
- Start the compiled build: `npm start`

Local development is most reliable on the same major Node version used in CI. The workflows use Node.js 22. The project docs still target AWS Lambda Node.js 20 for deployment, so keep runtime code compatible with Lambda expectations.

## Environment setup

Use `.env.example` as the canonical template. `.env` is gitignored.

Variables currently defined by the repo:

- `GITHUB_WEBHOOK_SECRET` — required for webhook signature validation
- `GITHUB_TOKEN` — required for GitHub API file lookups
- `AWS_REGION` — optional, defaults to `us-east-1`
- `EVALUATIONS_TABLE_NAME` — required by `loadAppConfig()`
- `RAW_EVENT_BUCKET_NAME` — optional
- `ENABLE_RAW_EVENT_ARCHIVE` — optional boolean flag
- `REQUIRED_LABELS` — optional comma-separated labels

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

At the moment, there is no dedicated unit or integration test runner in the repo.
`npm run test` currently delegates to `npm run typecheck`.

Commands verified in this repository:

- `npm run build`
- `npm run test`
- `terraform fmt -check`
- `terraform init -backend=false`
- `terraform validate`

Infrastructure commands should be run from `infra/terraform`.

If you add tests:

- Prefer `*.spec.ts` files or a `tests/` directory; the risk classifier already treats those locations as test-only changes.
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

Terraform currently provides a starter configuration, not a full AWS resource graph.
The checked-in Terraform defines provider setup, variables, shared tags, and outputs. It does not yet provision the full planned API Gateway, Lambda, DynamoDB, SNS, and S3 footprint described in the docs.

Likewise, the GitHub Actions workflows are currently validation/readiness workflows:

- `.github/workflows/ci.yml` runs install, build, and type-check on push and pull request
- `.github/workflows/deploy.yml` runs build plus Terraform format/init/validate and prints a deployment note

Do not describe deployment as fully automated unless you also add the missing plan/apply or packaging steps.

## Security considerations

- Preserve GitHub webhook signature validation in `src/github/signature.ts` and `src/app.ts`.
- Keep secrets in `.env` locally and in secret managers or CI configuration remotely.
- If you add AWS integrations, document the required IAM permissions and environment variables.
- Prefer least-privilege changes in Terraform and keep security-sensitive behavior explicit and reviewable.

## Known implementation gaps

Be careful not to confuse planned architecture with shipped behavior:

- The docs describe DynamoDB-backed persistence, but the current application still uses `ConsoleEvaluationRepository`, which logs the evaluation instead of storing it remotely.
- The docs describe optional raw event archiving, but the app currently only computes an S3 key placeholder when the feature flag is enabled.
- Some planning docs describe paths that no longer exist. The code in `src/` is authoritative.

## Pull request expectations

- Keep changes scoped and consistent with the MVP nature of the repo.
- Run the relevant verification commands before finishing.
- Update docs when routes, environment variables, workflows, or infrastructure assumptions change.
- If the repo later grows into multiple subprojects, add nested `AGENTS.md` files closer to those subtrees.
