<!-- markdownlint-disable-file -->

# Research: OpenTofu Infrastructure Migration

## Task Summary

Replace the repository's manual AWS CLI deployment and teardown flow with an OpenTofu-driven infrastructure workflow, add repo-local Terraform/OpenTofu modules for the full PR Concierge footprint, and update the operator scripts so `deploy.sh` and `destroy.sh` drive infrastructure changes through `tofu` rather than imperative `aws` CLI calls.

## Tool Usage and Verified Findings

### Workspace discovery

- `file_search` and `list_dir` confirmed that `.copilot-tracking/` did not exist before this planning pass, so there was no reusable research or plan state to resume.
- `read_file` confirmed the current infrastructure root in `infra/terraform/` is still a starter scaffold with only provider configuration, shared tags, and three basic variables.

### Current deployment implementation

- `read_file` on `scripts/deploy.sh` verified the current deploy path is fully imperative and AWS CLI based. It creates or updates:
  - DynamoDB table
  - optional S3 bucket
  - IAM role and inline policy
  - Lambda function code and configuration
  - API Gateway HTTP API
  - Lambda invoke permission
  - deployment output JSON in `.artifacts/`
- `read_file` on `scripts/destroy.sh` verified teardown is also imperative and AWS CLI based, with a special `DELETE_DATA=true` behavior that preserves DynamoDB and S3 by default.
- `read_file` on `scripts/package-lambda.sh` verified the current packaging path builds TypeScript, installs production dependencies into a staging directory, and zips `dist/`, `node_modules/`, `package.json`, and `package-lock.json`.

### Runtime and environment contract

- `read_file` on `.env.example`, `src/config/env.ts`, and `src/storage/evaluationRepository.ts` verified the deployed application expects these runtime values:
  - `GITHUB_WEBHOOK_SECRET`
  - `GITHUB_TOKEN`
  - `AWS_REGION`
  - `EVALUATIONS_TABLE_NAME`
  - `RAW_EVENT_BUCKET_NAME`
  - `ENABLE_RAW_EVENT_ARCHIVE`
  - `REQUIRED_LABELS`
  - `EVALUATION_REPOSITORY`
- The deployed path should set `EVALUATION_REPOSITORY=dynamodb`.
- The DynamoDB table shape needed by the app is simple and fixed: partition key `pk`, sort key `sk`, with `PutItem` writes only.

### Local tooling reality

- `run_in_terminal` verified that `tofu` is currently **not** installed locally in this workspace environment.
- `run_in_terminal` also verified that `terraform` **is** installed locally (`Terraform v1.14.8`).
- This means the migration plan must include OpenTofu installation and operator guidance, not just HCL changes.

## Current Repository State

### Infrastructure code today

- `infra/terraform/versions.tf` pins Terraform `>= 1.6.0` and AWS provider `~> 5.0`.
- `infra/terraform/variables.tf` only exposes `aws_region`, `environment`, and `service_name`.
- `infra/terraform/main.tf` only defines shared tags and outputs, so the real AWS footprint is still outside Terraform/OpenTofu.

### Deployment documentation today

- `README.md` says the supported deployment path is manual Bash plus AWS CLI.
- `infra/terraform/README.md` says Terraform is still validation-only scaffolding.
- `.github/workflows/deploy.yml` currently validates build plus Terraform formatting/init/validate, then prints a note saying scripts remain the active deployment path.

### Architectural target already documented in-repo

- `docs/project-overview.md` and `docs/build-by-stages.md` define the intended AWS footprint as:
  - Lambda
  - API Gateway HTTP API
  - DynamoDB
  - optional S3 raw archive
  - CloudWatch alarms
  - SNS notifications
- The docs also confirm the MVP should remain deterministic and small, which favors thin, composable modules over heavy platform abstraction.

## External Research: OpenTofu Guidance

### Module source and structure guidance

From OpenTofu docs:

- Closely related modules inside the same repository should use **local relative module paths** such as `./modules/service` rather than absolute paths.
- Reusable modules should follow the standard structure with at least:
  - `README.md`
  - `main.tf`
  - `variables.tf`
  - `outputs.tf`
