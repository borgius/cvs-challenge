# PR Concierge

PR Concierge is a small internal platform service for pull request hygiene and release awareness.
It accepts GitHub pull request webhooks, validates the signature, validates the webhook payload against GitHub's published schema, applies a few deterministic platform rules, scores PR risk from changed files, publishes a `pr-concierge` GitHub check run, and produces a short summary that developers can act on.

The HTTP layer now runs on [Hono](https://hono.dev/) so the project uses Hono routing, JSON helpers, AWS Lambda integration, and built-in middleware instead of custom response and handler modules.

## Review artifacts

- [`DECISIONS.md`](DECISIONS.md) — short design rationale for choosing API Gateway plus Lambda for the MVP and the alternatives considered
- [`diagrams/pr-concierge-architecture.slidev.md`](diagrams/pr-concierge-architecture.slidev.md) — reviewer-facing Slidev deck with the committed Mermaid architecture diagram

To preview the deck locally, run `npm run slides:dev`.
To build a hostable static deck, run `npm run slides:build`; it writes the output to `.artifacts/slidev/pr-concierge-architecture` at the repository root.
Rendered PDF, PNG, and PPTX exports are intentionally not wired by default so browser-export dependencies stay optional.

## What is included

- Hono app with `GET /health` and `POST /webhooks/github`
- AWS Lambda export via `hono/aws-lambda`
- local Node.js server via `@hono/node-server`
- Hono middleware for request IDs, access logging, pretty JSON, and secure headers
- official GitHub pull request payload validation via Ajv and `@octokit/webhooks-schemas`
- deterministic risk scoring from changed file paths
- branch naming and optional required-label checks
- a GitHub-visible `pr-concierge` check run for supported pull request events
- a deterministic CVS phrase rule: pass on `CVS is Rock`, fail on `CVS is not Rock`, and ignore the phrase when it is absent
- encrypted SSM Parameter Store runtime indirection for GitHub webhook and auth inputs
- structured JSON logging
- DynamoDB-backed evaluation persistence for deployed environments, with console logging available for local development
- OpenTofu root configuration and local wrapper modules for Lambda, HTTP API, DynamoDB, optional S3, SNS, and CloudWatch alarms
- a separate OpenTofu bootstrap root for the remote state bucket and DynamoDB lock table
- deployment scripts in `scripts/` that bootstrap the backend once, package the Lambda artifact, and drive `tofu init`, `tofu apply`, and `tofu destroy`
- Vitest integration suites for the local Lambda handler and the deployed HTTP API
- GitHub Actions workflows that build, test, validate both OpenTofu roots, and deploy to AWS through the repository's Bash automation

## Quick start

1. Copy `.env.example` to `.env` if the file does not already exist.
2. Fill in the placeholders in `.env` for local runtime values and deployment secrets.
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

Keep `.env` for local runtime values and the deployment secrets that OpenTofu stores in encrypted SSM parameters for the deployed Lambda runtime. Put ordinary OpenTofu root variables in `infra/terraform/env/<env>.auto.tfvars` instead.

| Variable | Required | Purpose |
| --- | --- | --- |
| `GITHUB_WEBHOOK_SECRET` | Yes for local direct-env runtime and deploys | Validates the `x-hub-signature-256` header from GitHub for local runs, feeds `TF_VAR_github_webhook_secret` during deploy and destroy if you do not export it directly, populates the deployed webhook secret SSM parameter, and is reused by `scripts/configure-self-webhook.sh` when you explicitly configure this repository's managed webhook |
| `GITHUB_APP_ID` | Yes for local direct-env GitHub App auth and deploys | GitHub App ID used to mint installation tokens for GitHub check publication in local direct-env runs, and fed into `TF_VAR_github_app_id` during deploy so OpenTofu can store the deployed runtime value in encrypted SSM Parameter Store |
| `GITHUB_APP_PRIVATE_KEY` | Yes for local direct-env GitHub App auth and deploys | GitHub App private key used to mint installation tokens for local direct-env runs, and fed into `TF_VAR_github_app_private_key` during deploy so OpenTofu can store the deployed runtime value in encrypted SSM Parameter Store |
| `GITHUB_APP_INSTALLATION_ID` | No | Optional GitHub App installation ID for local direct-env runs or deploys. Leave it blank to let the app resolve the repository installation automatically |
| `GITHUB_TOKEN` | No | Optional fallback token for changed-file lookups. If it is absent, PR Concierge reuses the GitHub App installation token for file reads as well. When set during deploy, OpenTofu stores it in encrypted SSM Parameter Store for the deployed runtime |
| `GITHUB_WEBHOOK_SECRET_SSM_PARAMETER_NAME` | No | Optional runtime override. When `GITHUB_WEBHOOK_SECRET` is blank and this parameter name is set, the app reads the webhook secret from encrypted SSM Parameter Store at request time |
| `GITHUB_APP_ID_SSM_PARAMETER_NAME` | No | Optional runtime override for `GITHUB_APP_ID` |
| `GITHUB_APP_PRIVATE_KEY_SSM_PARAMETER_NAME` | No | Optional runtime override for `GITHUB_APP_PRIVATE_KEY` |
| `GITHUB_APP_INSTALLATION_ID_SSM_PARAMETER_NAME` | No | Optional runtime override for `GITHUB_APP_INSTALLATION_ID` |
| `GITHUB_TOKEN_SSM_PARAMETER_NAME` | No | Optional runtime override for `GITHUB_TOKEN` |
| `AWS_REGION` | No | Default AWS region for the local app and AWS SDK clients |
| `EVALUATIONS_TABLE_NAME` | Yes | Target DynamoDB table name for the app runtime |
| `RAW_EVENT_BUCKET_NAME` | No | Optional S3 bucket name for raw webhook archiving |
| `ENABLE_RAW_EVENT_ARCHIVE` | No | Enables raw event S3 key generation when set to `true` |
| `REQUIRED_LABELS` | No | Comma-separated labels to enforce, such as `safe-to-deploy,needs-platform-review` |
| `EVALUATION_REPOSITORY` | No | `console` for local logging or `dynamodb` for deployed persistence |

For deployed Lambda runs, OpenTofu now writes the GitHub runtime values to encrypted SSM parameters and injects only the parameter names into the function environment. The runtime resolves the values from SSM on first use in each warm container and then caches them in memory.

## GitHub check publication

For supported `pull_request` webhook actions (`opened`, `synchronize`, and `reopened`), PR Concierge creates an in-progress `pr-concierge` check run on the PR head SHA and completes that same run after the evaluation finishes.

The final conclusion comes from the deterministic checks, not from risk alone:

- failing checks produce a failing GitHub check
- warnings produce a neutral GitHub check
- passing and skipped checks produce a successful GitHub check

The current deterministic checks include:

- branch naming
- optional required labels
- the playful CVS phrase rule:
  - `CVS is Rock` → pass
  - `CVS is not Rock` → fail
  - neither phrase → skip

GitHub controls the icon that appears in the UI from the check status and conclusion. PR Concierge controls the check title, summary, and detail text.

### Auth requirement for live check publication

Local integration tests mock GitHub HTTP calls, so they prove the code path without proving that your live token can publish checks.

For real GitHub check publication, configure either `GITHUB_APP_ID` plus `GITHUB_APP_PRIVATE_KEY` directly or the matching `*_SSM_PARAMETER_NAME` variables so the runtime can mint a repository installation token before it calls the Checks API.

`GITHUB_APP_INSTALLATION_ID` is optional. If you omit it, the app resolves the installation from the target repository at runtime.

`GITHUB_TOKEN` alone is not enough for live check publication in this repo's runtime path. If GitHub App auth is missing, `POST /webhooks/github` fails with a clear configuration error instead of silently downgrading to a commit status.

## OpenTofu root variables

Copy `infra/terraform/env/dev.auto.tfvars.example` to `infra/terraform/env/dev.auto.tfvars` and edit it for your environment. Keep the real `*.auto.tfvars` file untracked.

That file is the home for non-secret root-module inputs such as:

- naming and region settings like `aws_region`, `environment`, `service_name`, and the optional resource-name overrides
- deployed app wiring such as `evaluations_table_name`, `raw_event_bucket_name`, `enable_raw_event_archive`, and `required_labels`
- runtime tuning and data-protection controls such as Lambda memory and timeout, log retention, DynamoDB protection flags, and archive-bucket versioning
- alarm thresholds, email subscriptions, tags, and the optional `allowed_account_ids` provider safety rail

By default `scripts/deploy.sh` and `scripts/destroy.sh` use the `dev` file above. Set `TOFU_ENVIRONMENT=<name>` to switch to `infra/terraform/env/<name>.auto.tfvars`, or point directly at another file with `TOFU_VAR_FILE=/absolute/path/to/file.auto.tfvars`.

## OpenTofu backend partial config

Copy `infra/terraform/backend/dev.s3.tfbackend.example` to `infra/terraform/backend/dev.s3.tfbackend` and fill in the backend coordinates. Keep the real `*.s3.tfbackend` file untracked.

This file is only for backend coordinates such as `bucket`, `key`, `region`, `encrypt`, and `dynamodb_table`. Do not store AWS credentials or application secrets in it.

By default `scripts/deploy.sh` and `scripts/destroy.sh` use `infra/terraform/backend/dev.s3.tfbackend`. Set `TOFU_ENVIRONMENT=<name>` to switch to `infra/terraform/backend/<name>.s3.tfbackend`, or point directly at another file with `TOFU_BACKEND_FILE=/absolute/path/to/file.s3.tfbackend`.

## Bootstrap the backend once

If the remote backend resources do not exist yet, run `scripts/bootstrap-tofu-backend.sh` first.

That script wraps the local-state OpenTofu root in `infra/bootstrap/tofu-backend/`, creates the S3 bucket and DynamoDB lock table, and tries to import those resources if they already exist.

The bootstrap script still reads `TOFU_STATE_BUCKET`, `TOFU_LOCK_TABLE`, and the related backend-bootstrap toggles from `.env` or the shell because it is responsible for creating those backend resources in the first place.

The bootstrap root keeps its own local state file at `infra/bootstrap/tofu-backend/.bootstrap.tfstate`, which is gitignored.

## OpenTofu deployment

The supported deployment path in this repo is Bash automation backed by OpenTofu.

Prerequisites:

- AWS authentication available through the standard AWS credential chain, such as `AWS_PROFILE`, `aws sso login`, a shared config profile that assumes a role, or OIDC/web identity in automation
- OpenTofu installed and available as `tofu`
- either existing backend resources or the ability to run `scripts/bootstrap-tofu-backend.sh` once first
- a local `infra/terraform/env/<env>.auto.tfvars` file for non-secret root inputs
- a local `infra/terraform/backend/<env>.s3.tfbackend` file for backend coordinates
- `.env` values for `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_ID`, and `GITHUB_APP_PRIVATE_KEY`, or direct `TF_VAR_github_webhook_secret`, `TF_VAR_github_app_id`, and `TF_VAR_github_app_private_key` exports so OpenTofu can refresh the encrypted SSM parameters used by the deployed runtime
- optional `.env` values for `GITHUB_APP_INSTALLATION_ID` and `GITHUB_TOKEN`, or direct `TF_VAR_github_app_installation_id` and `TF_VAR_github_token` exports
- `jq`
- `zip`
- `npm`

Scripts:

- `scripts/bootstrap-tofu-backend.sh` — creates or imports the S3 bucket and DynamoDB lock table used by the OpenTofu backend
- `scripts/package-lambda.sh` — builds the app and creates a Lambda zip in `.artifacts/`
- `scripts/deploy.sh` — packages the app, reads the local `*.auto.tfvars` and `*.s3.tfbackend` files, imports pre-existing Lambda-side resources into OpenTofu state when needed, runs `tofu init`, runs `tofu apply`, and writes `.artifacts/<service>-deployment.json`
- `scripts/configure-self-webhook.sh` — explicitly creates or updates this repository's managed `pull_request` webhook from `.artifacts/<service>-deployment.json` and writes `.artifacts/<service>-github-webhook.json`
- `scripts/smoke-test.sh` — calls the deployed `GET /health` endpoint
- `scripts/destroy.sh` — reads the same local `*.auto.tfvars` and `*.s3.tfbackend` files, then runs targeted `tofu destroy` by default to preserve DynamoDB and S3 data; set `DELETE_DATA=true` for a full stack destroy

## Self-PR Concierge webhook configuration

Deploying the AWS stack does not configure GitHub repository settings for you.
This repository starts with zero webhooks, so the self-dogfooding step is an
explicit follow-up after `scripts/deploy.sh` succeeds.

Prerequisites:

- a successful deploy that wrote `.artifacts/<service>-deployment.json`
- a real `GITHUB_WEBHOOK_SECRET` value in `.env` or the shell
- `gh`, `git`, and `jq`
- GitHub repository-admin auth through either `gh auth login` or `GH_TOKEN` from a fine-grained token with `Webhooks: write`

The script intentionally keeps GitHub repository-admin auth separate from the
Lambda runtime GitHub App credentials and any optional `GITHUB_TOKEN` fallback. It reuses the deployed `webhookUrl` from
`.artifacts/<service>-deployment.json`, configures only the `pull_request`
event, and always includes the secret on update so GitHub does not clear it.

Try it:

```bash
gh auth login
bash scripts/configure-self-webhook.sh
```

If you prefer an explicit token for the operator lane, export `GH_TOKEN` before
running the script. Do not rely on `GITHUB_TOKEN` for this step.

What the script writes locally:

- `.artifacts/<service>-github-webhook.json` — the managed hook ID, repository slug, target URL, and GitHub API links for ping and delivery inspection

What the script verifies:

- on create, GitHub automatically sends a `ping` event
- on update, the script sends a follow-up ping unless you pass `--skip-ping`
- the script prints recent delivery summaries when GitHub has them available

For deeper inspection, use the commands that the script prints or run these
yourself:

```bash
gh api "repos/OWNER/REPO/hooks/HOOK_ID/deliveries?per_page=10" --jq '.[] | {id, event, action, status, status_code, delivered_at}'
gh api "repos/OWNER/REPO/hooks/HOOK_ID/deliveries/DELIVERY_ID"
```

For a full PR-level proof, reuse the existing deployed success-path integration
test after the webhook is configured:

```bash
export DEPLOYED_WEBHOOK_SECRET=<same-secret>
export DEPLOYED_PR_REPOSITORY=OWNER/REPO
export DEPLOYED_PR_NUMBER=<pr-number>
npm run test:integration:deployed
```

If you later set `required_labels` in `infra/terraform/env/<env>.auto.tfvars`,
create the matching GitHub labels separately. Label setup is optional while
`required_labels` is empty by default, and it is intentionally not bundled into
the basic self-hook flow.

## GitHub Actions deployment

`.github/workflows/deploy.yml` is the repository's CI/CD deploy path.
On pushes to `main` and manual dispatches, it:

- installs dependencies and runs `npm run build` plus `npm run test`
- validates both OpenTofu roots before touching AWS
- authenticates to AWS with GitHub OIDC
- derives the OpenTofu backend bucket and lock-table names from the target AWS account ID
- runs `scripts/bootstrap-tofu-backend.sh`, `scripts/deploy.sh`, `scripts/smoke-test.sh`, and the safe deployed integration suite

Configure these GitHub Actions repository secrets before using that workflow:

- `AWS_DEPLOY_ROLE_ARN` — IAM role ARN assumed by GitHub Actions through OIDC
- `PR_CONCIERGE_GITHUB_APP_ID` — GitHub App ID passed to OpenTofu so it can refresh the encrypted SSM parameter used by Lambda at runtime
- `PR_CONCIERGE_GITHUB_APP_PRIVATE_KEY` — GitHub App private key passed to OpenTofu so it can refresh the encrypted SSM parameter used by Lambda at runtime
- `PR_CONCIERGE_GITHUB_APP_INSTALLATION_ID` — optional explicit installation ID if you do not want repository-based installation lookup
- `PR_CONCIERGE_GITHUB_TOKEN` — optional fallback token for changed-file lookups, passed to OpenTofu so it can refresh the encrypted SSM parameter used by Lambda at runtime
- `PR_CONCIERGE_WEBHOOK_SECRET` — webhook secret passed to OpenTofu so it can refresh the encrypted SSM parameter used by Lambda at runtime, and reused by optional deployed webhook tests

Notes:

- The deploy script still forces the Lambda environment to use DynamoDB persistence through the root module defaults.
- The backend bootstrap script uses a separate local-state root because OpenTofu cannot create the backend it is currently using.
- The deploy script imports the Lambda function, IAM role, and Lambda log group into OpenTofu state when those resources already exist from an earlier manual or partially managed deployment.
- The deploy and destroy scripts stop early with a clear error if `tofu` is not installed or if the local tfvars and backend files are missing.
- The scripts keep AWS credentials on the AWS credential chain. Do not put AWS access keys, session tokens, or profile secrets in `.env`, `*.auto.tfvars`, or `*.s3.tfbackend` files.
- The root OpenTofu module emits a `deployment_summary` output, and `scripts/deploy.sh` persists it to `.artifacts/<service>-deployment.json` for operators and follow-on scripts.
- If `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_ID`, or `GITHUB_APP_PRIVATE_KEY` still use placeholder values, deployment will stop early because the deployed runtime cannot publish GitHub checks without GitHub App auth.
- `allowed_account_ids` is available as an optional provider safety rail if you want the root module to refuse the wrong AWS account.
- GitHub runtime values now land in encrypted SSM Parameter Store for Lambda reads, but they still exist in OpenTofu state because OpenTofu manages the `SecureString` parameter values. `sensitive = true` redacts CLI output, but it does not remove the raw values from state. Protect the state bucket and lock table accordingly. Moving parameter creation outside OpenTofu is the next hardening step.

## Project layout

- `src/app.ts` — Hono routes, middleware, and webhook orchestration
- `src/index.ts` — local Node server bootstrapping plus AWS Lambda `handler` export
- `src/github/` — GitHub signature validation, changed-file lookup, and check publication
- `src/risk/` — deterministic risk classification rules
- `src/services/` — PR evaluation workflow assembly
- `src/storage/` — persistence abstraction with console and DynamoDB implementations
- `tests/integration/` — local Lambda and deployed HTTP API integration suites
- `scripts/` — backend bootstrap, packaging, deployment, smoke-test, and teardown scripts that wrap OpenTofu
- `infra/bootstrap/tofu-backend/` — one-time backend bootstrap root for the remote state bucket and lock table
- `infra/terraform/` — OpenTofu root and local wrapper modules for the AWS footprint
- `.github/workflows/` — CI and deployment workflows

## What is intentionally still a placeholder

This scaffold keeps the MVP foundation small and honest:

- Raw event S3 archiving is still a placeholder and currently only generates the future object key, even though the optional archive bucket can now be provisioned.
- The default deployed test pass in GitHub Actions stays conservative: health, empty-body rejection, and invalid-signature rejection are always checked, while the live signed-webhook success path remains opt-in.

That keeps the repo ready for the next implementation pass without overselling unfinished infrastructure. A little less smoke, a little more signal.
