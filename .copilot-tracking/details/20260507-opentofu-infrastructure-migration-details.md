<!-- markdownlint-disable-file -->

# Task Details: OpenTofu Infrastructure Migration

## Research Reference

**Source Research**: #file:../research/20260507-opentofu-infrastructure-migration-research.md

## Phase 1: Establish the OpenTofu root contract

### Task 1.1: Expand the root module into a real OpenTofu entrypoint

Replace the starter-only `infra/terraform/` root with a full OpenTofu composition layer. The root should own provider/version settings, common tags, top-level inputs, and the outputs that `deploy.sh` will later serialize into `.artifacts/${SERVICE_NAME}-deployment.json`.

- **Files**:
  - `infra/terraform/main.tf` - Compose local wrapper modules and shared locals
  - `infra/terraform/variables.tf` - Add the full operator/runtime variable surface
  - `infra/terraform/versions.tf` - Switch to an OpenTofu-compatible version contract and update provider constraints as needed
  - `infra/terraform/outputs.tf` - Expose API endpoint, health URL, webhook URL, Lambda identifiers, and data resource names
- **Success**:
  - The root module accepts all values currently sourced from `.env` and the deploy scripts
  - The root module emits enough outputs to replace the existing deploy summary JSON logic
  - The root module uses relative child-module paths under `./modules/`
- **Research References**:
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 49-72) - Current Terraform root is only a scaffold and does not yet model the AWS footprint
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 74-97) - OpenTofu module structure, relative module path guidance, and automation CLI behavior
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 258-318) - Recommended root composition and cross-module glue responsibilities
- **Dependencies**:
  - Verified research baseline

### Task 1.2: Create repo-local wrapper modules that hide upstream complexity

Create four local wrapper modules under `infra/terraform/modules/` so the repository owns naming, tags, environment mapping, and outputs while still depending on mature upstream modules where appropriate.

- **Files**:
  - `infra/terraform/modules/service/main.tf` - Lambda wrapper implementation
  - `infra/terraform/modules/service/variables.tf` - Lambda wrapper inputs
  - `infra/terraform/modules/service/outputs.tf` - Lambda wrapper outputs
  - `infra/terraform/modules/service/README.md` - Wrapper module usage notes
  - `infra/terraform/modules/http_api/main.tf` - HTTP API wrapper implementation
  - `infra/terraform/modules/http_api/variables.tf` - HTTP API wrapper inputs
  - `infra/terraform/modules/http_api/outputs.tf` - HTTP API wrapper outputs
  - `infra/terraform/modules/http_api/README.md` - Wrapper module usage notes
  - `infra/terraform/modules/data/main.tf` - DynamoDB and optional S3 wrapper implementation
  - `infra/terraform/modules/data/variables.tf` - Data wrapper inputs
  - `infra/terraform/modules/data/outputs.tf` - Data wrapper outputs
  - `infra/terraform/modules/data/README.md` - Wrapper module usage notes
  - `infra/terraform/modules/observability/main.tf` - SNS and alarm wrapper implementation
  - `infra/terraform/modules/observability/variables.tf` - Observability wrapper inputs
  - `infra/terraform/modules/observability/outputs.tf` - Observability wrapper outputs
  - `infra/terraform/modules/observability/README.md` - Wrapper module usage notes
- **Success**:
  - Each local module follows the OpenTofu-recommended minimal structure
  - Each wrapper exposes only project-relevant inputs and hides raw upstream module sprawl
  - The wrapper set matches the repository's actual lifecycle boundaries: service, API, data, and observability
- **Research References**:
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 76-88) - Standard module structure guidance for local reusable modules
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 237-256) - Recommended local wrapper strategy for this repo
- **Dependencies**:
  - Task 1.1 completion

## Phase 2: Implement the AWS footprint with vetted upstream modules

### Task 2.1: Implement the Lambda service wrapper around the upstream Lambda module

Wrap `terraform-aws-modules/lambda/aws` in `modules/service` and keep the repo's packaging logic deterministic. The wrapper should manage Lambda configuration, environment variables, runtime IAM policy statements, and outputs required by the API and alarms.

- **Files**:
  - `infra/terraform/modules/service/main.tf` - Instantiate `terraform-aws-modules/lambda/aws`, wire IAM policy statements, and connect the artifact path
  - `infra/terraform/modules/service/variables.tf` - Define runtime, environment, and packaging inputs
  - `infra/terraform/modules/service/outputs.tf` - Output function name, ARN, invoke ARN, log group, and role identifiers
  - `scripts/package-lambda.sh` - Reuse or lightly adapt if the implementation triggers packaging from OpenTofu automation
