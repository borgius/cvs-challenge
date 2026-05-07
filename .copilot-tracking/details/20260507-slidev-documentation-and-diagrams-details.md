<!-- markdownlint-disable-file -->

# Task Details: Slidev Documentation and Diagram Artifacts

## Research Reference

**Source Research**: #file:../research/20260507-slidev-documentation-and-diagrams-research.md

## Phase 1: Establish the Slidev artifact contract

### Task 1.1: Add the Slidev tooling and file layout

Define the repository's presentation workflow before writing the slides. Add the Slidev dependency and local scripts in a way that keeps the deck source inside `diagrams/` and keeps optional export work out of scope unless the implementation truly needs rendered PDF or PNG output.

- **Files**:
  - `package.json` - Add discoverable Slidev scripts such as local preview and static build commands that point at the chosen deck entry file
  - `package-lock.json` - Capture the dependency update when Slidev tooling is installed
  - `diagrams/` - Create the directory as the home for the committed deck artifact
- **Success**:
  - Contributors have a standard command to open the Slidev deck locally
  - Contributors have a standard command to build the deck statically
  - The implementation keeps the primary deck source in `diagrams/`
  - Export-only dependencies are not added unless the implementation explicitly chooses to ship rendered output
- **Research References**:
  - #file:../research/20260507-slidev-documentation-and-diagrams-research.md (Lines 13-24) - Verified repo gaps: missing `diagrams/`, Slidev scripts, and delivery artifacts
  - #file:../research/20260507-slidev-documentation-and-diagrams-research.md (Lines 107-127) - Official Slidev CLI workflow and lightweight preview/build script shape
  - #file:../research/20260507-slidev-documentation-and-diagrams-research.md (Lines 142-152) - Recommended deck path under `diagrams/`
  - #file:../research/20260507-slidev-documentation-and-diagrams-research.md (Lines 190-195) - Implementation guidance for package support and optional export scope
- **Dependencies**:
  - Verified research baseline

## Phase 2: Build the reviewer-facing Slidev deck

### Task 2.1: Create the Slidev deck narrative and slide structure

Create a Slidev deck that explains what PR Concierge does, how the AWS components fit together, and how a reviewer should think about the service during the technical interview. Keep the deck short, concrete, and aligned with the real implementation rather than the aspirational roadmap.

- **Files**:
  - `diagrams/pr-concierge-architecture.slidev.md` - Primary Slidev entry file for the challenge review deck
- **Success**:
  - The deck uses valid Slidev headmatter and slide separators
  - The deck includes a clear cover slide plus a short sequence that covers architecture, workflow, observability, and demo context
  - Presenter notes, if added, stay in standard Slidev HTML comments at the end of each slide
  - Slide content matches the current PR Concierge implementation and deployment flow described elsewhere in the repo
- **Research References**:
  - #file:../research/20260507-slidev-documentation-and-diagrams-research.md (Lines 28-32) - Current service and deployment facts the deck needs to represent accurately
  - #file:../research/20260507-slidev-documentation-and-diagrams-research.md (Lines 46-79) - Official Slidev deck structure, headmatter, separators, and notes model
  - #file:../research/20260507-slidev-documentation-and-diagrams-research.md (Lines 154-168) - Recommended reviewer-focused slide sequence
- **Dependencies**:
  - Task 1.1 completion

### Task 2.2: Embed the architecture diagram directly in the deck with Mermaid

Use a Mermaid flowchart inside the Slidev deck to show the end-to-end request path and operational wiring: GitHub webhook ingress, API Gateway, Lambda, DynamoDB, optional archive storage, logs, alarms, and SNS notifications. Keep the diagram readable at presentation size.

- **Files**:
  - `diagrams/pr-concierge-architecture.slidev.md` - Add the Mermaid diagram slide and any adjacent explanatory context
- **Success**:
  - The architecture diagram is authored as Mermaid source in the committed Slidev deck
  - The diagram shows the real MVP components without adding services the repo does not actually provision
  - The slide remains legible in presentation mode and does not cram too many labels into one frame
- **Research References**:
  - #file:../research/20260507-slidev-documentation-and-diagrams-research.md (Lines 83-103) - Verified Mermaid support and example syntax for Slidev
  - #file:../research/20260507-slidev-documentation-and-diagrams-research.md (Lines 146-152) - Why the deck itself can serve as the raw diagram artifact in `diagrams/`
  - #file:../research/20260507-slidev-documentation-and-diagrams-research.md (Lines 180-186) - Why Mermaid is the lowest-friction first implementation for this repo