- Nested reusable modules should live under a top-level `modules/` directory.
- Examples should live under `examples/` when the implementation work starts.

### CLI guidance for automation

From OpenTofu docs:

- `tofu init` is safe to rerun and should be the first command in automation.
- `tofu init`, `tofu apply`, and `tofu destroy` support the global `-chdir` option, which is the recommended way to point automation at `infra/terraform`.
- `tofu apply -auto-approve` is the non-interactive path for script automation.
- `tofu destroy` is effectively `tofu apply -destroy`, so a destroy script can stay very small.
- `-var` and `-var-file` are supported for root input variables, which means the existing `.env`-driven operator flow can map cleanly to `TF_VAR_*` exports or a generated temporary `tfvars.json` file.

## External Research: Candidate Upstream Modules

### 1. Lambda compute and packaging

**Candidate:** `terraform-aws-modules/lambda/aws` (`8.8.0` at research time)

**Evidence from docs:**

- ~117.5M all-time downloads on the Terraform Registry page.
- Supports:
  - Lambda creation
  - IAM role creation and inline policy statements
  - existing local package deployment via `create_package = false` and `local_existing_package`
  - build/package workflows
  - log group settings
  - environment variables
  - Lambda permissions via `allowed_triggers`

**Fit for this repo:**

- Strong fit for the Lambda resource itself.
- Strong fit for runtime IAM because the module already supports policy statements.
- Moderate fit for packaging because the repo already has a working `scripts/package-lambda.sh`, while the upstream module's built-in packaging adds a Python dependency and a more complex packaging model.

**Recommended use:**

Use this upstream module inside a local wrapper module for the Lambda function, but keep the artifact build deterministic and repo-specific by generating the zip with a `terraform_data`/`local-exec` step that invokes the existing packaging logic. That keeps `deploy.sh` OpenTofu-only from the operator perspective while avoiding an unnecessary packaging rewrite in the first migration.

### 2. API Gateway HTTP API

**Candidate:** `terraform-aws-modules/apigateway-v2/aws` (`6.1.0` at research time)

**Evidence from docs:**

- ~5.4M all-time downloads.
- Supports HTTP APIs, routes, integrations, stages, access logs, custom domains, and route-level settings.
- Outputs include `api_endpoint`, `api_execution_arn`, and stage outputs needed for permissions and deployment summaries.

**Fit for this repo:**

- Excellent fit because the application only needs an HTTP API with two routes:
  - `GET /health`
  - `POST /webhooks/github`
- Access log settings align with the repo's structured logging goals.

**Important implementation note:**

Use a separate `aws_lambda_permission` resource outside the API module instead of trying to wire permissions inside the Lambda module with `allowed_triggers`. That avoids a dependency cycle between:

- Lambda outputs needed by the API module, and
- API execution ARN needed by Lambda invoke permissions.

### 3. DynamoDB table

**Candidate:** `terraform-aws-modules/dynamodb-table/aws` (`5.5.0` at research time)

**Evidence from docs:**

- ~29.2M all-time downloads.
- Supports simple tables, PAY_PER_REQUEST billing, encryption, point-in-time recovery, deletion protection, TTL, and outputs for table ARN/ID.

**Fit for this repo:**

- Excellent fit because the app only needs one table with:
  - `pk` hash key
  - `sk` range key
  - on-demand billing
- This module is more mature than hand-writing the table resource and still keeps configuration concise.

### 4. Optional S3 raw-event archive bucket

**Candidate:** `terraform-aws-modules/s3-bucket/aws` (`5.13.0` at research time)

**Evidence from docs:**

- ~197.7M all-time downloads.
- Supports conditional creation, versioning, server-side encryption, public access block, lifecycle rules, and safe force-destroy behaviors.

**Fit for this repo:**

- Strong fit for the optional raw-event archive bucket because the repo only needs a private application bucket with secure defaults.
- The module's `create_bucket` flag aligns well with `ENABLE_RAW_EVENT_ARCHIVE`.

### 5. SNS notifications

**Candidate:** `terraform-aws-modules/sns/aws` (`7.1.0` at research time)

**Evidence from docs:**

- ~16.7M all-time downloads.
- Supports topic creation, topic policies, subscriptions, and outputs for topic ARN and name.

