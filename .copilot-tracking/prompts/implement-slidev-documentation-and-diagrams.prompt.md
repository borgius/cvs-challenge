---
description: 'Implement the Slidev deck, Mermaid architecture diagram, design rationale, and README navigation updates described in the validated planning documents.'
mode: agent
model: GPT-5.4
---

<!-- markdownlint-disable-file -->

# Implementation Prompt: Slidev Documentation and Diagram Artifacts

## Implementation Instructions

### Step 1: Create Changes Tracking File

You WILL create `20260507-slidev-documentation-and-diagrams-changes.md` in #file:../changes/ if it does not exist.

### Step 2: Execute Implementation

You WILL systematically implement #file:../plans/20260507-slidev-documentation-and-diagrams-plan.instructions.md task-by-task.
You WILL use #file:../details/20260507-slidev-documentation-and-diagrams-details.md for task-level specifications and target files.
You WILL use #file:../research/20260507-slidev-documentation-and-diagrams-research.md as the evidence baseline for file layout, Slidev syntax, Mermaid support, and documentation scope.
You WILL follow #file:../../AGENTS.md so the final docs stay aligned with the real implementation and command surface.

**CRITICAL**: If ${input:phaseStop:true} is true, you WILL stop after each Phase for user review.
**CRITICAL**: If ${input:taskStop:false} is true, you WILL stop after each Task for user review.
**CRITICAL**: You WILL keep the primary Slidev deck in `diagrams/pr-concierge-architecture.slidev.md` unless a verified repository constraint forces a rename.
**CRITICAL**: You WILL embed the architecture diagram as Mermaid source in the committed Slidev deck so the raw diagram artifact lives in `diagrams/`.
**CRITICAL**: You WILL add a short design rationale in `DECISIONS.md` that explains one real architecture tradeoff and the alternatives considered.
**CRITICAL**: You WILL update `README.md` to link to the deck and rationale artifacts and describe the local Slidev usage path without duplicating all slide content.
**CRITICAL**: If you add Slidev tooling, you WILL update both `package.json` and `package-lock.json` and keep the supported local commands consistent with the README.
**CRITICAL**: You WILL keep rendered export formats optional unless the user explicitly asks for committed PDF, PNG, or PPTX output.

### Step 3: Cleanup

When ALL Phases are checked off (`[x]`) and completed you WILL do the following:

1. You WILL provide a markdown-style link and a brief summary of all changes from #file:../changes/20260507-slidev-documentation-and-diagrams-changes.md to the user.
2. You WILL provide markdown-style links to #file:../plans/20260507-slidev-documentation-and-diagrams-plan.instructions.md, #file:../details/20260507-slidev-documentation-and-diagrams-details.md, and #file:../research/20260507-slidev-documentation-and-diagrams-research.md, and recommend cleaning them up as well.
3. You WILL attempt to delete #file:../prompts/implement-slidev-documentation-and-diagrams.prompt.md.

## Success Criteria

- [ ] Changes tracking file created
- [ ] `diagrams/` contains the committed Slidev deck with a Mermaid architecture diagram
- [ ] `DECISIONS.md` contains the short design rationale and alternatives considered
- [ ] `README.md` links to the new documentation artifacts and explains how to preview or build the deck
- [ ] Any new Slidev command surface in `package.json` matches the documented workflow