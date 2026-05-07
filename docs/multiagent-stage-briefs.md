# PR Concierge — Multi-Agent Stage Briefs

## How to use this file

Use these briefs to assign work to parallel agents after Stage S0 is done.
Each brief has a tight scope, clear output, and path ownership to reduce merge conflicts.

## Shared rules for all agents

- Do not change the core contracts from `build-by-stages.md` without approval.
- Keep code and docs simple.
- Prefer deterministic logic for the MVP.
- Do not add runtime AI features until the core path works.
- Add tests only where they protect the core flow.
- Keep secrets out of the repo.

## Path ownership

| Agent | Main paths |
| --- | --- |
| Agent A | `service/src/handlers/**`, `service/src/config/**`, `service/src/lib/**`, `service/test/health*` |
| Agent B | `infra/**` |
| Agent C | `.github/workflows/**` |
| Agent D | `service/src/integrations/github/**`, `service/test/github*` |
| Agent E | `service/src/domain/**`, `service/src/repositories/**`, `service/test/domain*` |
| Agent F | `diagrams/**`, `assesments/cvs/docs/**` |

## Wave 1 agents

### Agent A — Service skeleton

Goal:

Create the Lambda application shell.

Inputs:

- Frozen contracts from Stage S0
- Overview and build plan docs

Tasks:

- Create service folder structure
- Add config loading
- Add structured logger
- Add `GET /health`
- Add placeholder `POST /webhooks/github` handler
- Add build and test scripts

Output:

A compilable TypeScript service skeleton with clean entry points.

Done when:

- Build passes
- Health endpoint handler returns `200`
- Logging and config are centralized

### Agent B — Terraform foundation

Goal:

Create the AWS infrastructure shell.

Tasks:

- Add Terraform root files
- Add modules for Lambda, API Gateway, DynamoDB, SNS, and alarms
- Add IAM policies with least privilege
- Add variable validation and outputs

Output:

A valid Terraform layout that can host the MVP.

Done when:

- `terraform validate` passes
- The endpoint URL and table name are exposed as outputs

### Agent C — CI/CD foundation

Goal:

Create automation for quality and deployment.

Tasks:

- Add CI workflow for build and tests
- Add Terraform validation workflow
- Add deploy workflow with AWS OIDC
- Document required GitHub repo variables or secrets

Output:

A minimal but credible GitHub Actions setup.

Done when:

- Workflow files are valid
- Required permissions are documented

## Wave 2 agents

### Agent D — GitHub integration

Goal:

Handle GitHub pull request events safely.

Depends on:

- Agent A

Tasks:

- Verify webhook signature
- Parse pull request payloads
- Fetch changed files from GitHub API
- Normalize GitHub data for the domain layer

Output:

A clean GitHub integration layer under `service/src/integrations/github/`.

Done when:

- Invalid signatures fail cleanly
- Supported events map to one normalized input shape

### Agent E — Policy engine and persistence

Goal:

Turn normalized PR data into a useful report.

Depends on:

- Agent A
- Agent B for infra names and env variables

Tasks:

- Implement branch naming rule
- Implement risk scoring from changed paths
- Build summary text
- Write report to DynamoDB
- Optionally archive raw payload to S3

Output:

A deterministic domain layer with persistence.

Done when:

- Sample PR inputs produce stable results
- One report can be written successfully

### Agent F — Observability, docs, and diagram

Goal:

Make the project easy to review and easy to operate.

Depends on:

- Agent B and Agent C for infra and pipeline facts

Tasks:

- Document architecture and deployment flow
- Add or update the diagram in `diagrams/`
- Confirm alarm coverage in Terraform docs
- Keep docs aligned with the real implementation

Output:

A reviewer-friendly docs set and simple architecture diagram.

Done when:

- A reviewer can understand the system in under 5 minutes
- The docs match the actual service and infrastructure

## Wave 3 integration owner

### Agent G — Integration and demo hardening

Goal:

Connect the outputs of all earlier agents and make the MVP demo-ready.

Depends on:

- Agents A through F

Tasks:

- Wire service package into Terraform
- Confirm environment variables line up
- Deploy to AWS
- Run an end-to-end webhook test
- Fix glue issues between handlers, infra, and workflows
- Prepare short demo notes

Output:

A working deployable MVP with a clear demo path.

Done when:

- Webhook request works end to end
- DynamoDB record is created
- Logs and alarms are visible

## Copy-paste prompt template for an agent

Use this template when assigning a stage:

- Goal: [paste the stage goal]
- Scope: [paste allowed paths]
- Dependencies: [paste the required prior stages]
- Deliverables: [paste expected files or outputs]
- Done when: [paste acceptance checks]
- Constraints:
  - keep the MVP small
  - do not change shared contracts
  - prefer clear code over clever code
  - do not add secrets to the repo

## Recommended execution order

1. Finish S0 first
2. Run Agents A, B, and C in parallel
3. Run Agents D, E, and F in parallel
4. Run Agent G last for integration
5. Add optional polish only after the MVP is already deployed
