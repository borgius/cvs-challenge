<!-- markdownlint-disable-file -->

# Task Details: OpenTofu Variable and Credential Hygiene

## Research Reference

**Source Research**: #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md

## Phase 1: Split the current input surface into clear lanes

### Task 1.1: Classify every current deploy input by delivery mechanism

Create an explicit mapping for the values currently loaded from `.env` and written into the generated `*.tfvars.json` and `*.tfbackend` files. The implementation should separate them into four categories: non-secret root variables, backend coordinates, AWS credentials, and application secrets that still flow into managed resources.

- **Files**:
  - `scripts/deploy.sh` - Current root-variable assembly flow that mixes concerns
  - `scripts/destroy.sh` - Current teardown flow that duplicates the same mixed variable assembly
  - `scripts/common.sh` - Current backend partial-config helper
  - `infra/terraform/variables.tf` - Current root variable contract, including sensitive app inputs
  - `.env.example` - Current flat environment template that mixes categories together
- **Success**:
  - Every current deployment input is assigned to one of the target lanes
  - Non-secret infrastructure settings are identified as tfvars candidates
  - Backend settings are kept in the backend-config lane rather than the tfvars lane
  - AWS authentication inputs are excluded from repo-local tfvars and backend files
  - Remaining app secrets are called out as state-bearing values unless the runtime architecture changes
- **Research References**:
  - #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md (Lines 20-46) - Current `deploy.sh`/`common.sh` split and why the tfvars file is the ugly part
  - #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md (Lines 48-92) - Provider expectations, `.env` sprawl, missing ignore rules, and current sensitive-variable behavior
  - #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md (Lines 231-325) - Repository-specific four-category interpretation of values
- **Dependencies**:
  - Verified research baseline

### Task 1.2: Define local file conventions and ignore rules before changing the scripts

Introduce clear example-file conventions for non-secret tfvars and backend partial config, and add ignore rules for any real local files the implementation expects contributors to create. Keep the examples checked in, keep the real local files untracked, and avoid reusing `.env` as the dumping ground for everything.

- **Files**:
  - `.gitignore` - Add ignore patterns for real local tfvars and tfbackend files if the new flow introduces them
  - `.env.example` - Narrow or clarify which values still belong in `.env`
  - `infra/terraform/env/dev.auto.tfvars.example` - Example non-secret root input file
  - `infra/terraform/backend/dev.s3.tfbackend.example` - Example backend partial-config file
  - `README.md` - Explain the local file split and what should never be committed
  - `infra/terraform/README.md` - Explain the root's expected input lanes
- **Success**:
  - The repo offers example files for non-secret tfvars and backend coordinates
  - Real local `*.auto.tfvars` and `*.s3.tfbackend` files are protected from accidental commit
  - The docs tell contributors where to put ordinary config versus credentials versus app secrets
  - `.env.example` no longer implies that tfvars-worthy infrastructure settings must stay in `.env`
- **Research References**:
  - #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md (Lines 72-86) - Current ignore-rule gap
  - #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md (Lines 139-165) - Partial backend configuration guidance and S3 backend auth expectations
  - #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md (Lines 327-387) - Recommended three-lane operator model with example file layout
  - #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md (Lines 431-440) - Evidence-based implementation guidance for file conventions and state tradeoffs
- **Dependencies**:
  - Task 1.1 completion

## Phase 2: Replace the mega-tfvars workflow with cleaner script behavior

### Task 2.1: Refactor deploy and destroy to prefer tfvars for ordinary config and `TF_VAR_...` only for the remaining app secrets

Update the operator scripts so non-secret root inputs come from readable tfvars files, backend coordinates stay in their own partial-config lane, and only the remaining true secret root inputs are exported or injected as `TF_VAR_...` values when necessary. Remove the current one-file-to-rule-them-all JSON generation pattern.

- **Files**:
  - `scripts/deploy.sh` - Stop generating a single large tfvars file for every root input
  - `scripts/destroy.sh` - Mirror the same input model as deploy
  - `scripts/common.sh` - Add shared helpers for locating tfvars files, backend files, and secret exports if useful
  - `README.md` - Document the new execution model
  - `infra/terraform/README.md` - Document the expected local inputs for init/apply/destroy
