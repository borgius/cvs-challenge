---
applyTo: '.copilot-tracking/changes/20260507-opentofu-infrastructure-migration-changes.md'
---

<!-- markdownlint-disable-file -->

# Task Checklist: OpenTofu Infrastructure Migration

## Overview

Replace the manual AWS CLI deployment path with an OpenTofu-based infrastructure workflow, using repo-local wrapper modules and vetted upstream AWS modules for the PR Concierge footprint.

## Objectives

- Create a real OpenTofu root and local wrapper modules for service, API, data, and observability resources
- Convert `scripts/deploy.sh` and `scripts/destroy.sh` to drive infrastructure through `tofu` while preserving current operator ergonomics and safety expectations
- Update repository docs and workflow messaging so OpenTofu is described as the active deployment path

## Research Summary

### Project Files

- `scripts/deploy.sh` - Current AWS CLI-based deployment behavior that must be replaced
- `scripts/destroy.sh` - Current AWS CLI-based teardown behavior, including `DELETE_DATA=true`
- `scripts/package-lambda.sh` - Existing deterministic Lambda packaging flow that can be preserved behind OpenTofu automation
- `infra/terraform/main.tf` - Current starter-only Terraform root
- `infra/terraform/variables.tf` - Current minimal input surface that must be expanded
- `README.md` - Current documentation still describing Terraform as validation-only scaffolding
- `.github/workflows/deploy.yml` - Current workflow messaging still describing Bash plus AWS CLI as the active path

### External References

- #file:../research/20260507-opentofu-infrastructure-migration-research.md - Verified repo analysis, module selection, OpenTofu CLI guidance, and migration recommendations
- https://opentofu.org/docs/language/modules/develop/structure/ - Standard module structure guidance for repo-local wrappers
- https://opentofu.org/docs/cli/commands/init/ - OpenTofu initialization guidance for automation
- https://opentofu.org/docs/cli/commands/apply/ - OpenTofu apply guidance for non-interactive scripting
- https://opentofu.org/docs/cli/commands/destroy/ - OpenTofu destroy guidance for teardown scripting

### Standards References

- `AGENTS.md` - Repository conventions for environment variables, deployment honesty, and source-of-truth code locations

## Implementation Checklist

### [ ] Phase 1: Establish the OpenTofu root contract

- [ ] Task 1.1: Expand the root module into a real OpenTofu entrypoint

  - Details: `.copilot-tracking/details/20260507-opentofu-infrastructure-migration-details.md` (Lines 11-29)

- [ ] Task 1.2: Create repo-local wrapper modules that hide upstream complexity

  - Details: `.copilot-tracking/details/20260507-opentofu-infrastructure-migration-details.md` (Lines 31-60)

### [ ] Phase 2: Implement the AWS footprint with vetted upstream modules

- [ ] Task 2.1: Implement the Lambda service wrapper around the upstream Lambda module

  - Details: `.copilot-tracking/details/20260507-opentofu-infrastructure-migration-details.md` (Lines 64-82)

- [ ] Task 2.2: Implement the HTTP API wrapper and root-level Lambda permission

  - Details: `.copilot-tracking/details/20260507-opentofu-infrastructure-migration-details.md` (Lines 84-101)

- [ ] Task 2.3: Implement the data wrapper for DynamoDB and optional S3

  - Details: `.copilot-tracking/details/20260507-opentofu-infrastructure-migration-details.md` (Lines 103-119)

- [ ] Task 2.4: Implement observability with SNS and CloudWatch alarms

  - Details: `.copilot-tracking/details/20260507-opentofu-infrastructure-migration-details.md` (Lines 121-137)

### [ ] Phase 3: Replace AWS CLI orchestration with OpenTofu script automation

- [ ] Task 3.1: Convert `deploy.sh` into an OpenTofu apply workflow

  - Details: `.copilot-tracking/details/20260507-opentofu-infrastructure-migration-details.md` (Lines 141-158)

- [ ] Task 3.2: Convert `destroy.sh` to OpenTofu destroy semantics while preserving safety

  - Details: `.copilot-tracking/details/20260507-opentofu-infrastructure-migration-details.md` (Lines 160-175)

### [ ] Phase 4: Make the repository honest about the new deployment path

- [ ] Task 4.1: Update docs to describe OpenTofu as the active deployment path

  - Details: `.copilot-tracking/details/20260507-opentofu-infrastructure-migration-details.md` (Lines 179-195)

- [ ] Task 4.2: Update workflow and verification expectations for OpenTofu

  - Details: `.copilot-tracking/details/20260507-opentofu-infrastructure-migration-details.md` (Lines 197-214)

## Dependencies

- OpenTofu installed and available as `tofu`
- AWS credentials available to the AWS provider during `tofu apply` and `tofu destroy`
- Existing Node/npm build path available for Lambda artifact generation
- Verified research in `.copilot-tracking/research/20260507-opentofu-infrastructure-migration-research.md`

## Success Criteria

- `infra/terraform/` becomes the real source of truth for the PR Concierge AWS footprint
- Repo-local wrapper modules exist for service, API, data, and observability concerns
- `scripts/deploy.sh` and `scripts/destroy.sh` orchestrate infrastructure through OpenTofu instead of the AWS CLI
- Deployment outputs are still written in a machine-readable form for operators and follow-on scripts
- Documentation and workflow messaging no longer describe Terraform/OpenTofu as validation-only scaffolding