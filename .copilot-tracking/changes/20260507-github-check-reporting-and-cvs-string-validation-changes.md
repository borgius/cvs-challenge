<!-- markdownlint-disable-file -->

# GitHub Check Reporting and CVS String Validation Changes

## Status

- Started: 2026-05-07
- Prompt: `implement-github-check-reporting-and-cvs-string-validation.prompt.md`
- Branch: `pr-checks`

## Progress Log

### 2026-05-07

- Created this tracking file.
- Read the implementation prompt, plan, details, and research artifacts.
- Read the repository guidance in `AGENTS.md`, plus the current `README.md`, `.env.example`, and the webhook integration tests.
- Verified the current webhook flow already has the validated repository name, PR number, head SHA, title/body fields, and changed-file lookup needed to publish a GitHub check run.
- Fetched the linked GitHub documentation for the Checks API, check lifecycle guidance, commit statuses, and GitHub status-check behavior.
- Confirmed the implementation should use a real GitHub check run with create-then-update behavior, not a commit status fallback.
- Confirmed the runtime auth contract must be documented clearly because GitHub check publication requires a supported token type with `Checks` write; the current local workflow can verify the flow with mocked HTTP calls, but not prove live publication with the current workspace alone.
- Added `src/github/checks.ts` to create and complete the `pr-concierge` GitHub check run, derive conclusions from deterministic checks, and build GitHub-facing output text.
- Updated `src/app.ts` to create a check run for supported pull-request events, pass PR title and body into evaluation, and complete the same check run on success or failure.
- Extended `src/services/evaluatePullRequest.ts` with the non-blocking CVS phrase rule: pass on `CVS is Rock`, fail on `CVS is not Rock`, and skip when neither phrase appears.
- Extended the local Lambda integration suite to assert the GitHub check create/update flow and the CVS pass, fail, and skip cases through mocked GitHub API calls.
- Updated `.env.example`, `README.md`, and `AGENTS.md` so the runtime token contract and the new GitHub feedback behavior are explicit.
- Deleted the one-off implementation prompt after the task was complete.

## Changes made

- `src/github/checks.ts`
	- Added the dedicated GitHub Checks client and the conclusion/output mapping helpers.
- `src/app.ts`
	- Wired supported webhook events to create and complete a real GitHub check run.
- `src/services/evaluatePullRequest.ts`
	- Added PR title/body evaluation input and the CVS phrase rule.
- `src/types/evaluation.ts`
	- Added `nextStep` to the evaluation result so the GitHub output can reuse the same reporting model.
- `src/types/github.ts`
	- Expanded the local test payload helper type with PR `title` and `body`.
- `tests/integration/local/webhook.local.test.ts`
	- Added end-to-end mocked assertions for check-run creation, completion, and CVS phrase outcomes.
- `.env.example`
	- Clarified that `GITHUB_TOKEN` now needs a supported `Checks` write auth lane for live check publication.
- `README.md`
	- Documented the `pr-concierge` check run, the CVS phrase rule, and the live auth requirement.
- `AGENTS.md`
	- Updated repository guidance to reflect the check publication path, the auth requirement, and the expanded local test coverage.
- `.copilot-tracking/prompts/implement-github-check-reporting-and-cvs-string-validation.prompt.md`
	- Deleted after completion.

## Validation Notes

- `git branch --show-current` → `pr-checks`
- `npm run build` ✅
- `npm run test` ✅
- Live GitHub check publication was not exercised from this workspace because the local verification path uses mocked GitHub HTTP calls and does not prove the runtime token type or `Checks` permission set.