**Fit for this repo:**

- Strong fit for alarm notifications.
- Keeps the alarm destination configuration simple and easier to expand later if email, HTTPS, or Lambda subscriptions are added.

### 6. CloudWatch alarms

**Candidate:** `terraform-aws-modules/cloudwatch/aws//modules/metric-alarm`

**Evidence from docs:**

- The CloudWatch registry module has ~23.2M all-time downloads overall.
- The `metric-alarm` submodule supports standard alarm fields cleanly without over-abstracting the underlying CloudWatch metric alarm resource.

**Fit for this repo:**

- Good fit for exactly two MVP alarms:
  - Lambda errors alarm
  - API Gateway 5xx alarm

**Exact metric guidance from AWS docs:**

- Lambda invocation errors are exposed as the `Errors` metric and should be viewed with the `Sum` statistic.
- HTTP API metrics include `5xx`, `4xx`, `Count`, `Latency`, and `IntegrationLatency`.
- HTTP API metrics can be filtered by `ApiId` or `ApiId, Stage` dimensions.

### 7. IAM role management

**Candidate:** `terraform-aws-modules/iam/aws`

**Evidence from docs:**

- ~363.6M all-time downloads.
- The root module is **not directly usable** because it has no root configuration; consumers must use submodules such as `//modules/iam-role` or `//modules/iam-policy`.

**Fit for this repo:**

- Mixed fit for the Lambda runtime role because `terraform-aws-modules/lambda/aws` already creates a role and attaches policy statements.
- Better fit for future CI/OIDC work than for the Lambda execution role in this migration.

**Recommended use:**

- Do **not** add a separate IAM wrapper for the Lambda runtime role in the first pass.
- Let the Lambda wrapper own its execution role and policy statements.
- Revisit the IAM module only if the implementation also expands CI/CD to provision a GitHub OIDC deploy role.

## Recommended Module Strategy

The best fit for this repository is **not** to wire every upstream module directly from the root. Instead, create repo-local wrapper modules in `infra/terraform/modules/` that encapsulate the project's naming, tagging, variable conventions, and route wiring while delegating resource-heavy concerns to well-supported upstream modules.

Recommended local module layout:

- `infra/terraform/modules/service/`
  - wraps `terraform-aws-modules/lambda/aws`
  - owns Lambda settings, runtime IAM statements, environment variables, and log retention
- `infra/terraform/modules/http_api/`
  - wraps `terraform-aws-modules/apigateway-v2/aws`
  - owns HTTP routes, stage config, and access logging
- `infra/terraform/modules/data/`
  - wraps `terraform-aws-modules/dynamodb-table/aws`
  - optionally wraps `terraform-aws-modules/s3-bucket/aws`
- `infra/terraform/modules/observability/`
  - wraps `terraform-aws-modules/sns/aws`
  - instantiates CloudWatch metric alarms for Lambda errors and API Gateway 5xx

This approach follows OpenTofu's relative-path guidance while still using vetted upstream modules where they add the most value.

## Recommended Root Composition

The root `infra/terraform/` module should compose the local modules and keep cross-module wiring obvious.

Suggested responsibilities at the root level:

- shared provider and version settings
- service-wide naming and tags
- top-level variables for all operator inputs
- cross-module glue resources that do not belong to a single wrapper module, especially:
  - `aws_lambda_permission` for API Gateway invoke access
  - deployment summary outputs used by `scripts/deploy.sh`

Example composition shape:

