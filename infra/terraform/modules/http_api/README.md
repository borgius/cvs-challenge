# HTTP API wrapper

This module wraps `terraform-aws-modules/apigateway-v2/aws` for PR Concierge.

It keeps the API surface intentionally small:

- `GET /health`
- `POST /webhooks/github`
- structured access logs with CloudWatch retention
- stable outputs for the invoke URL and execution ARN

Use the root module to connect Lambda permissions so the API and service wrappers stay loosely coupled.
