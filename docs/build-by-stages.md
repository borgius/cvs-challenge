# PR Concierge — Build Plan by Stages

## Build strategy

Use short stages with clear contracts. Finish the deployable path first. Add nice-to-have features only after the core demo works.

This plan is designed for multi-agent execution. Stages in the same wave can run in parallel after the shared contract is fixed.

## Proposed repo layout

- `service/` — Lambda application code
- `infra/` — Terraform root and reusable modules
- `.github/workflows/` — CI/CD pipelines
- `diagrams/` — architecture diagram source and image
- `assesments/cvs/docs/` — overview, plan, and agent briefs

## Shared contract to freeze first

Before parallel work starts, agree on these items:

- Runtime: TypeScript on AWS Lambda Node.js 20
- Local tooling: Bun is allowed for local install and scripts
- Endpoints:
  - `POST /webhooks/github`
  - `GET /health`
- Main AWS resources:
  - API Gateway HTTP API
  - Lambda
  - DynamoDB
  - SNS
  - CloudWatch alarms
  - optional S3 bucket
- Required environment variables:
  - `GITHUB_WEBHOOK_SECRET_PARAM`
  - `GITHUB_TOKEN_PARAM`
  - `REPORTS_TABLE_NAME`
  - `RAW_EVENTS_BUCKET`
  - `LOG_LEVEL`
- Risk levels: `low`, `medium`, `high`
- Event types for MVP: `opened`, `synchronize`, `reopened`
- Data contract for stored report:
  - repo
  - pr_number
  - action
  - branch_name
  - changed_files
  - risk_level
  - checks
  - summary
  - created_at

## Stage map

| Stage | Wave | Parallel | Depends on | Main output |
| --- | --- | ---: | --- | --- |
| S0 | 0 | No | - | Frozen contracts and repo structure |
| S1A | 1 | Yes | S0 | Lambda skeleton and health endpoint |
| S1B | 1 | Yes | S0 | Terraform foundation |
| S1C | 1 | Yes | S0 | CI/CD workflow skeleton |
| S2A | 2 | Yes | S1A | GitHub webhook verification and event parsing |
| S2B | 2 | Yes | S1A, S1B | Risk engine, DynamoDB writes, optional S3 archive |
| S2C | 2 | Yes | S1B, S1C | Observability, alarms, docs, diagram |
| S3 | 3 | No | S2A, S2B, S2C | End-to-end integration and demo hardening |
| S4 | 4 | Optional | S3 | GitHub comment back and optional Bedrock summary |

## Stage details

### S0 — Contract freeze and scaffolding

Goal:

Make later parallel work safe.

Tasks:

- Confirm runtime and package approach
- Confirm endpoint names and request flow
- Confirm DynamoDB item shape
- Confirm Terraform module boundaries
- Confirm directory ownership by agent

Done when:

- Every later stage can start without changing core interfaces
- Paths and ownership are written down

Time target:

15 to 20 minutes

### S1A — Lambda skeleton

Goal:

Create the service shell.

Tasks:

- Create TypeScript Lambda project structure
- Add config loader
- Add structured logger
- Add `GET /health`
- Add basic tests and build scripts

Deliverables:

- `service/src/handlers/health.ts`
- `service/src/handlers/github-webhook.ts`
- `service/src/config/*`
- `service/src/lib/logger.ts`
- `service/test/*`

Done when:

- Build passes
- Local health handler returns `200`

Time target:

30 to 40 minutes

### S1B — Terraform foundation

Goal:

Create the AWS platform shell.

Tasks:

- Create Terraform root module
- Create reusable modules as needed for Lambda, API Gateway, DynamoDB, SNS, alarms
- Add variable validation
- Add least-privilege IAM
- Add outputs for endpoint URL and resource names

Deliverables:

- `infra/main.tf`
- `infra/variables.tf`
- `infra/outputs.tf`
- `infra/modules/*`

Done when:

- `terraform fmt -check` passes
- `terraform validate` passes

Time target:

35 to 45 minutes

### S1C — CI/CD workflow skeleton

Goal:

Prepare automation early.

