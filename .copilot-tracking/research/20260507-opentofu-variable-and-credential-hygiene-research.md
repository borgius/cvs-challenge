<!-- markdownlint-disable-file -->

# Research: OpenTofu Variable and Credential Hygiene

## Task Summary

Investigate official OpenTofu guidance for managing root variables, tfvars files, backend inputs, and AWS credentials, compare that guidance to the repository's current deployment flow, and identify a cleaner operator model for this repo.

## Tool Usage and Verified Findings

### Workspace inspection

- `read_file` verified the current deployment flow in `scripts/deploy.sh`, `scripts/common.sh`, `infra/terraform/backend.tf`, `infra/terraform/variables.tf`, `infra/terraform/versions.tf`, `README.md`, `infra/terraform/README.md`, `.env.example`, and `.gitignore`.
- `grep_search` verified that the root AWS provider configuration lives in `infra/terraform/versions.tf` and currently does not set account guardrails such as `allowed_account_ids`.
- `fetch_webpage` gathered official OpenTofu documentation for input variables, backend configuration, S3 backend guidance, provider configuration, apply/ephemeral behavior, and state sensitivity, plus AWS provider authentication guidance from the Terraform Registry.
- `run_in_terminal` was used for repository overview and confirmed the workspace is already structured around OpenTofu-driven deployment scripts.

### Current repository behavior

#### 1. The deploy script generates one large temporary tfvars file

`scripts/deploy.sh` currently loads `.env`, normalizes some booleans, and writes a temporary `*.tfvars.json` file that includes nearly every root input, including:

- non-secret infrastructure settings such as `environment`, `service_name`, `api_stage_name`, retention periods, and archive toggles
- application runtime secrets such as `github_webhook_secret` and `github_token`
- application wiring values such as `evaluations_table_name` and `required_labels`

This is functionally valid, but it mixes three different concerns into one delivery path:

1. stable, non-secret infrastructure configuration
2. backend/bootstrap coordinates
3. secret application values

That mixing is the main reason the current flow feels ugly.

#### 2. The backend file is generated separately and is less problematic

`scripts/common.sh` generates a temporary `.tfbackend` file with:

- `bucket`
- `key`
- `region`
- `encrypt = true`
- `dynamodb_table`

This file does **not** currently include AWS access keys or session credentials. That matters: the current backend helper is noisy, but it is not the same class of problem as passing credentials through backend config.

#### 3. Provider credentials are already expected to come from AWS-standard sources

`infra/terraform/versions.tf` configures only:

```hcl
provider "aws" {
  region = var.aws_region
}
```

So the root module already expects AWS authentication to come from the standard AWS credential chain rather than from explicit `access_key` or `secret_key` arguments.

#### 4. The repo uses one flat `.env` for almost everything

`.env.example` contains:

- app secrets
- backend coordinates
- naming overrides
- Lambda/API tuning knobs
- archive and alarm settings

That makes bootstrap easy, but it also turns one file into the source for too many categories of values.

#### 5. Local secret-handling guardrails are incomplete

`.gitignore` excludes:

- `.env`
- `.terraform/`
- `*.tfstate`

But it does **not** currently ignore:

- `*.tfvars`
- `*.tfvars.json`
- `*.tfbackend`

That is acceptable only because the current scripts use temporary files. If the repo moves toward local per-environment tfvars files, ignore rules or example-file conventions must be added in the same change.

#### 6. The root variables mark secrets as sensitive, but not ephemeral

`infra/terraform/variables.tf` declares `github_webhook_secret` and `github_token` with `sensitive = true`.

That means OpenTofu will redact them in CLI output, but they still remain in state if they are used in persisted resource attributes such as Lambda environment variables.

## External Research: Official OpenTofu Guidance

### 1. Root input variables have three normal delivery mechanisms

From OpenTofu's input variable documentation:

- root variables can be assigned via `-var`
- root variables can be assigned via `-var-file`
- root variables can be assigned via `TF_VAR_<name>` environment variables