- **Dependencies**:
  - Task 2.1 completion

## Phase 3: Add the written rationale and repo navigation

### Task 3.1: Create a short design rationale in `DECISIONS.md`

Write one concise design rationale section that explains a real architectural tradeoff already reflected in the implementation. The clearest candidate is the choice of API Gateway plus Lambda for the MVP instead of a larger ECS Fargate service footprint.

- **Files**:
  - `DECISIONS.md` - Short rationale document with one key decision and alternatives considered
- **Success**:
  - The rationale stays within roughly 1–2 paragraphs for the primary decision
  - The document names the alternatives considered and why they were not chosen for the MVP
  - The final text stays consistent with the architecture described in `README.md` and `docs/project-overview.md`
- **Research References**:
  - #file:../research/20260507-slidev-documentation-and-diagrams-research.md (Lines 28-32) - Existing architecture and tradeoff facts already present in repo docs
  - #file:../research/20260507-slidev-documentation-and-diagrams-research.md (Lines 132-140) - Recommended rationale topic and justification for a separate `DECISIONS.md`
  - #file:../research/20260507-slidev-documentation-and-diagrams-research.md (Lines 190-195) - Implementation guidance for the dedicated rationale file
- **Dependencies**:
  - Task 2.1 completion

### Task 3.2: Update `README.md` to link the new documentation artifacts

Add a small documentation-navigation section to the README so reviewers can find the design rationale and Slidev deck quickly. Keep the README focused on discovery and usage rather than duplicating the full slide or rationale content.

- **Files**:
  - `README.md` - Add links to `DECISIONS.md`, the Slidev deck in `diagrams/`, and the relevant local commands if Slidev scripts are introduced
- **Success**:
  - The README points to the rationale and diagram artifacts from a clear location
  - The README explains how to preview or build the Slidev deck if package scripts are added
  - The new section stays concise and does not overload the existing operational guidance
- **Research References**:
  - #file:../research/20260507-slidev-documentation-and-diagrams-research.md (Lines 15-16) - Current README gap: no design rationale section or artifact links
  - #file:../research/20260507-slidev-documentation-and-diagrams-research.md (Lines 170-178) - Recommended README navigation updates
  - #file:../research/20260507-slidev-documentation-and-diagrams-research.md (Lines 193-194) - Implementation guidance to document how to preview the new artifacts locally
- **Dependencies**:
  - Tasks 1.1, 2.1, and 3.1 completion

## Phase 4: Validate the presentation workflow and keep scope intentional

### Task 4.1: Verify the final workflow without silently expanding scope

After the deck, rationale, and README links exist, validate that the chosen Slidev commands work and that the implementation does not quietly commit to rendered export formats or extra dependencies that the requirement does not demand.

- **Files**:
  - `package.json` - Final scripts should reflect the actual supported workflow
  - `README.md` - Final usage notes should match the implemented commands
  - `diagrams/pr-concierge-architecture.slidev.md` - Final deck path should match the commands and README references
- **Success**:
  - The documented preview/build commands match the actual implementation
  - The final scope remains honest about whether export output is supported
  - The repository has one clear path for reviewers to open the deck and read the rationale
- **Research References**:
  - #file:../research/20260507-slidev-documentation-and-diagrams-research.md (Lines 109-117) - Preview/build/export behavior and the cost of export support
  - #file:../research/20260507-slidev-documentation-and-diagrams-research.md (Lines 172-178) - README navigation contract for the new artifacts
  - #file:../research/20260507-slidev-documentation-and-diagrams-research.md (Lines 190-195) - Implementation guidance to keep export optional unless explicitly needed
- **Dependencies**:
  - Tasks 2.2, 3.1, and 3.2 completion

## Dependencies

- Verified research in `.copilot-tracking/research/20260507-slidev-documentation-and-diagrams-research.md`
- npm-based dependency management, which this repository already uses for application tooling

## Success Criteria

- The repository gains a committed Slidev deck under `diagrams/`
- The repository gains an explicit short design rationale, preferably in `DECISIONS.md`
- The README links reviewers to the new deck and rationale artifacts
- The package manifest exposes a clear local workflow for opening or building the Slidev deck