Tasks:

- Add pull request workflow for lint, build, and tests
- Add Terraform validation workflow
- Add deploy workflow using AWS OIDC
- Add artifact packaging step for Lambda

Deliverables:

- `.github/workflows/ci.yml`
- `.github/workflows/terraform.yml`
- `.github/workflows/deploy.yml`

Done when:

- Workflows are valid YAML
- Required secrets and permissions are documented

Time target:

25 to 35 minutes

### S2A — GitHub webhook verification and event parsing

Goal:

Handle real GitHub pull request events safely.

Tasks:

- Validate GitHub webhook signature
- Parse pull request payload
- Ignore unsupported events cleanly
- Fetch changed files from GitHub API
- Normalize data for the domain layer

Done when:

- Invalid signatures return `401`
- Supported PR events return `200`
- Unsupported events return a safe no-op response

Time target:

25 to 35 minutes

### S2B — Policy engine and persistence

Goal:

Turn raw events into useful platform output.

Tasks:

- Implement branch naming check
- Implement risk rules from changed paths
- Write report to DynamoDB
- Optionally write raw payload to S3
- Return a short deterministic summary

Done when:

- Sample payload produces stable `low`, `medium`, or `high` output
- DynamoDB write path works end to end

Time target:

30 to 40 minutes

### S2C — Observability, docs, and diagram

Goal:

Make the system explainable and operable.

Tasks:

- Add CloudWatch alarms for Lambda errors and API 5XX
- Add SNS topic wiring
- Write deployment notes
- Create simple architecture diagram in `diagrams/`
- Keep docs aligned with the implementation

Done when:

- Alarm resources exist in Terraform
- Reviewer can understand the design from the docs and diagram

Time target:

25 to 35 minutes

### S3 — Integration and demo hardening

Goal:

Make the MVP demo-ready.

Tasks:

- Connect Lambda package to Terraform
- Deploy to AWS
- Run one end-to-end webhook test
- Verify DynamoDB record, logs, and alarms
- Finalize README and demo script

Done when:

- A real or replayed GitHub webhook works end to end
- One clear demo path is ready for interview use

Time target:

30 to 40 minutes

### S4 — Optional polish

Goal:

Add one high-value bonus feature if the MVP is already solid.

Good options:

- Post a comment back to the PR
- Add Bedrock summary rewriting
- Add a small CloudWatch dashboard
- Add one more repo policy

## 3-hour execution timeline

| Time | Work |
| --- | --- |
| 0:00 - 0:20 | S0 contract freeze |
| 0:20 - 1:05 | S1A, S1B, S1C in parallel |
| 1:05 - 1:50 | S2A, S2B, S2C in parallel |
| 1:50 - 2:30 | S3 integration |
| 2:30 - 3:00 | Fixes, screenshots, optional S4 |

## Cut line if time gets tight

Keep these items:

- Health endpoint
- Webhook signature validation
- Risk scoring from changed files
- DynamoDB persistence
- One or two CloudWatch alarms
- Terraform deploy path
- CI workflow
- README and diagram

Cut these first:

- GitHub comment back
- S3 raw event archive
- Dashboard
- Bedrock integration
- Extra policies

## Merge and branch strategy for multi-agent work

- Use one branch per stage or agent
- Merge Wave 1 before Wave 2 integration starts
- Do not let multiple agents edit the same config file unless needed
- Keep package and lockfile edits in one owner branch when possible

Suggested branch names:

- `feat/pr-concierge-s1a-service`
- `feat/pr-concierge-s1b-infra`
- `feat/pr-concierge-s1c-cicd`
- `feat/pr-concierge-s2a-github`
- `feat/pr-concierge-s2b-policy`
- `feat/pr-concierge-s2c-observability`
- `feat/pr-concierge-s3-integration`

## Acceptance checklist

Before calling the MVP done, verify:

- The service is deployed
- The webhook endpoint is reachable
- Signature verification works
- One PR event creates a report in DynamoDB
- Logs are readable and structured
- At least one alarm path exists
- Terraform and CI files are committed
- Docs explain design decisions and demo flow