OpenTofu also auto-loads these files when present:

- `terraform.tfvars`
- `terraform.tfvars.json`
- `*.auto.tfvars`
- `*.auto.tfvars.json`

OpenTofu's documented precedence is:

1. environment variables
2. `terraform.tfvars`
3. `terraform.tfvars.json`
4. `*.auto.tfvars` / `*.auto.tfvars.json` in lexical order
5. explicit `-var` and `-var-file` flags, in the order they are passed

Important repo implication: stable non-secret infrastructure inputs do not need to be synthesized into a temporary file on every run. OpenTofu already has first-class support for readable per-environment tfvars files.

### 2. OpenTofu explicitly recommends tfvars files for complex, readable values

The variable documentation notes that complex values passed through `TF_VAR_...` or `-var` require shell-friendly string encoding, while variable definition files are easier to read and avoid escaping issues.

Important repo implication: values such as lists, maps, booleans, alarm subscriptions, and environment-specific tuning knobs are better represented in `*.tfvars` or `*.auto.tfvars` than in shell-exported environment variables.

### 3. Backend credentials should not be supplied through config files or `-backend-config`

OpenTofu's backend configuration docs contain a clear warning:

- use environment variables or conventional credential files for backend credentials and other sensitive backend data
- do not hardcode backend credentials in config
- do not pass sensitive backend values through `-backend-config`

Why: backend configuration is written in plain text to local `.terraform` metadata and is also captured in plan files.

Important repo implication: if the repo ever starts passing AWS credentials, tokens, or profile secrets through generated `.tfbackend` files or `-backend-config="key=value"`, that would be a genuine best-practice violation. The current script does not do this today.

### 4. Partial backend configuration is the intended pattern

OpenTofu recommends partial backend configuration when some backend values need to be supplied at init time. It also recommends the naming pattern:

- `*.backendname.tfbackend`

For S3, that means filenames like `dev.s3.tfbackend` are a natural fit.

Important repo implication: the repo can keep a partial backend pattern, but it should reserve backend files for backend coordinates, not credentials.

### 5. The S3 backend docs recommend environment variables or shared AWS config for authentication

From the OpenTofu S3 backend docs:

- `access_key` / `secret_key` can come from environment variables or AWS shared config files
- `profile` can come from `AWS_PROFILE`
- shared credential file locations can come from standard AWS environment variables
- `assume_role` and `assume_role_with_web_identity` are supported
- OpenTofu recommends using environment variables for credentials and other sensitive backend data

The same page also recommends:

- enabling bucket versioning for the state bucket
- encrypting state at rest
- protecting access to state because state is sensitive

Important repo implication: backend authentication should stay in the AWS credential chain, not in repo-local tfvars or backend files.

### 6. Native S3 locking is now the preferred S3-backend lock mode, but DynamoDB remains supported

The OpenTofu S3 backend docs describe two valid lock modes:

- native S3 locking via `use_lockfile = true`
- DynamoDB locking via `dynamodb_table`

The docs describe native S3 locking as the preferred option, while also stating that both S3 and DynamoDB locking remain supported.

Important repo implication: the repo does not need to change lock strategy as part of a tfvars cleanup, but it should treat lock-mode migration as a separate infrastructure decision rather than bundling it into credential hygiene work.

### 7. Provider configuration should prefer environment or role-based authentication over hard-coded credentials

OpenTofu's provider configuration docs recommend using shell environment variables or alternate sources such as instance profiles when providers support them, specifically to keep credentials out of version-controlled OpenTofu code.

The AWS provider docs reinforce this:

- hard-coded credentials in provider blocks are not recommended
- credentials can come from environment variables
- credentials can come from shared config and credential files
- credentials can come from container credentials or instance profiles
- role assumption and web identity are supported

The AWS provider precedence order is documented as:

1. provider block parameters
2. environment variables
3. shared credentials files
4. shared config files
5. container credentials
6. instance profile credentials

Important repo implication: the cleanest AWS auth path for this repository is one of:

