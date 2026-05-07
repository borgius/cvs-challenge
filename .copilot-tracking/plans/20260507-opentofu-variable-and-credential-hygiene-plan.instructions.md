---
applyTo: '.copilot-tracking/changes/20260507-opentofu-variable-and-credential-hygiene-changes.md'
---

<!-- markdownlint-disable-file -->

# Task Checklist: OpenTofu Variable and Credential Hygiene

## Overview

Replace the current mixed `.env` plus generated mega-tfvars deployment flow with a cleaner OpenTofu input model that separates non-secret tfvars, backend partial config, AWS authentication, and the small set of application secrets that still must be passed to managed resources.

## Objectives

- Split the repository's current deployment inputs into clear lanes for non-secret root variables, backend coordinates, AWS credentials, and application secrets
- Refactor the operator scripts to stop generating one mixed tfvars blob for unrelated categories of values
- Document the supported AWS authentication path and the remaining state implications for Lambda environment secrets

## Research Summary

### Project Files

- `scripts/deploy.sh` - Current deployment path that generates a large temporary `*.tfvars.json`
- `scripts/destroy.sh` - Current teardown path that duplicates the same mixed input assembly
- `scripts/common.sh` - Current backend partial-config helper
- `infra/terraform/backend.tf` - Existing partial S3 backend declaration that should remain the backend entrypoint
- `infra/terraform/variables.tf` - Root input contract, including sensitive application inputs
- `infra/terraform/versions.tf` - Root AWS provider configuration and likely home for optional account guardrails
- `.env.example` - Current flat template that mixes app secrets, backend coordinates, and ordinary infra config
- `.gitignore` - Current ignore rules that do not yet cover local tfvars or tfbackend conventions

### External References

- #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md - Verified repo analysis plus official OpenTofu and AWS credential guidance
- https://opentofu.org/docs/language/values/variables/ - Root variable sources, precedence, and tfvars guidance
- https://opentofu.org/docs/language/settings/backends/configuration/ - Backend partial-config and sensitive-backend guidance
- https://opentofu.org/docs/language/settings/backends/s3/ - S3 backend auth, encryption, versioning, and lock-mode guidance
- https://opentofu.org/docs/language/providers/configuration/ - Provider guidance to keep credentials out of version-controlled config
- https://registry.terraform.io/providers/hashicorp/aws/latest/docs#authentication-and-configuration - AWS provider auth sources, precedence, and role-based options

### Standards References

- `AGENTS.md` - Repo conventions for truthful docs, environment-variable updates, and source-of-truth infrastructure files

## Implementation Checklist

### [ ] Phase 1: Split the current input surface into clear lanes

- [ ] Task 1.1: Classify every current deploy input by delivery mechanism

  - Details: `.copilot-tracking/details/20260507-opentofu-variable-and-credential-hygiene-details.md` (Lines 11-32)

- [ ] Task 1.2: Define local file conventions and ignore rules before changing the scripts

  - Details: `.copilot-tracking/details/20260507-opentofu-variable-and-credential-hygiene-details.md` (Lines 34-56)

### [ ] Phase 2: Replace the mega-tfvars workflow with cleaner script behavior

- [ ] Task 2.1: Refactor deploy and destroy to prefer tfvars for ordinary config and `TF_VAR_...` only for the remaining app secrets

  - Details: `.copilot-tracking/details/20260507-opentofu-variable-and-credential-hygiene-details.md` (Lines 60-82)

- [ ] Task 2.2: Document and optionally enforce the supported AWS authentication path

  - Details: `.copilot-tracking/details/20260507-opentofu-variable-and-credential-hygiene-details.md` (Lines 84-104)

### [ ] Phase 3: Make the remaining secret tradeoffs explicit

- [ ] Task 3.1: Document the state implications of application secrets and the future hardening path

  - Details: `.copilot-tracking/details/20260507-opentofu-variable-and-credential-hygiene-details.md` (Lines 108-126)

## Dependencies

- OpenTofu installed and available as `tofu`
- AWS authentication available through the AWS credential chain, not inline provider credentials
- Verified research in `.copilot-tracking/research/20260507-opentofu-variable-and-credential-hygiene-research.md`

## Success Criteria

- The repository no longer relies on one generated tfvars blob for unrelated categories of values
- Non-secret infrastructure configuration is represented through readable tfvars examples and local tfvars files
- Backend coordinates stay in a distinct partial-backend flow
- AWS credentials stay out of repo-local tfvars and backend files
- Repo docs explain both the cleaner operator model and the remaining state exposure for Lambda environment secrets