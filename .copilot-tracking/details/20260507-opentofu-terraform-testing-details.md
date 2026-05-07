<!-- markdownlint-disable-file -->

# Task Details: OpenTofu / Terraform Test Coverage

## Research Reference

**Source Research**: #file:../research/20260507-opentofu-terraform-testing-research.md

## Phase 1: Establish the infrastructure test contract

### Task 1.1: Add the supported test runner, layout, and version contract

Define the repository's supported infrastructure test path before adding any test files. Use the default `tests/` directories under each OpenTofu root, keep `tofu test` as the documented runner, and make any required version-floor change in the same implementation if the tests depend on mock-based features.

- **Files**:
  - `package.json` - Add discoverable infrastructure test commands without changing the existing default app-only `npm test` flow
  - `infra/terraform/versions.tf` - Update the declared version floor if the implementation depends on post-1.6 testing features such as provider mocking
  - `infra/bootstrap/tofu-backend/versions.tf` - Keep the backend root aligned with the same test-support contract when applicable
- **Success**:
  - The repository has a clear, documented command surface for infrastructure tests
  - The default nested `tests/` layout is used for both OpenTofu roots
  - Any dependency on mock-based or OpenTofu-only test features is reflected in the version contract and documentation instead of being left implicit
- **Research References**:
  - #file:../research/20260507-opentofu-terraform-testing-research.md (Lines 41-45) - Current version contract and OpenTofu-first automation baseline
  - #file:../research/20260507-opentofu-terraform-testing-research.md (Lines 64-114) - Terraform/OpenTofu test discovery, command structure, and mock-feature guidance
  - #file:../research/20260507-opentofu-terraform-testing-research.md (Lines 145-199) - Recommended `tests/` layout, `tofu test` runner choice, and the need to keep the default app test command stable
- **Dependencies**:
  - Verified research baseline

## Phase 2: Add fast plan-mode coverage for the application stack

### Task 2.1: Create root-level tests for naming, toggles, and validation

Add a first wave of plan-mode tests under `infra/terraform/tests/` that verify the parts of the root module most likely to regress during refactors: naming and output contracts, the optional archive-bucket behavior, and custom validation on `evaluation_repository`.

- **Files**:
  - `infra/terraform/tests/root_contract_unit_test.tftest.hcl` - Assert stable naming/output behavior for the main stack root
  - `infra/terraform/tests/root_validation_unit_test.tftest.hcl` - Assert invalid `evaluation_repository` values fail through `expect_failures`
  - `infra/terraform/tests/terraform.tfvars` or `infra/terraform/tests/*.auto.tfvars` - Add only if the implementation needs shared non-secret test defaults for repeated runs
- **Success**:
  - The main root has fast offline coverage for input-driven outputs and optional-resource toggles
  - Validation failures on `evaluation_repository` are covered with `expect_failures`
  - The test suite stays in plan mode unless a specific assertion truly needs apply behavior
- **Research References**:
  - #file:../research/20260507-opentofu-terraform-testing-research.md (Lines 17-29) - Current root and wrapper behaviors worth protecting
  - #file:../research/20260507-opentofu-terraform-testing-research.md (Lines 116-130) - Main-root test targets for naming, archive toggles, validation, and glue behavior
  - #file:../research/20260507-opentofu-terraform-testing-research.md (Lines 156-170) - Why plan-mode tests fit the repo better than live apply tests in the current workflow
- **Dependencies**:
  - Task 1.1 completion

## Phase 3: Add fast plan-mode coverage for the backend bootstrap root

### Task 3.1: Create bootstrap-root tests for validation and security toggles

Add plan-mode tests under `infra/bootstrap/tofu-backend/tests/` for the bootstrap root's validation rules, output contract, and toggle-driven security behavior such as bucket versioning and DynamoDB protection settings.

- **Files**:
  - `infra/bootstrap/tofu-backend/tests/backend_contract_unit_test.tftest.hcl` - Assert output values and toggle-driven resource configuration
  - `infra/bootstrap/tofu-backend/tests/backend_validation_unit_test.tftest.hcl` - Assert empty bucket and table inputs fail through `expect_failures`
  - `infra/bootstrap/tofu-backend/tests/terraform.tfvars` or `infra/bootstrap/tofu-backend/tests/*.auto.tfvars` - Add only if repeated non-secret defaults materially simplify the tests
