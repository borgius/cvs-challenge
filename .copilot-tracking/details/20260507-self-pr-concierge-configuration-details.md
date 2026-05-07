<!-- markdownlint-disable-file -->

# Task Details: Self PR Concierge Configuration

## Research Reference

**Source Research**: #file:../research/20260507-self-pr-concierge-configuration-research.md

## Phase 1: Define the self-dogfooding operator contract

### Task 1.1: Reuse the existing deployment artifact and webhook secret contract

Keep the self-configuration flow anchored on the repository contracts that already exist: the deployed `webhookUrl` in `.artifacts/<service>-deployment.json` and the runtime `GITHUB_WEBHOOK_SECRET` that the Lambda already validates. Do not add a second endpoint-discovery path or a second webhook-secret concept.

- **Files**:
  - `scripts/common.sh` - Add shared helpers for locating the deployment summary and normalizing the repository slug if the implementation needs them
  - `scripts/configure-self-webhook.sh` - Resolve the deployed webhook URL and use the same secret contract the runtime already expects
  - `README.md` - Explain that self-hook configuration reuses the existing deployment artifact and webhook secret
- **Success**:
  - The self-configuration flow reads the deployed endpoint from the existing deployment artifact instead of inventing a new source of truth
  - The repository webhook uses the same secret value that `src/config/env.ts` and `src/github/signature.ts` already require
  - The implementation keeps the subscribed events limited to `pull_request`, which matches the current receiver behavior
- **Research References**:
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 29-68) - Existing deployment artifact reuse and current runtime signature contract
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 171-208) - GitHub event and secret-validation rules that match the current app
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 214-223) - Recommended implementation shape for a dedicated self-webhook script
- **Dependencies**:
  - Verified research baseline

### Task 1.2: Keep GitHub repository-admin auth explicit and separate from runtime app auth

Document and enforce a separate operator-auth path for webhook management. The deployed Lambda runtime still needs `GITHUB_TOKEN` only for pull-file lookups; that token should not silently become the repo-admin token for webhook creation or updates.

- **Files**:
  - `README.md` - Document the GitHub-auth requirement for webhook management and the supported operator-auth options
  - `AGENTS.md` - Record the same separation so future repository work does not re-merge the two token lanes
  - `scripts/configure-self-webhook.sh` - Require GitHub CLI auth or `GH_TOKEN` with `Webhooks: write` instead of reusing the runtime token implicitly
- **Success**:
  - The implementation requires an operator-auth path with repository-admin access and `Webhooks` write permission
  - The docs clearly state that the Lambda runtime token is not the admin token for managing repository hooks
  - The self-hook flow remains explicit and opt-in rather than hidden in the default AWS deploy path
- **Research References**:
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 70-113) - Current deploy scope, runtime token lane, and no-hook current state
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 149-169) - GitHub webhook token permissions and update-secret caveat
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 234-241) - Recommended separate auth lane for repository-hook management
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 274-301) - What should and should not be bundled into the first implementation pass
- **Dependencies**:
  - Task 1.1 completion

## Phase 2: Add idempotent repository-webhook automation

### Task 2.1: Add a Bash script that creates or updates the managed self webhook

Implement an operator-facing script that uses the repository-webhook APIs to create the hook on a clean repo and update it on later runs. The script should always configure `content_type=json`, `insecure_ssl=0`, `active=true`, and `events=["pull_request"]`, and it must include the secret on both create and update.

- **Files**:
  - `scripts/configure-self-webhook.sh` - New Bash entrypoint for self-PR-Concierge webhook management
  - `scripts/common.sh` - Shared helpers for repository resolution, deployment-summary lookup, GitHub API invocation, and clear error handling
- **Success**:
  - The repository can be configured from zero hooks to one managed self-hook without manual API calls
  - Later runs update the existing managed hook instead of blindly creating duplicates
  - The update path preserves signature validation by always resending the secret
  - The webhook configuration is limited to the event contract the app actually supports today
- **Research References**:
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 117-169) - Repository-webhook create/update APIs, permissions, and secret-preservation rule
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 171-181) - Limit subscriptions to the `pull_request` event the app already handles
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 214-257) - Recommended script shape and idempotency model for this repo
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 294-299) - Evidence-based configuration guard rails
- **Dependencies**:
  - Phase 1 completion

### Task 2.2: Persist managed-hook metadata and expose a repeatable verification path

