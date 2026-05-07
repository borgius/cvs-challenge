<!-- markdownlint-disable-file -->

# Research: OpenTofu / Terraform Test Coverage

## Task Summary

Add built-in Terraform/OpenTofu test coverage to this repository's infrastructure roots so the project validates important infrastructure behavior with `tofu test`, not just `fmt`, `init`, and `validate`.

## Tool Usage and Verified Findings

### Workspace discovery

- `file_search` confirmed the repository currently has **no** `*.tftest.hcl`, `*.tftest.json`, `*.tofutest.hcl`, or `*.tofutest.json` files.
- `read_file` on `.github/workflows/ci.yml` and `.github/workflows/deploy.yml` confirmed CI currently runs TypeScript build and app tests, plus OpenTofu `fmt`, `init`, and `validate`, but does not run any infrastructure test command.
- `read_file` on `package.json` confirmed there is no dedicated `npm` script for Terraform/OpenTofu tests.

### Current application-stack OpenTofu behavior

- `read_file` on `infra/terraform/main.tf`, `variables.tf`, and `outputs.tf` confirmed the main root composes four local wrapper modules: `data`, `service`, `http_api`, and `observability`.
- The root also owns shared naming logic and derived URLs such as `health_url` and `webhook_url`, plus the root-level `aws_lambda_permission.http_api` glue resource.
- The root exposes a `deployment_summary` output that combines service, API, data, and observability values for downstream tooling.

### Current module behaviors that are worth testing

- `infra/terraform/modules/data/main.tf` conditionally creates the archive bucket only when `enable_raw_event_archive` is true and `raw_event_bucket_name` is non-empty.
- `infra/terraform/modules/service/main.tf` always creates a DynamoDB policy statement and only adds the S3 archive permission when archiving is enabled and a bucket ARN exists.
- `infra/terraform/modules/service/variables.tf` and `infra/terraform/variables.tf` both validate that `evaluation_repository` is either `console` or `dynamodb`.
- `infra/terraform/modules/http_api/main.tf` hardcodes the two required routes: `GET /health` and `POST /webhooks/github`.
- `infra/terraform/modules/observability/main.tf` creates exactly two metric alarms in the MVP path: Lambda `Errors` and API Gateway `5xx`, both wired to the SNS topic output by the same wrapper.

### Current bootstrap-root behavior

- `read_file` on `infra/bootstrap/tofu-backend/main.tf`, `variables.tf`, and `outputs.tf` confirmed the backend bootstrap root is separate from the main stack and provisions:
  - one S3 bucket for state
  - S3 versioning
  - S3 AES256 server-side encryption
  - public access block plus TLS-only bucket policy
  - one DynamoDB lock table with string `LockID` hash key
- The bootstrap root already has variable validation for both `tofu_state_bucket` and `tofu_lock_table`, making it a good candidate for `expect_failures` coverage.

### Current version and automation contract

- `read_file` on `infra/terraform/versions.tf` and `infra/bootstrap/tofu-backend/versions.tf` confirmed both roots currently declare `required_version = ">= 1.6.0"` and use the AWS provider.
- `read_file` on `scripts/common.sh` and `scripts/deploy.sh` confirmed the repository-standard infrastructure CLI is OpenTofu (`tofu`), not Terraform, and helper functions already target `infra/terraform` and the backend bootstrap root explicitly.
- `read_file` on `README.md`, `infra/terraform/README.md`, and `infra/bootstrap/tofu-backend/README.md` confirmed local validation guidance currently covers `tofu fmt -check`, `tofu init -backend=false -input=false`, and `tofu validate`, but not `tofu test`.

## Current Repository Gaps

### No built-in IaC regression coverage

The repository can format and validate both OpenTofu roots, but it cannot yet assert behavioral expectations such as:

- variable validation failures
- conditional resource toggles
- derived naming and output contracts
- alarm and route wiring staying intact

That means a future refactor could preserve syntactic validity while still breaking important infrastructure behavior.

### CI has the right tool but does not use it fully

The deploy-readiness workflow already installs OpenTofu with `opentofu/setup-opentofu@v2`, so the repository already has the CI primitive needed to run `tofu test` without adding a new provisioning dependency.

## External Research: Terraform Test Framework

### Command and discovery behavior

From the HashiCorp docs at `https://developer.hashicorp.com/terraform/language/tests` and `https://developer.hashicorp.com/terraform/cli/commands/test`:

- Terraform tests are available in Terraform `1.6.0+`.
- `terraform test` discovers test files in the current directory and in the default `tests/` directory.
- HashiCorp recommends keeping the default `tests/` directory instead of inventing a custom layout.
- Test files use `.tftest.hcl` or `.tftest.json` extensions.

### Core test structure

- A test file can contain one optional `test` block, one or more `run` blocks, optional root-level `variables`, and optional `provider` blocks.
- Each `run` block can use `command = plan` or `command = apply`; the default is `apply`.
- `expect_failures` is the documented way to verify custom validation failures and is usually best paired with `command = plan`.
- Assertions can reference named values from the configuration under test, including outputs and values from earlier `run` blocks.

### CI-relevant command options

- `terraform test -filter=...` runs specific files.
- `terraform test -test-directory=...` changes the nested test directory, though HashiCorp recommends the default `tests/` directory.
- `terraform test -verbose` prints plan or state details per `run` block.
- `terraform test -json` produces machine-readable output.
- `terraform test -junit-xml=...` can emit a JUnit XML report for CI systems.

### Mocking note

- The Terraform tests page explicitly notes that Terraform `v1.7.0` introduced provider mocking for richer unit-test scenarios.
- If this repository chooses to depend on mock-based tests while still advertising Terraform compatibility, the declared version floor must not stay effectively pinned to pre-mock semantics.

