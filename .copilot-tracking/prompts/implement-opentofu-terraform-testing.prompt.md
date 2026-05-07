---
description: 'Implement the OpenTofu and Terraform-compatible infrastructure test coverage plan for PR Concierge using the validated research, details, and checklist documents.'
mode: agent
model: GPT-5.4
---

<!-- markdownlint-disable-file -->

# Implementation Prompt: OpenTofu / Terraform Test Coverage

## Implementation Instructions

### Step 1: Create Changes Tracking File

You WILL create `20260507-opentofu-terraform-testing-changes.md` in #file:../changes/ if it does not exist.

### Step 2: Execute Implementation

You WILL systematically implement #file:../plans/20260507-opentofu-terraform-testing-plan.instructions.md task-by-task.
You WILL use #file:../details/20260507-opentofu-terraform-testing-details.md for task-level specifications and target files.
You WILL use #file:../research/20260507-opentofu-terraform-testing-research.md as the evidence baseline for test structure, runner choice, and CI guidance.
You WILL follow #file:../../AGENTS.md and keep the repository documentation honest about the new infrastructure test path.

**CRITICAL**: If ${input:phaseStop:true} is true, you WILL stop after each Phase for user review.
**CRITICAL**: If ${input:taskStop:false} is true, you WILL stop after each Task for user review.
**CRITICAL**: You WILL keep the first wave fast and deterministic by preferring `command = plan`, existing validation coverage, and the default `tests/` directories under each OpenTofu root.
**CRITICAL**: You WILL use `tofu test` as the supported runner in automation and docs unless the user explicitly asks for a different contract.
**CRITICAL**: You WILL avoid silently broadening the default app-only `npm test` workflow to require OpenTofu unless the implementation intentionally and explicitly changes that repository contract.
**CRITICAL**: If the final test implementation relies on mock-based or OpenTofu-only test features, you WILL update the version contract and documentation in the same change.

### Step 3: Cleanup

When ALL Phases are checked off (`[x]`) and completed you WILL do the following:

1. You WILL provide a markdown-style link and a brief summary of all changes from #file:../changes/20260507-opentofu-terraform-testing-changes.md to the user.
2. You WILL provide markdown-style links to #file:../plans/20260507-opentofu-terraform-testing-plan.instructions.md, #file:../details/20260507-opentofu-terraform-testing-details.md, and #file:../research/20260507-opentofu-terraform-testing-research.md, and recommend cleaning them up as well.
3. You WILL attempt to delete #file:../prompts/implement-opentofu-terraform-testing.prompt.md.

## Success Criteria

- [ ] Changes tracking file created
- [ ] Both OpenTofu roots gain built-in infrastructure tests under default `tests/` directories
- [ ] CI and local guidance expose a supported `tofu test` workflow
- [ ] The default app-oriented `npm test` contract stays intentional and documented
- [ ] Documentation explains any version-floor or OpenTofu-only caveats introduced by the new tests