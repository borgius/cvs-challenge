# Terraform starter

This directory is the starting point for the PR Concierge AWS footprint.

## Intended resources

- API Gateway HTTP API
- Lambda functions for `GET /health` and `POST /webhooks/github`
- DynamoDB table for evaluation records
- optional S3 bucket for raw webhook archives
- CloudWatch alarms for Lambda errors and API Gateway 5XX responses
- SNS topic for alarm notifications

## Current state

The initial files are intentionally minimal so that Terraform validation works while the real resource graph is still being added.

## Next implementation step

Expand the starter configuration into modules or root resources for:

1. API and Lambda packaging
2. DynamoDB persistence
3. observability resources
4. GitHub Actions deployment variables and AWS OIDC trust wiring
