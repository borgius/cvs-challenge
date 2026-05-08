<!-- markdownlint-disable-file -->

# Task Details: GitHub Check Reporting and CVS String Validation

## Research Reference

**Source Research**: #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md

## Phase 1: Establish the GitHub check publication path

### Task 1.1: Add a dedicated GitHub Checks client and make the auth contract explicit

Introduce a focused GitHub Checks client under `src/github/` that mirrors the repository's existing fetch-based GitHub API style. The implementation should keep the route layer free of raw REST request construction and should update the environment and operator docs to describe the token or GitHub App permission contract needed for `Checks` write access.

- **Files**:
  - `src/github/checks.ts` - Add helpers for creating and updating check runs with the shared GitHub headers, repository parsing, and structured error messages
  - `.env.example` - Document any broadened GitHub credential expectation if `GITHUB_TOKEN` is reused for check publication
  - `README.md` - Explain the supported auth lane for publishing checks and the permission requirement for `Checks` write
  - `AGENTS.md` - Keep the repository guidance aligned with the new GitHub feedback behavior and auth requirement
- **Success**:
  - The repository has one dedicated module for outbound GitHub check-run operations
  - The auth contract for publishing checks is documented instead of being implied
  - The implementation path is explicit about whether the existing runtime token can publish checks or whether a GitHub App auth lane is required
- **Research References**:
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 86-112) - Existing fetch-based GitHub client pattern and the current environment/doc gap around check permissions
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 236-269) - Checks auth requirements and the richer output fields that justify a check-run client instead of commit statuses
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 296-309) - Recommended `src/github/checks.ts` ownership boundaries
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 357-382) - Required doc updates and the target file list for the auth contract
- **Dependencies**:
  - Verified research baseline

### Task 1.2: Wire the Lambda webhook flow to create and complete a GitHub check run

Update the webhook orchestration so a supported pull-request event can publish a CI-like check result for the PR's head SHA. The route should create a check run after payload validation and supported-action filtering, then update that same run to a completed conclusion after evaluation finishes. If evaluation fails after the run is created, the code should attempt to complete the run with a failure result and preserve structured error logging.

- **Files**:
  - `src/app.ts` - Thread the validated PR metadata into the GitHub check lifecycle and preserve the current webhook response behavior and logging style
  - `src/github/checks.ts` - Provide the create/update helpers consumed by the route orchestration
- **Success**:
  - Supported webhook events create a visible GitHub check run tied to `head_sha`
  - Successful evaluations complete the check run with a final conclusion and summary output
  - Downstream failures after check creation attempt to mark the same run as failed rather than leaving it hanging silently
  - The route keeps raw HTTP request building out of the handler body
- **Research References**:
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 29-51) - Current webhook orchestration and the validated metadata already available in `src/app.ts`
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 127-136) - Delivery-keyed persistence reduces replay risk but does not make check runs themselves idempotent
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 191-234) - GitHub's documented create-then-update check-run flow and output payload shape
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 311-331) - The recommended CI-style create/update orchestration and metadata choices
- **Dependencies**:
  - Task 1.1 completion

## Phase 2: Expand deterministic PR evaluation

### Task 2.1: Add the CVS phrase rule to the deterministic evaluation service

Extend the PR evaluation input so the service can inspect `pull_request.title` and `pull_request.body`, then add the playful content rule alongside the existing branch and label checks. The rule should remain deterministic and non-blocking by default: pass on `CVS is Rock`, fail on `CVS is not Rock`, and skip when neither phrase is present.

- **Files**:
  - `src/services/evaluatePullRequest.ts` - Extend `EvaluatePullRequestInput`, add the content-check helper, and include the result in the ordered checks array and summary
  - `src/app.ts` - Pass PR title and body into the evaluation input when calling `evaluatePullRequest(...)`
- **Success**:
  - The service can evaluate PR content using the validated webhook payload instead of raw JSON parsing in the route
  - `CVS is Rock` produces a passing evaluation check
  - `CVS is not Rock` produces a failing evaluation check
  - PRs that contain neither phrase do not fail just because the easter egg is absent
- **Research References**:
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 53-84) - Existing evaluation output structure and the payload fields already available for title/body-based rules
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 273-295) - Recommended CVS rule behavior and the required service input extension
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 417-423) - Keep the new rule deterministic and reuse the existing reporting model
- **Dependencies**:
  - Task 1.2 completion

### Task 2.2: Map evaluation results to a GitHub check conclusion and output payload

Add the small translation layer that turns PR Concierge's evaluation into GitHub-facing check output. The implementation should derive the final conclusion from evaluation check statuses, reuse the existing summary data, and keep icon promises honest by treating the GitHub icon as a function of state and conclusion rather than a custom asset.