```hcl
module "data" {
  source = "./modules/data"

  service_name              = var.service_name
  environment               = var.environment
  evaluations_table_name    = var.evaluations_table_name
  enable_raw_event_archive  = var.enable_raw_event_archive
  raw_event_bucket_name     = var.raw_event_bucket_name
  tags                      = local.common_tags
}

module "service" {
  source = "./modules/service"

  function_name            = var.function_name
  lambda_runtime           = var.aws_lambda_runtime
  lambda_timeout           = var.aws_lambda_timeout
  lambda_memory_size       = var.aws_lambda_memory_size
  github_webhook_secret    = var.github_webhook_secret
  github_token             = var.github_token
  evaluations_table_name   = module.data.evaluations_table_name
  raw_event_bucket_name    = module.data.raw_event_bucket_name
  enable_raw_event_archive = var.enable_raw_event_archive
  required_labels          = var.required_labels
  evaluation_repository    = "dynamodb"
  tags                     = local.common_tags
}

module "http_api" {
  source = "./modules/http_api"

  api_name                  = var.api_name
  lambda_invoke_arn         = module.service.lambda_function_invoke_arn
  access_log_retention_days = var.api_access_log_retention_days
  tags                      = local.common_tags
}

resource "aws_lambda_permission" "http_api" {
  statement_id  = "AllowExecutionFromHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = module.service.lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${module.http_api.api_execution_arn}/*/*"
}
```

## Recommended Script Migration Strategy

### `scripts/deploy.sh`

Recommended behavior after migration:

1. Require `tofu` instead of `aws`.
2. Keep loading `.env` via `common.sh` so operator ergonomics stay the same.
3. Export `TF_VAR_*` values derived from the existing `.env` variables.
4. Run:
   - `tofu -chdir=infra/terraform init`
   - `tofu -chdir=infra/terraform apply -auto-approve`
5. Generate `.artifacts/${SERVICE_NAME}-deployment.json` from `tofu output -json`.

That preserves the current operator entrypoint while moving infrastructure control fully into OpenTofu.

### `scripts/destroy.sh`

Recommended behavior after migration:

- Default path: preserve today's safety behavior by destroying only non-data resources.
- `DELETE_DATA=true`: perform full `tofu destroy -auto-approve`.

The cleanest long-term pattern would be separate state boundaries for data and compute. For the MVP migration, the least disruptive option is:

- keep one root stack, and
- use targeted destroy for compute/API/observability resources by default.

This is not as elegant as multiple state stacks, but it preserves today's operator expectation without forcing a larger state-layout redesign into the same change.

### `scripts/common.sh`

Recommended follow-up changes:

- add `tofu`-oriented helpers where useful
- remove AWS account/partition helpers if they become unused after the migration
- keep defensive Bash patterns already present (`set -Eeuo pipefail`, quoting, reusable helpers)

## Security and State Implications

This migration has one important design tradeoff:

- The application currently expects raw secret values in Lambda environment variables.
- If OpenTofu manages those environment variables directly, the secret values will exist in state.

Recommended MVP posture:

- keep the current runtime contract to avoid widening application scope during the infra migration,
- mark the corresponding OpenTofu variables as `sensitive`, and
- document that state storage must be protected.

Recommended future hardening path:

- move the app to read secrets from SSM Parameter Store or Secrets Manager,
- then update Terraform/OpenTofu to provision references rather than raw values.

## Documentation and Workflow Changes Required

Any implementation that follows this research must update at least:

- `README.md`
- `infra/terraform/README.md`
- `.github/workflows/deploy.yml`

Those files currently describe Terraform as validation-only and Bash plus AWS CLI as the active deployment path. That will become false once OpenTofu is the source of truth.

## Recommended Implementation Order

1. Expand `infra/terraform/` into a real OpenTofu root with complete variables, outputs, and wrapper modules.
2. Migrate Lambda, API, DynamoDB, S3, SNS, and alarm resources into OpenTofu.
3. Replace deploy and destroy script internals with `tofu` automation while keeping the same entrypoint filenames.
4. Update docs and workflow messaging so the repository no longer claims Terraform is scaffolding only.

## Implementation Guidance Based on Evidence

- Use upstream modules where they are clearly mature and high-fit:
  - Lambda
  - API Gateway v2
  - DynamoDB table
  - S3 bucket
  - SNS topic
  - CloudWatch metric alarms
- Prefer repo-local wrappers so naming, tagging, env mapping, and outputs stay readable.
- Keep Lambda invoke permission outside the wrapper modules to avoid dependency cycles.
- Preserve `.env` as the operator input surface, but translate it into `TF_VAR_*` exports in the scripts.
- Preserve the current `DELETE_DATA` safety behavior unless the user explicitly approves a semantic change.
- Update CI and docs in the same change so the repository tells the truth about its deployment path.