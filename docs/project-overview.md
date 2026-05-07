# PR Concierge — Project Overview

## Goal

PR Concierge is a small internal platform service for pull request hygiene and release awareness.
When GitHub sends a pull request webhook, the service validates the request, applies a few platform rules, scores the PR risk, stores the result, and returns a short report that developers can act on.

This project is intentionally small. The goal is to ship a clean MVP in about 3 hours, not to build a full developer portal.

## Why this project fits the challenge

- It supports a real developer workflow.
- It can be deployed with Terraform and GitHub Actions.
- It is easy to expose with API Gateway.
- It uses AWS-native observability.
- It has a clean path to AI assistance without making AI the core dependency.

## Primary users

- Application developers opening pull requests
- Platform engineers maintaining repo standards
- Tech leads or release owners who need a fast risk signal

## Main user experience

1. A developer opens or updates a pull request.
2. GitHub sends a webhook to API Gateway.
3. Lambda verifies the webhook signature.
4. The service fetches changed files from the GitHub API.
5. The service runs rule checks:
   - branch naming
   - optional required labels
   - risk score from changed paths
6. The service stores the evaluation in DynamoDB.
7. The service optionally stores the raw event JSON in S3.
8. The service returns or posts a short summary such as:
   - `risk: high`
   - `branch naming: pass`
   - `changed areas: terraform, iam`
   - `next step: platform review required`

## MVP scope

The MVP should include:

- `POST /webhooks/github`
- `GET /health`
- GitHub webhook signature validation
- PR event handling for `opened`, `synchronize`, and `reopened`
- Risk classification from changed files
- DynamoDB record for each evaluation
- Structured JSON logging
- CloudWatch alarm for Lambda errors
- SNS topic for alarm notifications
- Manual Bash deployment scripts that create and update the AWS footprint with the AWS CLI

## Stretch scope

If time remains:

- Post a comment back to GitHub
- Require labels such as `safe-to-deploy` or `needs-platform-review`
- Store raw webhook payloads in S3
- Use Bedrock to rewrite the deterministic summary into a short reviewer note
- Add a small CloudWatch dashboard

## Architecture

Main components:

- GitHub Webhook
- API Gateway HTTP API
- Lambda service written in TypeScript
- DynamoDB table for evaluation results
- Optional S3 bucket for raw payload archive
- CloudWatch logs, metrics, and alarms
- SNS topic for alert delivery
- GitHub Actions for repo validation
- Bash deployment scripts that drive AWS CLI resource creation and updates

## Key design choices

### Lambda over ECS

Lambda is the better fit for a 3-hour build. It keeps the infrastructure small and lets us focus on the platform workflow.

### DynamoDB over RDS

The data is simple and event-shaped. DynamoDB is faster to wire up and easier to operate in a short challenge.

### Rules before AI

The first version should be deterministic. AI can improve summaries later, but the core workflow should still work when AI is off.

### Node.js 20 runtime with TypeScript

The deployed runtime should be standard AWS Lambda Node.js 20.
This repo already uses Bun for local scripts, so Bun can still be used for local install, build, and test commands if helpful. The final artifact should still target Node.js 20 for AWS.

### Manual Bash deployment over full Terraform rollout

For the current repository stage, manual Bash scripts are the supported deployment path.
That keeps the deployment flow concrete and easy to run after an `aws` login while Terraform stays as a validation scaffold for future infrastructure work.

## Data model

Each PR evaluation record should contain:

- `pk`: repo and PR number
- `sk`: timestamp or event id
- `action`
- `branch_name`
- `base_branch`
- `changed_files`
- `risk_level`
- `checks`
- `summary`
- `created_at`

Optional fields:

- `raw_event_s3_key`
- `github_delivery_id`
- `repository_full_name`
- `head_sha`

## Security model

- GitHub webhook secret stored in SSM Parameter Store or Secrets Manager
- GitHub token stored in SSM Parameter Store or Secrets Manager
- Least-privilege IAM for Lambda, DynamoDB, S3, CloudWatch, and SNS
- GitHub Actions deploys with AWS OIDC, not long-lived AWS keys

## Observability

- Structured JSON logs with request id, repo, PR number, action, and risk
- CloudWatch alarm on Lambda errors
- CloudWatch alarm on API Gateway 5XX errors
- Optional dashboard with invocation count, duration, and errors

## AI-native workflow

AI should be visible in the repo and process:

- Include agent instructions or tool configuration in the repo
- Leave one PR open with AI-assisted iteration
- Use AI for scaffolding, refactoring, test generation, and doc cleanup
- Record where AI helped and where manual correction was needed

Optional runtime AI:

- Use Bedrock to rewrite the deterministic summary into a short reviewer note
- Keep the risk decision deterministic, and use AI only for wording

## Demo path

A good demo should show:

1. Terraform plan or deployed stack screenshot
2. GitHub webhook hitting the service
3. Evaluation saved in DynamoDB
4. Logs in CloudWatch
5. Alarm wiring via SNS
6. Optional GitHub comment on the PR

## Non-goals

To protect time, do not build:

- A full web UI
- Complex auth
- Many repo policies
- Deep PR analysis with AI in the first pass
- Multi-repo tenancy in the MVP

## Definition of success

The project is successful if a reviewer can see that:

- The service solves a real platform problem
- The infrastructure is safe and readable
- The CI/CD flow is credible
- The service is observable
- The scope was controlled with good engineering judgment