## External Research: OpenTofu Test Framework

### Command and file support

From the OpenTofu docs at `https://opentofu.org/docs/cli/commands/test/`:

- `tofu test` runs `*.tftest.hcl`, `*.tftest.json`, `*.tofutest.hcl`, and `*.tofutest.json` files.
- OpenTofu looks in the current directory and the default `tests/` directory.
- When both `.tftest.*` and `.tofutest.*` exist with the same base name, OpenTofu prefers `.tofutest.*`.
- OpenTofu supports `-filter`, `-test-directory`, `-json`, and `-verbose`.

### OpenTofu-specific testing features

- OpenTofu documents `mock_provider`, `override_resource`, `override_data`, and `override_module` blocks for tests.
- Those features are useful when a module is thin wrapper code around larger upstream registry modules and you want fast, offline assertions instead of real provider interactions.
- OpenTofu also documents an offline AWS test pattern using fake credentials, skipped provider validations, and `plan_options { refresh = false }`.

### Practical implication for this repo

Because this repository already treats OpenTofu as the supported infrastructure runner, `tofu test` is the safest primary command for automation. It avoids promising Terraform-specific report features that OpenTofu docs did not confirm, while still allowing `.tftest.hcl` syntax when the tests stay inside the common subset.

## Evidence-Backed Test Targets For This Repository

### Main application stack root: `infra/terraform/`

The most valuable first-wave tests are the ones that stay fast, offline, and deterministic:

1. **Output and naming contract tests**
   - assert `service_name`, `lambda_function_name`, `lambda_role_name`, `evaluations_table_name`, and `alarm_topic_name` stay aligned with input/default naming rules
   - assert the optional raw-event bucket output is `null` when archiving is disabled and matches the configured bucket name when enabled
2. **Validation tests**
   - assert invalid `evaluation_repository` values fail as expected
3. **Root glue tests**
   - assert the root keeps wiring the Lambda permission and deployment summary fields consistently when child-module values are available to the test

These tests should focus on plan-mode behavior first, because the current goal is regression protection, not provisioning live AWS infrastructure during CI.

### Backend bootstrap root: `infra/bootstrap/tofu-backend/`

This root is an especially good fit for early coverage because much of its behavior is input-driven and known during planning:

1. **Validation tests**
   - empty `tofu_state_bucket` should fail
   - empty `tofu_lock_table` should fail
2. **Security and toggle tests**
   - versioning status should reflect the versioning toggle
   - deletion protection and PITR settings should match their input booleans
3. **Output contract tests**
   - bucket and table outputs should match the configured names

## Recommended Test Strategy

### Use default `tests/` directories under each OpenTofu root

Recommended directories:

- `infra/terraform/tests/`
- `infra/bootstrap/tofu-backend/tests/`

That follows both Terraform and OpenTofu guidance and keeps test discovery straightforward.

### Prefer fast plan-mode tests first

For this repository, the first implementation wave should prefer `command = plan` tests that validate naming, toggles, outputs, and custom variable validation rules.

Why this fits the repo:

- CI already treats the OpenTofu steps as validation, not live deployment
- the user request is to add test coverage, not to stand up a dedicated AWS test account workflow
- plan-mode tests are fast enough to run on every validation pass

### Treat apply-mode tests as a later, gated expansion

The official docs for both Terraform and OpenTofu warn that tests can create real infrastructure and require cleanup monitoring. That is a poor fit for the repository's current validation-only GitHub Actions workflow.

If the repo later wants end-to-end infrastructure tests, those should be a separate, explicitly gated suite with dedicated AWS credentials and cleanup controls.

### Choose `tofu test` as the supported runner

Use `tofu test` in local guidance, helper scripts, and GitHub Actions because:

- OpenTofu is already the repo-standard CLI
- CI already installs OpenTofu
- OpenTofu documents the mocking and override features most likely to help with thin wrapper-module tests

### Keep `.tftest.hcl` unless OpenTofu-only syntax becomes necessary

`.tftest.hcl` files are a good default because both Terraform and OpenTofu load them.

If the final implementation needs OpenTofu-only constructs such as `override_module`, the repository should either:

- keep those tests in `.tofutest.hcl`, or
- explicitly document that the supported runner is OpenTofu and that Terraform parity is not guaranteed for those cases.

### Keep the default app test command stable

The current `npm test` flow only type-checks TypeScript and runs local Lambda integration tests. Adding `tofu test` directly into `npm test` would introduce a new infrastructure tool dependency into the default app verification path.

The safer change is to add separate infrastructure test commands or workflow steps, such as:

- `npm run test:infra`
- `npm run test:infra:app`
- `npm run test:infra:backend`

or equivalent documented shell commands if the implementation prefers not to route OpenTofu through `npm`.

## Recommended Implementation Guidance

1. Add fast plan-mode tests under both OpenTofu roots before considering live apply tests.
2. Cover existing validation blocks with `expect_failures`; those are already present and provide immediate value.
3. Cover the main root's naming, optional archive toggle, and deployment-summary contract because those values feed operator scripts and docs.
4. Cover the backend root's bucket/table validation and security toggles because that root protects shared state infrastructure.
5. Integrate `tofu test` into the deploy-readiness workflow, where OpenTofu is already installed, instead of changing the default Node-only `npm test` path.
6. Update `README.md`, `infra/terraform/README.md`, `infra/bootstrap/tofu-backend/README.md`, and `AGENTS.md` so the repository documents the new test commands honestly.
7. If the final test implementation depends on post-1.6 mocking features, update the version contract and docs in the same change rather than relying on undocumented tool drift.