- **Success**:
  - The backend root has coverage for both existing validation blocks
  - Bucket and table naming outputs are asserted explicitly
  - Versioning, deletion protection, and PITR behavior are covered at the plan stage where possible
- **Research References**:
  - #file:../research/20260507-opentofu-terraform-testing-research.md (Lines 31-39) - Current backend-root behavior and existing validation rules
  - #file:../research/20260507-opentofu-terraform-testing-research.md (Lines 132-143) - Backend-root test targets for validation, security toggles, and outputs
  - #file:../research/20260507-opentofu-terraform-testing-research.md (Lines 156-170) - Recommendation to keep the first wave in fast plan mode
- **Dependencies**:
  - Task 1.1 completion

## Phase 4: Wire the tests into automation and repository guidance

### Task 4.1: Integrate infrastructure tests into automation without breaking app-only flows

Update automation so the repository actually runs the new infrastructure tests where OpenTofu is already available, while preserving the current expectation that `npm test` is the app-focused default verification command.

- **Files**:
  - `.github/workflows/deploy.yml` - Add `tofu test` execution for the main stack and backend root after init/validate steps, or at the closest sensible validation point
  - `package.json` - Expose the same commands locally if the implementation chooses npm wrappers for discoverability
- **Success**:
  - CI runs infrastructure tests for both OpenTofu roots
  - The default Node-only `npm test` path remains stable unless the repository explicitly chooses to broaden it
  - Local contributors have a documented, repeatable way to run the same OpenTofu tests outside CI
- **Research References**:
  - #file:../research/20260507-opentofu-terraform-testing-research.md (Lines 13-15) - No existing package scripts or workflow steps currently run infrastructure tests
  - #file:../research/20260507-opentofu-terraform-testing-research.md (Lines 60-62) - The deploy-readiness workflow already installs OpenTofu, so CI has the needed toolchain
  - #file:../research/20260507-opentofu-terraform-testing-research.md (Lines 172-199) - `tofu test` should be the supported runner and the default app test command should stay stable
  - #file:../research/20260507-opentofu-terraform-testing-research.md (Lines 201-209) - Implementation guidance to integrate tests into deploy-readiness rather than the Node-only app path
- **Dependencies**:
  - Tasks 2.1 and 3.1 completion

### Task 4.2: Update repo docs to describe the new IaC test path honestly

Once the tests exist and automation runs them, update repository guidance so contributors know where the tests live, which runner is supported, and whether any version or OpenTofu-only caveats apply.

- **Files**:
  - `README.md` - Add infrastructure test commands to the quick verification and deployment-readiness guidance
  - `infra/terraform/README.md` - Document the new root-level test files and local execution path
  - `infra/bootstrap/tofu-backend/README.md` - Document backend-root tests and when to run them
  - `AGENTS.md` - Keep the repository instructions aligned with the new validation workflow
- **Success**:
  - The README and infrastructure docs mention `tofu test` alongside the existing `fmt`, `init`, and `validate` steps
  - Contributors can tell which root owns which tests and whether the suite assumes OpenTofu-specific features
  - Documentation no longer implies that infrastructure validation stops at formatting and static validation
- **Research References**:
  - #file:../research/20260507-opentofu-terraform-testing-research.md (Lines 43-45) - Current local guidance mentions `fmt`, `init`, and `validate`, but not `tofu test`
  - #file:../research/20260507-opentofu-terraform-testing-research.md (Lines 172-199) - Supported runner, file-extension, and command-surface recommendations
  - #file:../research/20260507-opentofu-terraform-testing-research.md (Lines 201-209) - Docs that should be updated in the same change as the test implementation
- **Dependencies**:
  - Task 4.1 completion

## Dependencies

- OpenTofu available as `tofu` in local and CI environments that run the tests
- Verified research in `.copilot-tracking/research/20260507-opentofu-terraform-testing-research.md`

## Success Criteria

- Both OpenTofu roots gain built-in test files under default `tests/` directories
- The first-wave tests stay fast and deterministic by focusing on plan-mode coverage and existing validation rules
- CI and local guidance expose a supported `tofu test` path without destabilizing the existing app-only `npm test` workflow
- Repo documentation clearly explains how to run and interpret the new infrastructure tests