- **Success**:
  - The wrapper can deploy the current Hono Lambda artifact without AWS CLI resource calls
  - The Lambda execution role includes DynamoDB write permission and optional S3 put permission when raw archiving is enabled
  - The wrapper surfaces a stable invoke ARN for the HTTP API integration
- **Research References**:
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 101-126) - Lambda module capabilities and recommended packaging posture
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 217-236) - IAM guidance showing why a separate runtime IAM wrapper is unnecessary in the first pass
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 258-318) - Root/module composition example including service wrapper usage
- **Dependencies**:
  - Phase 1 completion

### Task 2.2: Implement the HTTP API wrapper and root-level Lambda permission

Wrap `terraform-aws-modules/apigateway-v2/aws` in `modules/http_api` to create the HTTP API, default stage, routes, integrations, and access logs. Keep the `aws_lambda_permission` resource outside the wrapper to avoid dependency cycles.

- **Files**:
  - `infra/terraform/modules/http_api/main.tf` - Instantiate the API module with `/health` and `/webhooks/github` routes
  - `infra/terraform/modules/http_api/variables.tf` - Accept API name, Lambda invoke ARN, and logging options
  - `infra/terraform/modules/http_api/outputs.tf` - Expose API endpoint, execution ARN, and stage outputs
  - `infra/terraform/main.tf` - Add the root-level `aws_lambda_permission` glue resource
- **Success**:
  - The wrapper creates an HTTP API with the two routes required by the application
  - Access logs are enabled with a structured format suitable for operators
  - Lambda invoke permissions are wired without a circular dependency between modules
- **Research References**:
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 127-150) - API Gateway module fit and the explicit cycle-avoidance note
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 258-318) - Root-level composition example showing the separate `aws_lambda_permission`
- **Dependencies**:
  - Task 2.1 completion

### Task 2.3: Implement the data wrapper for DynamoDB and optional S3

Wrap `terraform-aws-modules/dynamodb-table/aws` and `terraform-aws-modules/s3-bucket/aws` in `modules/data`. The data wrapper should make the mandatory DynamoDB table straightforward and the archive bucket conditional.

- **Files**:
  - `infra/terraform/modules/data/main.tf` - Instantiate the DynamoDB table module and conditionally the S3 bucket module
  - `infra/terraform/modules/data/variables.tf` - Accept table name, archive toggle, bucket name, retention/security toggles, and tags
  - `infra/terraform/modules/data/outputs.tf` - Expose table ARN/name and optional bucket ARN/name
- **Success**:
  - The DynamoDB table matches the app contract (`pk`, `sk`, on-demand billing)
  - The archive bucket is only created when enabled
  - The wrapper outputs enough data for Lambda IAM and deployment summaries
- **Research References**:
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 151-181) - DynamoDB and S3 module selection with project-fit rationale
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 29-41) - Runtime contract showing table and archive-related application inputs
- **Dependencies**:
  - Phase 1 completion

### Task 2.4: Implement observability with SNS and CloudWatch alarms

Wrap `terraform-aws-modules/sns/aws` plus CloudWatch metric alarm resources in `modules/observability`. The first pass only needs the MVP signals documented by the repo: Lambda errors and HTTP API 5xx responses.

- **Files**:
  - `infra/terraform/modules/observability/main.tf` - Instantiate SNS and alarm resources
  - `infra/terraform/modules/observability/variables.tf` - Accept Lambda name, API identifiers, alarm thresholds, and topic subscription settings
  - `infra/terraform/modules/observability/outputs.tf` - Expose topic ARN/name and alarm identifiers
- **Success**:
  - The observability wrapper creates an SNS topic suitable for alarm delivery
  - The Lambda alarm uses the `Errors` metric with the `Sum` statistic
  - The HTTP API alarm uses the HTTP API `5xx` metric with the appropriate API dimensions
- **Research References**:
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 182-216) - SNS and CloudWatch module research plus exact alarm metric guidance
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 63-72) - Repo docs confirming alarms and SNS are part of the intended footprint
- **Dependencies**:
  - Tasks 2.1 and 2.2 completion

## Phase 3: Replace AWS CLI orchestration with OpenTofu script automation

### Task 3.1: Convert `deploy.sh` into an OpenTofu apply workflow

Keep `scripts/deploy.sh` as the operator entrypoint, but replace all imperative AWS CLI resource creation with OpenTofu commands. The script should continue loading `.env`, translate those values into `TF_VAR_*` exports or a temporary `.tfvars.json`, run OpenTofu, and persist deployment outputs.