- **Files**:
  - `src/github/checks.ts` - Add helpers or types for the check conclusion mapping and outbound `output` payload construction
  - `src/services/evaluatePullRequest.ts` - Expose or preserve the summary and checks data needed for the GitHub output without inventing a second reporting model
  - `src/app.ts` - Use the conclusion/output helpers when completing the check run
- **Success**:
  - Final GitHub conclusions are derived from deterministic evaluation checks rather than raw risk level alone
  - The check output includes a clear title and summary that reflect the evaluation result
  - The implementation does not claim support for a custom icon field GitHub does not provide
  - Any playful tone stays in copy, not in fictional API parameters
- **Research References**:
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 169-189) - Why the icon must be treated as GitHub-managed state instead of a custom payload field
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 253-269) - The output fields that best fit PR Concierge's summary model
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 333-355) - Recommended conclusion mapping and copy placement for personality
- **Dependencies**:
  - Task 2.1 completion

## Phase 3: Verify the end-to-end Lambda-to-GitHub flow and update contributor guidance

### Task 3.1: Extend the local Lambda integration suite to assert GitHub check publication

Update the existing local webhook integration tests so they cover the full external interaction sequence: changed-file lookup, check-run creation, and check-run completion. Use the existing `fetch` seam to assert request order, payload content, and the positive, negative, and skip outcomes of the CVS phrase rule.

- **Files**:
  - `tests/integration/local/webhook.local.test.ts` - Add assertions for `POST /check-runs`, `PATCH /check-runs/{id}`, and the CVS phrase pass/fail/skip cases
  - `tests/integration/fixtures/github-pull-request-opened.official.json` - Reuse the existing official fixture and mutate title/body values in tests as needed rather than inventing a parallel payload shape
  - `tests/integration/helpers/testEnv.ts` - Update local env defaults only if the auth model adds or renames required runtime variables
- **Success**:
  - The local handler suite proves the Lambda now talks to GitHub for both file lookup and check publication
  - Tests cover at least one passing CVS phrase case, one failing opposite-phrase case, and one neither-phrase case
  - The suite stays deterministic and AWS-free
  - No extra HTTP client abstraction is introduced solely for testing
- **Research References**:
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 114-125) - The current local handler suite is already the right verification surface
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 386-403) - Recommended local test coverage and the exact outbound request sequence to assert
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 417-423) - Preserve the current reporting model and keep the rule simple and deterministic
- **Dependencies**:
  - Phase 2 completion

### Task 3.2: Update docs and verification guidance for the new check behavior

Document the new GitHub check feature, the humorous phrase behavior, and the credential expectations needed to make it work in real environments. Keep the deployed test story conservative unless the implementation intentionally adds a live end-to-end GitHub check assertion.

- **Files**:
  - `.env.example` - Show any final runtime-variable expectations for check publication
  - `README.md` - Explain the new PR check behavior, the CVS phrase rule, and the auth requirement for publishing checks
  - `AGENTS.md` - Keep build, test, and environment guidance aligned with the implementation
  - `tests/integration/deployed/webhook.deployed.test.ts` - Update only if the implementation intentionally broadens the deployed verification surface
- **Success**:
  - Contributors can discover the new feature behavior and auth requirements from the README alone
  - Operator guidance in `AGENTS.md` matches the actual implementation and runtime expectations
  - The docs do not over-promise a custom icon field or an always-on deployed check assertion
  - Any deployed-suite changes remain explicit and safe by default
- **Research References**:
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 100-112) - Current docs do not yet describe check publication permissions
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 357-382) - Required doc targets for the auth contract and feature behavior
  - #file:../research/20260507-github-check-reporting-and-cvs-string-validation-research.md (Lines 405-423) - Keep the default deployed verification conservative and update docs in the same change
- **Dependencies**:
  - Task 3.1 completion

## Dependencies

- A supported GitHub credential with permission to publish check runs, or an explicitly adopted GitHub App auth flow
- The existing Lambda webhook route and fetch-based GitHub API pattern under `src/github/`
- The local integration test harness that already invokes the exported Lambda `handler`

## Success Criteria

- Supported PR webhook events publish a GitHub-visible check run with a deterministic conclusion and summary
- The evaluation service includes the `CVS is Rock` / `CVS is not Rock` rule without turning every PR into a mandatory slogan test
- Local integration tests verify the outbound GitHub interactions and the positive, negative, and skip phrase cases
- Documentation explains the check behavior and the real credential requirements needed to make it work