Make the script useful after the first run, not just during it. Persist the managed hook ID and related metadata under `.artifacts/`, prefer that ID on later updates, and surface a verification path through GitHub ping and delivery inspection so operators can tell whether the hook is only configured or actually working.

- **Files**:
  - `scripts/configure-self-webhook.sh` - Save the managed hook metadata, trigger or surface a ping, and print delivery-inspection guidance
  - `README.md` - Explain the generated metadata artifact and the ping/delivery verification workflow
  - `.artifacts/<service>-github-webhook.json` - Local generated metadata file containing the managed hook ID, repository, URL, and relevant API links
- **Success**:
  - The script saves enough local metadata to target the same hook on later runs
  - The update flow prefers the saved hook ID before falling back to URL matching
  - The script fails clearly on ambiguous multiple matches instead of guessing
  - Operators have a documented path to inspect ping and recent deliveries after configuration
- **Research References**:
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 183-193) - Automatic ping behavior and delivery inspection support
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 243-266) - Recommended idempotency and verification model for this repo
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 278-282) - First-pass scope includes metadata persistence and verification guidance
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 299-300) - Evidence-based guidance to save hook IDs and surface delivery inspection
- **Dependencies**:
  - Task 2.1 completion

## Phase 3: Document and prove the self-use workflow

### Task 3.1: Document the operator flow from deploy to live self-hook verification

Update the repo docs so contributors know the intended self-dogfooding sequence: deploy the stack, configure the self webhook, verify the ping or recent deliveries, and optionally run the existing deployed live webhook test against a real PR in this repository.

- **Files**:
  - `README.md` - Add the end-to-end self-PR-Concierge workflow and verification guidance
  - `AGENTS.md` - Keep the repository guidance aligned with the new operator step and verification path
- **Success**:
  - The docs explain that the repository starts with zero hooks and needs an explicit self-hook configuration step after deploy
  - The docs show how to verify the configuration with ping, recent deliveries, and the existing opt-in deployed webhook success test
  - The docs keep the current “deploy path is explicit, not magical” contract intact
- **Research References**:
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 35-41) - Existing deployment artifact is the right endpoint source
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 55-68) - Existing deployed live webhook test can be reused for verification
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 76-83) - Deploy flow must stay distinct from GitHub repository mutation
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 260-301) - Verification flow, first-pass scope, and implementation guidance
- **Dependencies**:
  - Phase 2 completion

### Task 3.2: Keep required-label follow-up conditional and honest

If the operator later turns on `required_labels`, the docs should explain that the corresponding labels must exist in the repository. Until then, label setup should stay optional and out of the default self-hook flow.

- **Files**:
  - `README.md` - Clarify the relationship between `required_labels`, repository labels, and self-dogfooding behavior
  - `infra/terraform/README.md` - Reinforce that `required_labels` is opt-in runtime behavior, not a mandatory part of basic self-hook setup
  - `AGENTS.md` - Note the same conditional rule so future tasks do not force label work into the default path
- **Success**:
  - The repository does not pretend that label bootstrap is mandatory while `required_labels` is still empty by default
  - Contributors understand that enabling required labels later implies a matching GitHub-label setup task
  - The self-hook MVP stays focused on receiving pull-request events correctly
- **Research References**:
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 99-113) - Current repo has zero hooks and empty `required_labels` by default
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 268-272) - Label work should stay conditional for this repo
  - #file:../research/20260507-self-pr-concierge-configuration-research.md (Lines 286-301) - Scope guard rails and evidence-based guidance to keep label setup optional
- **Dependencies**:
  - Task 3.1 completion

## Dependencies

- A deployed stack and `.artifacts/<service>-deployment.json` generated by `scripts/deploy.sh`
- GitHub repository-admin access through GitHub CLI auth or `GH_TOKEN` with `Webhooks: write`
- Existing `GITHUB_WEBHOOK_SECRET` value available to both the deployed Lambda and the repository webhook configuration flow

## Success Criteria

- The repository has an explicit, idempotent operator path to create or update a `pull_request` webhook that targets the deployed PR Concierge endpoint
- GitHub repository-admin auth stays separate from the Lambda runtime token used for changed-file lookups
- Operators can verify the hook with ping and delivery inspection, then optionally reuse the existing deployed live webhook test for a full PR check
- Documentation explains the self-hook workflow clearly and keeps required-label setup conditional instead of mandatory