- local AWS profile or AWS SSO login
- assumed role from a shared AWS profile
- CI OIDC / web identity

not values stored in `.env` or generated tfvars.

### 8. Sensitive values and ephemeral values solve different problems

From OpenTofu's variable and sensitive-data docs:

- `sensitive = true` redacts a value in CLI output
- `sensitive` values are still stored in state and plan files
- `ephemeral = true` omits values from state and plan files
- ephemeral values can only be used in ephemeral contexts such as providers, provisioners, connection blocks, write-only arguments, locals, and other ephemeral constructs

OpenTofu's apply docs also note that ephemeral values must be provided again at apply time when using a saved plan.

Important repo implication: `github_webhook_secret` and `github_token` are currently used as Lambda environment variables, which are persisted resource attributes. That means ephemeral variables are **not** a drop-in fix for those two values.

### 9. State itself must be treated as sensitive

OpenTofu's sensitive-state docs recommend:

- storing state remotely
- encrypting state at rest
- using access controls
- using audit logs where possible

Important repo implication: as long as Lambda environment variables contain app secrets, protecting the state bucket and lock backend is part of the secret-management model, not a side concern.

## Practical Interpretation for This Repository

### Category 1: Stable non-secret infrastructure inputs

These are inputs such as:

- `environment`
- `service_name`
- `function_name`
- `api_name`
- `alarm_topic_name`
- retention periods
- archive toggles
- alarm thresholds
- optional labels

Best-fit delivery mechanism:

- `*.tfvars` or `*.auto.tfvars` files
- checked-in example files, with real local files ignored if they contain environment-specific values the team does not want in Git

Reasoning:

- they are readable
- they preserve types naturally
- they avoid shell escaping
- they map directly to the way OpenTofu expects root input configuration

### Category 2: Backend coordinates

These are values such as:

- state bucket name
- state key
- backend region
- lock table name

Best-fit delivery mechanism:

- partial backend configuration file such as `dev.s3.tfbackend`
- or script-generated backend config if the team strongly prefers zero local files

Reasoning:

- backend settings are init-time inputs, not ordinary root variables
- they belong in the backend configuration lane, not the tfvars lane
- they are usually not secrets, but they still should stay clearly separate from application secrets and AWS credentials

### Category 3: AWS provider and backend credentials

These include:

- access keys
- session tokens
- AWS SSO sessions
- assumed roles
- OIDC/web identity credentials

Best-fit delivery mechanism:

- AWS shared credentials / shared config files
- `AWS_PROFILE`
- `aws sso login`
- `assume_role`
- CI OIDC / `AWS_ROLE_ARN` + `AWS_WEB_IDENTITY_TOKEN_FILE`

Reasoning:

- this follows OpenTofu and AWS provider guidance
- it keeps credentials out of repo files and tfvars
- it lets the same authentication mechanism work for both provider and backend access

### Category 4: Application secrets persisted into managed resources

For this repo, the main examples are:

- `github_webhook_secret`
- `github_token`

Short-term best-fit delivery mechanism:

- `TF_VAR_github_webhook_secret`
- `TF_VAR_github_token`

or an ignored local secret tfvars file if the team explicitly prefers file-based local secret handling.

Long-term best-fit delivery mechanism:

- store the values in AWS Secrets Manager or SSM Parameter Store
- inject references or runtime retrieval configuration instead of raw secret strings in the Lambda environment

Reasoning:

- as long as the Lambda resource stores raw secret values in its environment, those values remain in state
- no tfvars cleanup can fully solve that architectural fact

## Recommended Operator Model for This Repo

### Baseline recommendation

Use a three-lane model instead of the current single `.env` plus generated mega-tfvars flow.

#### Lane A: non-secret infrastructure config

Example local file:

```hcl
environment                          = "dev"
service_name                         = "pr-concierge"
function_name                        = "pr-concierge"
api_stage_name                       = "$default"
enable_raw_event_archive             = false
lambda_log_retention_in_days         = 14
api_access_log_retention_in_days     = 14
dynamodb_point_in_time_recovery_enabled = true
alarm_email_subscriptions            = []
```

