# AI workflow evidence

## Repo-level configuration

- `AGENTS.md` captures repository-specific instructions for implementation, testing, deployment, and documentation updates.
- `skills-lock.json` records the shared skill sources used in the repo's AI workflow.
- GitHub Copilot is used as a coding and review collaborator in this repository, while the production webhook path stays deterministic.

## What AI helped with

- Hono and Lambda wiring for the small HTTP surface in `src/`
- integration tests around webhook validation, GitHub API calls, and GitHub check publication
- OpenTofu structure, deployment workflow polish, and environment-variable documentation
- reviewer-facing architecture material such as the Slidev deck, check branding, and documentation cleanup

## Where I corrected the AI

- **Secret handling:** moved GitHub runtime secret writes out of OpenTofu-managed resources and state, and into `scripts/deploy.sh` with encrypted SSM updates.
- **Runtime scope:** kept the production evaluation path deterministic instead of adding an unnecessary runtime LLM dependency.
- **Test strategy:** separated safe deployed checks from the opt-in live webhook success path so CI stays honest.
- **Reviewer proof:** added a requirements map, static architecture artifact, and OpenTofu validation tests instead of relying on implied coverage.

## Evidence trail

- Repository instructions and workflow guardrails live in `AGENTS.md`.
- The active AI-assisted pull request is [PR #9](https://github.com/borgius/cvs-challenge/pull/9).
- Copilot review comments on that PR were used as feedback for follow-up cleanup and clarification.

## Current stance

AI speeds up implementation, review, and documentation in this repository. It does not make the runtime decision path probabilistic. PR Concierge still evaluates pull requests with deterministic rules that a reviewer can inspect, test, and explain during the interview.
