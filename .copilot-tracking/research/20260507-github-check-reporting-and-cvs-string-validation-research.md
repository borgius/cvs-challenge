<!-- markdownlint-disable-file -->

# Research: GitHub Check Reporting and CVS String Validation

## Task Summary

Add a GitHub-visible PR check from the Lambda webhook flow so PRs receive a CI-like result with status, GitHub-managed icon behavior, and a short summary generated from the PR Concierge evaluation. In the same change, add one playful deterministic content rule that passes when a PR includes the string `CVS is Rock` and fails when it includes an explicit opposite string.

The plan needs to fit the current repository layout, preserve the existing webhook validation flow, stay deterministic, and avoid promising GitHub UI capabilities that the API does not actually expose.

## Tool Usage and Verified Findings

### Workspace inspection

- `file_search` confirmed there was no existing research file for this task under `.copilot-tracking/research/`.
- `read_file` was used on `package.json`, `src/app.ts`, `src/services/evaluatePullRequest.ts`, `src/github/client.ts`, `src/github/payload.ts`, `src/config/env.ts`, `src/types/evaluation.ts`, `src/types/github.ts`, `src/storage/evaluationRepository.ts`, `.env.example`, and `tests/integration/local/webhook.local.test.ts`.
- `grep_search` verified that the current implementation has no existing GitHub Checks or commit-status publishing path, while `src/github/payload.ts` already validates the full official `pull_request` webhook payload through Ajv.
- `grep_search` over the official webhook fixture confirmed that the current payload shape already includes `pull_request.title` and `pull_request.body`, which are the most natural fields for a funny content-based rule.

### External documentation

- `fetch_webpage` against GitHub's REST docs for check runs verified the request surface for creating and updating check runs, including `status`, `conclusion`, and `output.title` / `output.summary` / `output.text`.
- `fetch_webpage` against GitHub's commit-status docs verified that commit statuses only support `state`, `description`, `target_url`, and `context`, which is materially less expressive than a check run.
- `fetch_webpage` against GitHub's "Using the REST API to interact with checks" and "About status checks" docs verified the UI model: GitHub Actions uses checks, checks populate the Checks tab, and the visible state is driven by status and conclusion.
- `fetch_webpage` against GitHub's "Building CI checks with a GitHub App" guide provided a concrete create-then-update workflow example and confirmed that `output.title` and `output.summary` are the primary CI-style feedback fields.

## Current Repository State

### Webhook orchestration already has the right seams

`src/app.ts` already performs the high-level flow in one place:

1. read the raw webhook body
2. validate the HMAC signature
3. parse JSON
4. validate the payload against GitHub's official pull-request schema
5. reject unsupported actions
6. fetch changed files from the GitHub API
7. call `evaluatePullRequest(...)`
8. persist the evaluation and return a JSON response

That means the Lambda already knows everything needed to publish a PR check after schema validation:

- repository full name
- pull request number
- head SHA
- branch and label metadata
- full validated pull-request payload
- GitHub delivery ID for correlation

The existing route structure also matches the repository guidance in `AGENTS.md`: HTTP concerns stay in `src/app.ts`, GitHub API integration lives under `src/github/`, and deterministic evaluation stays in `src/services/`.

### Evaluation output already contains most of the summary material

`src/services/evaluatePullRequest.ts` currently builds:

- a `checks` array of deterministic `pass` / `fail` / `warn` / `skip` results
- a multi-line `summary`
- a `riskAssessment`
- an `EvaluationRecord`

Today the service evaluates only two rules:

- branch naming
- required labels

The resulting summary already looks like the skeleton of a GitHub check summary. The missing pieces are:

- a way to inspect PR text content for the new playful rule
- a way to translate the evaluation into a GitHub Check conclusion and output payload
- a GitHub API client that can publish the result back to the PR's head SHA

### The payload validator already unlocks title/body-based rules

`src/github/payload.ts` validates the incoming payload as `PullRequestEvent` from `@octokit/webhooks-types`, not the narrower local `PullRequestPayload` helper type.

That matters because the official pull-request payload already includes fields such as:

- `pull_request.title`
- `pull_request.body`
- `pull_request.html_url`
- `pull_request.head.sha`

The local integration fixture in `tests/integration/fixtures/github-pull-request-opened.official.json` also includes `title` and `body`, so the existing test harness can cover string-based rules without inventing fake payload structure.