Suggested storage model:

- commit `infra/terraform/env/dev.auto.tfvars.example`
- ignore `infra/terraform/env/*.auto.tfvars`
- load the real file automatically or via `-var-file`

#### Lane B: backend coordinates

Example local file:

```hcl
bucket         = "your-state-bucket"
key            = "pr-concierge/dev/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "your-lock-table"
encrypt        = true
```

Suggested storage model:

- commit `infra/terraform/backend/dev.s3.tfbackend.example`
- ignore `infra/terraform/backend/*.s3.tfbackend`
- use `tofu init -backend-config=infra/terraform/backend/dev.s3.tfbackend`

#### Lane C: secrets and credentials

Suggested shell model:

```bash
export AWS_PROFILE=your-aws-profile
export TF_VAR_github_webhook_secret='replace-with-real-secret'
export TF_VAR_github_token='replace-with-real-token'
```

This keeps:

- AWS credentials in the AWS credential chain
- app secrets out of checked-in config files
- non-secret infra inputs in readable tfvars

### Optional hardening improvements

#### 1. Add AWS account guardrails in the provider

The AWS provider supports `allowed_account_ids` and `forbidden_account_ids`.

For this repo, an input such as `allowed_account_ids` would reduce wrong-account deployments without changing the current module structure.

#### 2. Prefer role-based auth for automation

For CI or shared automation, prefer:

- OIDC / web identity
- or a named profile that assumes a deployment role

over long-lived static access keys.

#### 3. Move application secrets out of Lambda environment variables

If the repo later provisions SSM Parameter Store or Secrets Manager and updates the app to read secrets at runtime, the OpenTofu state stops being the storage location for the raw GitHub secret values.

That is the only durable fix for the current state exposure.

## Recommended Refactor Scope

### What should change first

1. Stop generating one temporary tfvars file that mixes secrets and ordinary config.
2. Introduce a checked-in example tfvars file for non-secret infrastructure inputs.
3. Keep backend config in its own partial-config lane.
4. Document AWS profile / SSO / role-based auth as the supported credential path.
5. Pass only the remaining application secrets through `TF_VAR_...` or a deliberately ignored local secret file.

### What should not be bundled into the same cleanup unless explicitly approved

- changing DynamoDB locking to native S3 locking
- redesigning workspaces vs per-environment roots
- moving all application secrets to Secrets Manager or SSM
- reworking CI credentials and deployment roles

Those are valid follow-ups, but they are broader than the immediate tfvars-and-credentials hygiene cleanup.

## Implementation Guidance Based on Evidence

- Keep `backend "s3" {}` as a partial backend declaration in `infra/terraform/backend.tf`.
- Keep AWS credentials out of `.env`, `*.tfvars`, and `*.tfbackend` files.
- Use AWS profile, AWS SSO, assume-role, or OIDC for provider and backend authentication.
- Split non-secret root variables into readable tfvars files.
- Use `TF_VAR_...` only for the small set of true secret root inputs that still must be passed into managed resources.
- Add ignore rules or example-file conventions before introducing local tfvars or tfbackend files.
- Document that `sensitive = true` redacts output but does not remove values from state.
- Treat moving GitHub secrets to Secrets Manager or SSM as a follow-up architecture task, not as a variable-plumbing tweak.

## Source Links

- https://opentofu.org/docs/language/values/variables/
- https://opentofu.org/docs/cli/config/environment-variables/
- https://opentofu.org/docs/language/settings/backends/configuration/
- https://opentofu.org/docs/language/settings/backends/s3/
- https://opentofu.org/docs/language/providers/configuration/
- https://opentofu.org/docs/language/state/sensitive-data/
- https://opentofu.org/docs/cli/commands/apply/
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs#authentication-and-configuration
- https://developer.hashicorp.com/terraform/language/manage-sensitive-data