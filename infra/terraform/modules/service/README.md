# Service wrapper

This module wraps `terraform-aws-modules/lambda/aws` for PR Concierge.

It keeps the repository-specific Lambda concerns in one place:

- runtime environment variables for webhook processing
- deterministic deployment from a prebuilt zip artifact
- least-privilege DynamoDB and optional S3 write access
- structured JSON logging and log retention

Use this wrapper from the root module instead of calling the upstream Lambda module directly.