### GitHub API calls already use `fetch()` and `GITHUB_TOKEN`

`src/github/client.ts` uses plain `fetch()` with these headers:

- `accept: application/vnd.github+json`
- `authorization: Bearer ${githubToken}`
- `user-agent: pr-concierge`
- `x-github-api-version`

This is important for two reasons:

1. a new GitHub Checks client can follow the same low-dependency pattern under `src/github/`
2. the existing local integration tests already stub `globalThis.fetch`, so the same seam can verify outbound check-run requests

### Environment and docs do not yet describe check-publishing permissions

`src/config/env.ts` and `.env.example` currently define one GitHub runtime credential:

- `GITHUB_TOKEN`

The README currently documents that token only as the credential for reading changed files from the GitHub API. There is no mention yet of:

- `Checks` write permissions
- GitHub App credentials
- any check-run publishing behavior

If the implementation reuses `GITHUB_TOKEN` for Checks API calls, the docs and examples must be updated to reflect the broader permission contract.

### The local test harness is already the best verification surface

`tests/integration/local/webhook.local.test.ts` currently exercises the exported Lambda `handler` end-to-end, while mocking GitHub HTTP calls via `fetch`.

That is already the right surface for this feature because it can assert:

- the webhook still returns the expected HTTP response
- the evaluation summary still comes back in the response body
- GitHub files lookup requests still work
- new GitHub check-run requests are made with the expected endpoint, headers, and JSON payload

No new browser, server, or AWS test harness is required.

### Persistence is delivery-keyed and retry-friendly enough for webhook replays

`src/storage/evaluationRepository.ts` writes the evaluation record with:

- `pk = ${repositoryFullName}#${pullNumber}`
- `sk = githubDeliveryId ?? createdAt`

For real webhook deliveries, this means retries using the same GitHub delivery ID overwrite the same DynamoDB item instead of multiplying evaluation rows. That reduces the persistence risk if check publication errors cause GitHub to redeliver the webhook.

It does not, however, make GitHub check runs themselves idempotent. If a webhook is retried after a check run was already created, duplicate check runs with the same name are still possible unless the implementation adds explicit deduplication.

## External Research

### Checks are the right product surface for a CI-like PR result

GitHub's status-check docs distinguish two APIs:

- **Checks**
- **Commit statuses**

Checks are the CI-like surface. They:

- populate the PR Checks tab
- support richer output
- support annotations and requested actions
- expose status and conclusion concepts that drive GitHub's check UI

Commit statuses are thinner. They support only:

- `state`
- `description`
- `target_url`
- `context`

Why this matters here:

- the user explicitly wants something similar to a CI pipeline check, with status and summary
- commit statuses do not provide `output.summary`
- commit statuses do not populate the Checks tab

So a silent downgrade to commit statuses would not fully satisfy the request.

### GitHub does not offer a custom icon field for check runs

The check-run docs expose fields for:

- `status`
- `conclusion`
- `output.title`
- `output.summary`
- `output.text`
- `annotations`
- `images`

The docs do **not** expose a request field for a custom status icon. The status-check UI docs also frame the visible check state around status and conclusion values.

Practical implication:

- the implementation can control the **state** that drives GitHub's built-in iconography
- the implementation can add personality with text or emoji inside the title or summary
- the implementation cannot upload or select an arbitrary per-run icon via the REST payload

If the user wants the same kind of green check, neutral dot, or red failure symbol that CI systems show on GitHub, that is achievable by setting the appropriate check conclusion. If they want a bespoke icon, that is not supported by the documented API.

### The Checks API supports a CI-like create/update flow

GitHub's checks guide and tutorial show a standard sequence:

1. create a check run for the commit SHA
2. mark it `in_progress`
3. update it to `completed`
4. attach `output.title`, `output.summary`, and optionally `output.text` and `annotations`

Representative request shape from the docs:

```json
{
  "name": "mighty_readme",
  "head_sha": "ce587453ced02b1526dfb4cb910479d431683101",
  "status": "in_progress",
  "external_id": "42",
  "output": {
    "title": "Mighty Readme report",
    "summary": "",
    "text": ""
  }
}
```

Representative completion update from the docs:

