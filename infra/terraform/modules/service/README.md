# Service wrapper

This module wraps `terraform-aws-modules/lambda/aws` for PR Concierge.

It keeps the repository-specific Lambda concerns in one place:

- encrypted SSM parameters for GitHub runtime inputs
- Lambda environment variables that point at those SSM parameter names
- deterministic deployment from a prebuilt zip artifact
- least-privilege DynamoDB, SSM read, and optional S3 write access
- structured JSON logging and log retention

Use this wrapper from the root module instead of calling the upstream Lambda module directly.
