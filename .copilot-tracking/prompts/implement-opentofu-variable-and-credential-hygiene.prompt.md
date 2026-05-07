---
description: 'Implement the OpenTofu variable and credential hygiene refactor for PR Concierge using the validated plan and details documents.'
mode: agent
model: GPT-5.4
---

<!-- markdownlint-disable-file -->

# Implementation Prompt: OpenTofu Variable and Credential Hygiene

## Implementation Instructions

### Step 1: Create Changes Tracking File

You WILL create `20260507-opentofu-variable-and-credential-hygiene-changes.md` in #file:../changes/ if it does not exist.

### Step 2: Execute Implementation

You WILL systematically implement #file:../plans/20260507-opentofu-variable-and-credential-hygiene-plan.instructions.md task-by-task.
You WILL use #file:../details/20260507-opentofu-variable-and-credential-hygiene-details.md for task-level specifications and file targets.
You WILL use #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md as the evidence baseline for variable, backend, and credential handling.
You WILL follow #file:../../AGENTS.md and keep the repository documentation honest about any changed operator workflow.

**CRITICAL**: If ${input:phaseStop:true} is true, you WILL stop after each Phase for user review.
**CRITICAL**: If ${input:taskStop:false} is true, you WILL stop after each Task for user review.
**CRITICAL**: You WILL avoid reintroducing AWS credentials into provider blocks, tfvars files, or backend config files.
**CRITICAL**: You WILL document any remaining state exposure for Lambda environment secrets rather than implying the refactor fully removes it.

### Step 3: Cleanup

When ALL Phases are checked off (`[x]`) and completed you WILL do the following:

1. You WILL provide a markdown style link and a brief summary of all changes from #file:../changes/20260507-opentofu-variable-and-credential-hygiene-changes.md to the user.
2. You WILL provide markdown style links to #file:../plans/20260507-opentofu-variable-and-credential-hygiene-plan.instructions.md, #file:../details/20260507-opentofu-variable-and-credential-hygiene-details.md, and #file:../research/20260507-opentofu-variable-and-credential-hygiene-research.md, and recommend cleaning them up as well.
3. You WILL attempt to delete #file:../prompts/implement-opentofu-variable-and-credential-hygiene.prompt.md.

## Success Criteria

- [ ] Changes tracking file created
- [ ] All plan items implemented with working code and docs
- [ ] Variable delivery is split across tfvars, backend partial config, AWS auth, and remaining app secrets as specified
- [ ] AWS credentials remain outside repo-local config files
- [ ] Documentation explains both the cleaner workflow and the remaining state implications