```json
{
  "status": "completed",
  "conclusion": "success",
  "output": {
    "title": "Mighty Readme report",
    "summary": "There are 0 failures, 2 warnings, and 1 notices.",
    "text": "More detail here"
  }
}
```

Why this matters here:

- the repository can mimic a small CI pipeline without adding GitHub Actions logic
- the check summary can reuse the deterministic evaluation summary the Lambda already produces
- the create/update pattern gives users a visible running state, not just a final result

### Check-run auth requirements need explicit verification

GitHub's docs are not perfectly tidy here, but the safe evidence-based reading is:

- create/update check-run endpoints require **Checks write** capability
- the narrative guidance repeatedly says check-writing is a GitHub App-style feature
- the endpoint metadata also lists GitHub App tokens and fine-grained PATs with `Checks` repository permission as supported token types
- the docs explicitly say OAuth apps and classic personal access tokens cannot use the update endpoint

Practical implication for this repository:

- the current generic `GITHUB_TOKEN` name is not enough information by itself
- the implementation must verify whether the deployed runtime token is a supported token type with the needed `Checks` permission
- if the runtime still uses a classic PAT or a token without `Checks` write, real check-run publication will fail at runtime

This is the biggest non-code risk in the task.

### Checks give better output fields than commit statuses

The GitHub App tutorial explicitly calls out that each check run output can include:

- `title`
- `summary`
- `text`
- `annotations`
- `images`

The tutorial also notes that `title` and `summary` are the required `output` fields when output is provided.

That is a good fit for PR Concierge because:

- `title` can carry the top-line result, such as `PR Concierge passed` or `PR Concierge found issues`
- `summary` can carry a short Markdown-style list of the deterministic checks and risk result
- `text` can carry the full existing multi-line evaluation summary if the team wants more detail without bloating the title

## Recommended Implementation Strategy

### 1. Keep the new playful rule inside deterministic evaluation logic

The new CVS rule should live alongside the existing branch-naming and required-label checks in `src/services/evaluatePullRequest.ts`, not in the HTTP layer.

Recommended rule shape:

- inspect `pull_request.title` and `pull_request.body`
- search case-insensitively across the combined text
- return `pass` when the text includes `CVS is Rock`
- return `fail` when the text includes `CVS is not Rock`
- return `skip` when neither phrase appears

Why this shape fits the repo:

- it is deterministic
- it does not break every PR by default
- it keeps the rule playful and explicit instead of turning into a mandatory content requirement for all pull requests

This rule will require extending `EvaluatePullRequestInput` so the service receives at least:

- `pullRequestTitle`
- `pullRequestBody`

### 2. Add a dedicated GitHub Checks client under `src/github/`

The repo's structure and current fetch-based GitHub client both point to a new module such as:

- `src/github/checks.ts`

That client should own:

- repository-name parsing
- `POST /repos/{owner}/{repo}/check-runs`
- `PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}`
- shared GitHub headers and API versioning

Keep this logic out of `src/app.ts`. The app layer should orchestrate, not handcraft HTTP requests.

### 3. Use a create-then-update flow to match CI expectations

The most evidence-backed approach is:

1. after the webhook payload is validated and the action is accepted, create a check run for `head_sha`
2. set an initial status such as `in_progress`
3. run the normal PR evaluation
4. update the check run to `completed` with the derived conclusion and output summary
5. if evaluation fails after the check is created, update that same check run to `failure`

Why this is the best fit for the request:

- it looks more like a CI pipeline than a single final write
- it avoids promising a custom icon while still giving GitHub enough information to render the right built-in icon
- it aligns with GitHub's documented example flow for checks

Recommended metadata to include:

- `name`: a stable required-check name such as `pr-concierge`
- `external_id`: the GitHub delivery ID when available, otherwise a fallback based on repo, PR number, and SHA
- `details_url`: optional; use only if there is a meaningful URL to link to

### 4. Derive the final GitHub conclusion from evaluation results, not raw risk level alone

The check conclusion should be driven by the deterministic checks array.

Recommended mapping:

- `failure` if any evaluation check has `status === 'fail'`
- `neutral` if there are no failures but there are meaningful warnings the team wants surfaced without blocking
- `success` when there are no failures and nothing notable beyond skips

Do **not** map high risk directly to `failure` unless the product decision is to block merges on risk alone. The current repo models risk as advisory context, not a hard validation failure.

### 5. Keep icon expectations honest and use copy for personality