- **Success**:
  - `deploy.sh` and `destroy.sh` no longer synthesize one mixed tfvars blob containing both ordinary config and app secrets
  - Non-secret complex values are supplied through tfvars rather than shell-encoded JSON or env strings
  - Backend coordinates continue to flow through partial backend config, not root tfvars
  - The only remaining env-driven root inputs are the app secrets that still must enter managed resources
  - The operator workflow is simpler to inspect and easier to reason about locally
- **Research References**:
  - #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md (Lines 96-125) - Variable sources, precedence, and why tfvars are better for readable complex values
  - #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md (Lines 127-165) - Backend-config guidance and why backend credentials must stay out of that path
  - #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md (Lines 303-387) - Target operator model for tfvars, backend partial config, and shell-exported secrets
  - #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md (Lines 416-440) - Scoped refactor priorities and guardrails
- **Dependencies**:
  - Phase 1 completion

### Task 2.2: Document and optionally enforce the supported AWS authentication path

Keep AWS authentication on the AWS credential chain and make that explicit in both code and docs. If the repo wants an extra safety net, add provider-level account guardrails such as `allowed_account_ids` without reintroducing provider credentials into configuration files.

- **Files**:
  - `infra/terraform/versions.tf` - Keep provider auth external to config; optionally add account guardrails via root input
  - `infra/terraform/variables.tf` - Add an optional guardrail input such as `allowed_account_ids` if the implementation chooses to enforce account boundaries
  - `.env.example` - Remove any implication that AWS credentials belong here
  - `README.md` - Document AWS profile, AWS SSO, assume-role, and OIDC as supported auth paths
  - `infra/terraform/README.md` - Reinforce the same auth expectations for backend and provider access
- **Success**:
  - The repo documents AWS profile / SSO / role-based auth as the supported way to authenticate OpenTofu
  - Provider credentials stay out of `.env`, tfvars, and backend files
  - Optional account guardrails are available without changing the core module structure
  - The backend and provider can both authenticate through the same AWS-standard mechanism
- **Research References**:
  - #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md (Lines 149-205) - Backend and provider credential best practices plus AWS auth precedence
  - #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md (Lines 391-404) - Optional hardening via guardrails and role-based automation
  - #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md (Lines 431-440) - Final implementation guidance on keeping credentials out of config files
- **Dependencies**:
  - Task 2.1 completion

## Phase 3: Make the remaining secret tradeoffs explicit

### Task 3.1: Document the state implications of application secrets and the future hardening path

Update the repo docs so contributors understand that `sensitive = true` only redacts output, not state, and that the current GitHub secret values remain in state because they are used in persisted Lambda environment variables. Point to Secrets Manager or SSM as the follow-up architecture path rather than pretending tfvars cleanup removes the underlying exposure.

- **Files**:
  - `README.md` - Add a clear note on app-secret state exposure and what the new variable flow does and does not solve
  - `infra/terraform/README.md` - Add the same note near the root input contract and backend guidance
  - `AGENTS.md` - Update repo guidance if deploy/operator expectations change materially
- **Success**:
  - The docs explicitly distinguish `sensitive` from `ephemeral`
  - The docs explain why app secrets still land in state today
  - The follow-up path to Secrets Manager or SSM is documented as a future architecture improvement
  - Contributors are less likely to assume that moving values out of `.env` automatically removes them from state
- **Research References**:
  - #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md (Lines 207-229) - Sensitive versus ephemeral behavior and state sensitivity
  - #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md (Lines 303-325) - Why current app secrets still belong to the state-bearing category
  - #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md (Lines 406-440) - Long-term hardening path and implementation guardrails
- **Dependencies**:
  - Phase 2 completion

## Dependencies

- OpenTofu remains the active IaC tool for the repository
- AWS authentication continues to come from the AWS credential chain rather than inline provider credentials
- Contributors have a documented local path for non-secret tfvars, backend partial config, and app secrets

## Success Criteria

- The repository stops using one generated tfvars blob for unrelated categories of values
- Non-secret infrastructure config moves into readable tfvars examples and local tfvars files
- Backend coordinates stay in their own partial-config path
- AWS credentials stay outside repo-local config files
- The docs clearly explain the remaining state exposure of Lambda environment secrets and the future hardening path