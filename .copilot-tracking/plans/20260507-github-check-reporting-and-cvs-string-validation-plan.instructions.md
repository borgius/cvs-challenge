---
applyTo: '.copilot-tracking/changes/20260507-github-check-reporting-and-cvs-string-validation-changes.md'
---

<!-- markdownlint-disable-file -->

# Task Checklist: GitHub Check Reporting and CVS String Validation

## Overview

Add a Lambda-published GitHub PR check with CI-like status and summary output, and extend deterministic evaluation with the playful `CVS is Rock` / `CVS is not Rock` content rule.

## Objectives

- Publish a real GitHub check run from the webhook Lambda for supported pull-request events using the repository's existing GitHub API integration style
- Add a deterministic PR-content rule that passes on `CVS is Rock`, fails on `CVS is not Rock`, and otherwise stays non-blocking
- Verify the full Lambda-to-GitHub flow locally and document the real credential requirements for publishing checks

## Research Summary

### Project Files

- `src/app.ts` - Current webhook orchestration and the natural place to coordinate check-run creation and completion
- `src/services/evaluatePullRequest.ts` - Existing deterministic checks and summary generation that should gain the CVS phrase rule
- `src/github/client.ts` - Existing fetch-based GitHub API client pattern to mirror in a new checks client
- `src/github/payload.ts` - Official pull-request schema validation that already exposes title/body fields needed for the new rule
- `tests/integration/local/webhook.local.test.ts` - Existing local Lambda integration harness that can verify outbound check-run calls
- `.env.example` - Current runtime credential template that must stay honest about any new permission requirement

### External References

- #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md - Verified repository analysis, GitHub Checks API constraints, auth caveats, and the evidence-backed implementation strategy
- https://docs.github.com/en/rest/checks/runs#create-a-check-run - Check-run create endpoint and output fields
- https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-checks - GitHub's documented checks workflow and state model
- https://docs.github.com/en/rest/commits/statuses#create-a-commit-status - Commit-status limitations that make it a poor substitute for rich check output
- https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks - GitHub UI behavior for checks versus commit statuses

### Standards References

- `AGENTS.md` - Repository guidance for webhook architecture boundaries, deterministic evaluation rules, test expectations, and synchronized doc updates

## Implementation Checklist

### [ ] Phase 1: Establish the GitHub check publication path

- [ ] Task 1.1: Add a dedicated GitHub Checks client and make the auth contract explicit

  - Details: `.copilot-tracking/details/20260507-github-check-reporting-and-cvs-string-validation-details.md` (Lines 11-30)

- [ ] Task 1.2: Wire the Lambda webhook flow to create and complete a GitHub check run

  - Details: `.copilot-tracking/details/20260507-github-check-reporting-and-cvs-string-validation-details.md` (Lines 32-50)

### [ ] Phase 2: Expand deterministic PR evaluation

- [ ] Task 2.1: Add the CVS phrase rule to the deterministic evaluation service

  - Details: `.copilot-tracking/details/20260507-github-check-reporting-and-cvs-string-validation-details.md` (Lines 54-71)

- [ ] Task 2.2: Map evaluation results to a GitHub check conclusion and output payload

  - Details: `.copilot-tracking/details/20260507-github-check-reporting-and-cvs-string-validation-details.md` (Lines 73-91)

### [ ] Phase 3: Verify the end-to-end Lambda-to-GitHub flow and update contributor guidance

- [ ] Task 3.1: Extend the local Lambda integration suite to assert GitHub check publication

  - Details: `.copilot-tracking/details/20260507-github-check-reporting-and-cvs-string-validation-details.md` (Lines 95-113)

- [ ] Task 3.2: Update docs and verification guidance for the new check behavior

  - Details: `.copilot-tracking/details/20260507-github-check-reporting-and-cvs-string-validation-details.md` (Lines 115-134)

## Dependencies

- Verified research in `.copilot-tracking/research/20260507-github-check-reporting-and-cvs-string-validation-research.md`
- A supported GitHub credential that can publish check runs, or an explicitly adopted GitHub App auth path
- The existing local Lambda integration harness under `tests/integration/local/`

## Success Criteria

- Supported pull-request webhook events publish a GitHub-visible check run with deterministic conclusion and summary output
- The PR evaluation flow includes the `CVS is Rock` / `CVS is not Rock` rule without forcing all PRs to contain the phrase
- Local integration tests verify changed-file lookup plus check-run create/update behavior
- Documentation explains the actual auth and permission requirements needed to make GitHub check publication work