Because there is no custom icon field, the fun part should live in the text, not the transport contract.

Good places for personality:

- check `output.title`
- one line in `output.summary`
- the new CVS check's `details`

Do not claim that the implementation supports a custom icon upload or icon selector.

### 6. Update the credential contract and docs in the same change

If the implementation reuses `GITHUB_TOKEN`, update at least:

- `.env.example`
- `README.md`
- `AGENTS.md`

The docs should say that the runtime token now needs enough permission for:

- the existing changed-files lookup
- the new Checks API write flow

If the target environment cannot provide a supported token type with `Checks` write, the repo will need a different auth design, likely a GitHub App credential flow. That is a real dependency, not a nice-to-have.

## Recommended File Targets

- `src/app.ts` - Thread PR title/body through evaluation, orchestrate check-run creation/update, and preserve structured error handling
- `src/services/evaluatePullRequest.ts` - Add the CVS content rule and any helper that derives the next step from the expanded checks set
- `src/github/checks.ts` - Add GitHub check-run HTTP client helpers
- `src/config/env.ts` - Update config contract only if the auth model changes beyond the existing `GITHUB_TOKEN`
- `src/types/evaluation.ts` - Extend only if the check-publishing helper needs a stronger typed result surface
- `tests/integration/local/webhook.local.test.ts` - Assert both GitHub files lookup and check-run create/update requests
- `.env.example` - Document any new or broadened GitHub credential requirements
- `README.md` - Document the PR check behavior and token requirements
- `AGENTS.md` - Keep operator and testing guidance aligned with the new behavior

## Testing Guidance Based on Evidence

### Local tests should stay on the Lambda handler path

The local integration tests already use the exported Lambda `handler`, which is the correct surface for this feature. They should grow to cover:

- successful webhook evaluation that creates and completes a check run
- negative CVS phrase case that finishes with a failing check conclusion
- neutral/skip path when neither phrase is present
- graceful error handling if the Checks API returns an error after a check run is started

### `fetch` stubs can cover every outbound GitHub call

One local test can verify the entire external interaction sequence by asserting the mocked calls for:

1. `GET /pulls/{pullNumber}/files`
2. `POST /check-runs`
3. `PATCH /check-runs/{check_run_id}`

That keeps tests deterministic and avoids adding another HTTP abstraction solely for testing.

### Deployed tests can remain conservative by default

This feature does not require broadening the default deployed integration suite. The safe deployed checks can stay focused on:

- `GET /health`
- empty-body rejection
- invalid-signature rejection

If the repo later adds an opt-in deployed success-path assertion for GitHub checks, that should remain explicit because it depends on live GitHub credentials and observable PR state.

## Implementation Guidance Based on Evidence

- Keep GitHub REST integration under `src/github/`, not inline in route handlers.
- Keep the new CVS string rule deterministic and explicit.
- Prefer case-insensitive phrase matching over regex cleverness; this is a toy rule, not a natural-language processor.
- Reuse the existing `summary` plus `checks` data to build the GitHub check output instead of inventing a second reporting model.
- Use structured logging around check-run create/update calls so operators can diagnose permission failures quickly.
- Do not silently fall back to commit statuses if the requirement is a CI-like check with summary output. If the auth lane cannot support checks, surface that as a documented implementation dependency.
- Update documentation and env examples in the same change if token permissions or operational expectations change.

## Suggested Verification Targets

Implementation should finish with verification that proves:

- the Lambda still handles supported webhook events successfully
- the Lambda now publishes a GitHub check result for supported PR events
- the CVS positive phrase produces a passing evaluation check
- the CVS negative phrase produces a failing evaluation check
- docs accurately describe the GitHub token or GitHub App permission requirements

## Bottom Line

The cleanest evidence-backed plan is:

1. add a new deterministic PR-content rule for `CVS is Rock` vs `CVS is not Rock`
2. publish the evaluation back to GitHub as a real check run, not a thin commit status
3. use GitHub's standard create-then-update check flow so the PR shows a CI-like state and summary
4. keep the UI promise honest: GitHub controls the iconography from status/conclusion, while PR Concierge controls the summary and text
5. verify early that the runtime credential really supports `Checks` write, because that auth prerequisite is the sharpest edge in the whole task

That gets the repository the feature the user asked for, without pretending the API can do magic tricks it never signed up for.