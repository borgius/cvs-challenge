---
applyTo: '.copilot-tracking/changes/20260507-opentofu-terraform-testing-changes.md'
---

<!-- markdownlint-disable-file -->

# Task Checklist: OpenTofu / Terraform Test Coverage

## Overview

Add built-in OpenTofu/Terraform test coverage for both infrastructure roots, then wire the new `tofu test` path into repository automation and docs.

## Objectives

- Add fast, deterministic infrastructure tests under the default `tests/` directories for both OpenTofu roots
- Protect current naming, toggle, validation, and output contracts with plan-mode assertions and `expect_failures`
- Expose a supported `tofu test` workflow in CI and documentation without destabilizing the existing app-only `npm test` path

## Research Summary

### Project Files

- `infra/terraform/main.tf` - Main application-stack root whose naming, outputs, and glue behavior need regression coverage
- `infra/bootstrap/tofu-backend/main.tf` - Separate backend bootstrap root with validation and security-toggle behavior suited to early tests
- `.github/workflows/deploy.yml` - Existing OpenTofu validation workflow that already installs the CLI needed to run `tofu test`
- `package.json` - Current command surface, which does not yet expose infrastructure test commands

### External References

- #file:../research/20260507-opentofu-terraform-testing-research.md - Verified repo analysis, official Terraform/OpenTofu test behavior, and implementation guidance
- https://developer.hashicorp.com/terraform/language/tests - Terraform test-file structure, run blocks, and `expect_failures` behavior
- https://developer.hashicorp.com/terraform/cli/commands/test - Terraform test command options and default `tests/` directory guidance
- https://opentofu.org/docs/cli/commands/test/ - OpenTofu test command, file-extension precedence, and mock/override features

### Standards References

- `AGENTS.md` - Repository conventions for OpenTofu usage, verification commands, and documentation honesty

## Implementation Checklist

### [ ] Phase 1: Establish the infrastructure test contract

- [ ] Task 1.1: Add the supported test runner, layout, and version contract
  - Details: `.copilot-tracking/details/20260507-opentofu-terraform-testing-details.md` (Lines 11-28)

### [ ] Phase 2: Add fast plan-mode coverage for the application stack

- [ ] Task 2.1: Create root-level tests for naming, toggles, and validation
  - Details: `.copilot-tracking/details/20260507-opentofu-terraform-testing-details.md` (Lines 32-49)

### [ ] Phase 3: Add fast plan-mode coverage for the backend bootstrap root

- [ ] Task 3.1: Create bootstrap-root tests for validation and security toggles
  - Details: `.copilot-tracking/details/20260507-opentofu-terraform-testing-details.md` (Lines 53-70)

### [ ] Phase 4: Wire the tests into automation and repository guidance

- [ ] Task 4.1: Integrate infrastructure tests into automation without breaking app-only flows
  - Details: `.copilot-tracking/details/20260507-opentofu-terraform-testing-details.md` (Lines 74-91)

- [ ] Task 4.2: Update repo docs to describe the new IaC test path honestly
  - Details: `.copilot-tracking/details/20260507-opentofu-terraform-testing-details.md` (Lines 93-111)

## Dependencies

- OpenTofu installed and available as `tofu` where the tests will run
- Existing deploy-readiness workflow, which already provisions OpenTofu in CI
- Verified research in `.copilot-tracking/research/20260507-opentofu-terraform-testing-research.md`

## Success Criteria

- `infra/terraform/` and `infra/bootstrap/tofu-backend/` both gain built-in tests under default `tests/` directories
- The first implementation wave stays fast and deterministic by favoring plan-mode coverage and existing validation rules
- CI runs the new infrastructure test path with `tofu test`
- Repository docs explain how to run the new tests and any version or OpenTofu-only caveats that apply