- **Files**:
  - `scripts/deploy.sh` - Replace AWS CLI orchestration with `tofu init` and `tofu apply`
  - `scripts/common.sh` - Add any shared helpers needed for OpenTofu invocation or TF_VAR mapping
- **Success**:
  - The deploy script no longer shells out to `aws` for resource provisioning
  - The deploy script still produces `.artifacts/${SERVICE_NAME}-deployment.json`
  - The deploy script checks for `tofu` and documents how missing tooling is handled
- **Research References**:
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 16-28) - Current deploy behavior that must be replaced
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 89-97) - OpenTofu CLI automation guidance for `init`, `apply`, and input variables
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 320-334) - Recommended deploy script migration path
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 358-375) - State/security note for raw secret values flowing through infra
- **Dependencies**:
  - Phase 2 completion

### Task 3.2: Convert `destroy.sh` to OpenTofu destroy semantics while preserving safety

Replace the AWS CLI teardown logic with OpenTofu destroy commands. Preserve the current operator expectation that data resources survive by default unless `DELETE_DATA=true` is explicitly set.

- **Files**:
  - `scripts/destroy.sh` - Replace AWS CLI teardown with OpenTofu destroy logic
  - `scripts/common.sh` - Remove no-longer-needed AWS CLI helpers when safe, and add shared OpenTofu helpers if useful
- **Success**:
  - The default destroy path removes compute/API/observability resources without deleting DynamoDB and S3 data resources
  - `DELETE_DATA=true` performs full stack destruction
  - The destroy script no longer requires the AWS CLI for resource deletion
- **Research References**:
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 16-28) - Current destroy behavior, including `DELETE_DATA`
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 336-356) - Recommended destroy/common script migration strategy and default safety posture
- **Dependencies**:
  - Task 3.1 completion

## Phase 4: Make the repository honest about the new deployment path

### Task 4.1: Update docs to describe OpenTofu as the active deployment path

Once the implementation is complete, update all documentation that still claims Terraform is only validation scaffolding or that Bash plus AWS CLI is the real deployment mechanism.

- **Files**:
  - `README.md` - Replace the manual AWS CLI deployment section with OpenTofu-based guidance
  - `infra/terraform/README.md` - Document module layout, inputs, and the active deployment path
  - `AGENTS.md` - Update setup and verification guidance if commands or expectations change materially
- **Success**:
  - The README and infra docs describe the new OpenTofu workflow accurately
  - Environment variables, prerequisites, and verification steps stay aligned with the actual scripts
  - Operator expectations around `DELETE_DATA`, `tofu`, and artifact generation are documented
- **Research References**:
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 57-62) - Current doc drift that will become wrong after implementation
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 376-384) - Explicit list of docs and workflow files that must change
- **Dependencies**:
  - Phase 3 completion

### Task 4.2: Update workflow and verification expectations for OpenTofu

Adjust repo automation and verification notes so CI no longer presents Terraform as a validation-only scaffold. The workflow should validate the real OpenTofu configuration and the docs should point contributors to the correct checks.

- **Files**:
  - `.github/workflows/deploy.yml` - Replace the validation-only note and update IaC setup as needed for OpenTofu
  - `README.md` - Reflect the new validation commands if they change
  - `infra/terraform/README.md` - Reflect the new verification commands if they change
- **Success**:
  - Workflow messaging matches the new deployment model
  - Verification steps point to the real OpenTofu commands that contributors should run
  - No file in the repo still advertises Terraform as scaffolding-only after the migration lands
- **Research References**:
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 57-62) - Existing deploy workflow still says the scripts are AWS CLI based
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 376-384) - Required workflow/doc updates
  - #file:../research/20260507-opentofu-infrastructure-migration-research.md (Lines 386-402) - Recommended implementation order and evidence-based guidance for keeping docs/workflows aligned
- **Dependencies**:
  - Task 4.1 completion

## Dependencies

- OpenTofu installed and available as `tofu`
- AWS credentials still available to the OpenTofu AWS provider during apply/destroy
- Existing Node/npm packaging path retained or intentionally replaced in a controlled way

## Success Criteria

- The repository has a complete OpenTofu root plus local wrapper modules for service, API, data, and observability
- `scripts/deploy.sh` and `scripts/destroy.sh` orchestrate infrastructure through OpenTofu instead of the AWS CLI
- Deployment outputs still land in `.artifacts/` in a machine-readable format
- Repo docs and workflow messaging describe OpenTofu as the active deployment path