<!-- markdownlint-disable-file -->

# Research: Self PR Concierge Configuration

## Task Summary

Plan how to configure `borgius/cvs-challenge` so the repository uses its own deployed PR Concierge service for pull-request events.

The implementation needs to connect the GitHub repository to the already deployed `POST /webhooks/github` endpoint without overloading the existing AWS deploy flow, over-privileging the runtime GitHub token, or pretending the repository is already wired when it is not.

## Tool Usage and Verified Findings

### Workspace inspection

- `file_search` confirmed there was no existing research or planning bundle for a self-PR-Concierge task under `.copilot-tracking/`.
- `read_file` on `README.md`, `AGENTS.md`, `scripts/deploy.sh`, `scripts/common.sh`, `src/app.ts`, `src/config/env.ts`, `src/github/client.ts`, `src/github/signature.ts`, `tests/integration/deployed/webhook.deployed.test.ts`, `tests/integration/helpers/loadDeploymentSummary.ts`, `infra/terraform/outputs.tf`, `infra/terraform/env/dev.auto.tfvars.example`, `infra/terraform/README.md`, and `.gitignore` verified the current operator flow, runtime contract, and deployment outputs.
- `run_in_terminal` with `gh api repos/borgius/cvs-challenge/hooks` verified that the repository currently has zero configured repository webhooks.
- `fetch_webpage` against the active pull request confirmed the current PR has no labels and the repository is not already presenting a self-dogfooding setup in PR metadata.

### External documentation

- `fetch_webpage` against GitHub Docs for repository webhooks verified the create, list, update, ping, delivery-inspection, and redelivery endpoints, plus the required token permissions.
- `fetch_webpage` against GitHub Docs for creating webhooks verified the repository-admin requirement, `application/json` payload option, high-entropy secret guidance, event-selection guidance, and automatic `ping` event on creation.
- `fetch_webpage` against GitHub Docs for webhook events and payloads verified the `pull_request` event availability for repository webhooks and the important delivery headers, including `X-GitHub-Delivery`, `X-GitHub-Hook-ID`, and `X-Hub-Signature-256`.
- `fetch_webpage` against GitHub Docs for validating webhook deliveries verified the `sha256=` prefix, HMAC-SHA256 requirement, UTF-8 caveat, and constant-time comparison guidance.

## Current Repository State

### 1. The deployed service already publishes the webhook URL that GitHub needs

The repository does not need a new infrastructure output just to support self-dogfooding.

Verified facts:

- `infra/terraform/outputs.tf` exports both `webhook_url` and the machine-readable `deployment_summary.webhookUrl` value.
- `scripts/deploy.sh` writes `.artifacts/<service>-deployment.json` from the `deployment_summary` output after a successful apply.
- `tests/integration/helpers/loadDeploymentSummary.ts` already treats `.artifacts/<service>-deployment.json` as the source of truth for deployed `healthUrl` and `webhookUrl`, with explicit environment-variable overrides as a fallback.

Practical implication:

The self-configuration flow should reuse the existing deployment artifact instead of inventing a second URL-discovery mechanism.

### 2. The runtime contract already matches GitHub’s recommended signature model

The application is already ready to receive a properly configured GitHub webhook.

Verified facts:

- `src/app.ts` exposes `POST /webhooks/github` and reads the raw request body plus the `x-hub-signature-256` header before parsing JSON.
- `src/config/env.ts` requires `GITHUB_WEBHOOK_SECRET` for webhook processing.
- `src/github/signature.ts` computes `createHmac('sha256', webhookSecret).update(rawBody).digest('hex')`, expects the `sha256=` prefix, and uses `timingSafeEqual` for constant-time comparison.

That matches GitHub’s webhook-validation guidance closely enough that no runtime protocol change is needed for self-use.

### 3. The deployed test surface already supports a real signed webhook against a chosen repository

The repository already contains an operator-facing proof path for a real deployed webhook.

Verified facts from `tests/integration/deployed/webhook.deployed.test.ts`:

- the default deployed suite checks safe negative cases only
- an opt-in live success-path test already exists
- that live test signs the webhook body with `DEPLOYED_WEBHOOK_SECRET`
- that live test targets a specific repository and pull request via `DEPLOYED_PR_REPOSITORY` and `DEPLOYED_PR_NUMBER`

Practical implication:

Once the repository webhook exists, the implementation can reuse the existing deployed-test contract and documentation for verification instead of building a second end-to-end test system.

### 4. The current deploy flow stops at AWS and intentionally does not mutate GitHub repository settings

The present operator contract is deliberately scoped.

Verified facts:

- `scripts/deploy.sh` packages the Lambda, runs `tofu init`, runs `tofu apply`, and writes deployment output; it does not call the GitHub API.
- `scripts/common.sh` contains shared OpenTofu and environment helpers, but nothing for GitHub repository administration.
- `.github/workflows/deploy.yml` is still a validation/readiness workflow; it does not apply infrastructure or configure GitHub.
- `AGENTS.md` explicitly says the supported operator path runs through `scripts/deploy.sh` and `scripts/destroy.sh`, and warns against describing deployment as more automated than it is.

Practical implication:

Self-dogfooding should be added as a separate, explicit operator step or helper script. Bundling repository-admin side effects into the default deploy flow would change the repo’s safety and privilege model in a way the current docs do not support.

### 5. The runtime GitHub token should not become the repository-admin token by accident

The repository already has one GitHub token lane, but it is not the right place to hide webhook-administration privilege.

Verified facts:

- `src/github/client.ts` uses `GITHUB_TOKEN` to call `GET /repos/{owner}/{repo}/pulls/{pullNumber}/files` so the runtime can fetch changed files.
- `README.md` and `infra/terraform/README.md` describe `GITHUB_TOKEN` as an application secret that still becomes a Lambda environment variable.
- `infra/terraform/variables.tf` marks `github_token` as `sensitive`, but the repo docs correctly state that the raw value still lands in OpenTofu state because Lambda persists it as an environment variable.

Practical implication:

The repository should keep GitHub repository-administration privilege on a separate operator-auth path, such as GitHub CLI auth or a dedicated admin token supplied only when configuring the hook. Reusing the runtime token would over-scope a secret that is already state-bearing.

### 6. The repository currently has no webhook and does not require labels by default

This matters for scoping.

Verified facts:

- `gh api repos/borgius/cvs-challenge/hooks` returned an empty array, so there is no existing repository webhook to adopt.
- The active pull request page shows no labels.
- `infra/terraform/env/dev.auto.tfvars.example` sets `required_labels = ""` by default.

Practical implication:

- the first implementation must support a clean create path
- idempotent update behavior is still needed for future secret rotation or endpoint changes
- label bootstrapping is optional follow-up work unless the operator explicitly configures `required_labels`

## External Research: GitHub Webhook Requirements That Matter Here

### 1. Repository webhook management has a clean REST lifecycle

From GitHub’s repository-webhook REST documentation:

- `GET /repos/{owner}/{repo}/hooks` lists repository webhooks
- `POST /repos/{owner}/{repo}/hooks` creates a webhook
- `PATCH /repos/{owner}/{repo}/hooks/{hook_id}` updates a webhook’s active state, events, and config
- `POST /repos/{owner}/{repo}/hooks/{hook_id}/pings` sends a `ping` event
- `GET /repos/{owner}/{repo}/hooks/{hook_id}/deliveries` lists recent deliveries
- `GET /repos/{owner}/{repo}/hooks/{hook_id}/deliveries/{delivery_id}` shows request and response details for one delivery
- `POST /repos/{owner}/{repo}/hooks/{hook_id}/deliveries/{delivery_id}/attempts` requests redelivery

Representative create payload from the docs:

```json
{
  "name": "web",
  "active": true,
  "events": ["pull_request"],
  "config": {
    "url": "https://example.com/webhook",
    "content_type": "json",
    "secret": "replace-with-random-secret",
    "insecure_ssl": "0"
  }
}
```

Why this matters:

The repo does not need a custom GitHub App just to dogfood itself. A repository webhook plus an idempotent operator script is sufficient.

### 2. Token permissions are narrower than full repo administration, but still distinct

From the same REST docs:

- listing hooks requires `Webhooks` repository permission `read`
- creating, updating, deleting, or redelivering hooks requires `Webhooks` repository permission `write`
- the authenticated user still needs repository-owner or admin access to create or delete the webhook

Why this matters:

The implementation can and should ask only for the permission needed to manage the webhook. It does **not** need to reuse the runtime `GITHUB_TOKEN` that the Lambda uses for pull-file lookups.

### 3. Updating a webhook without resupplying the secret can silently remove the secret

GitHub’s update-webhook docs make one subtle but important point:

- if a webhook already has a `secret`, the update request must include the existing `secret` again or provide a new `secret`, otherwise the secret is removed

Why this matters:

The self-configuration flow must treat the secret as part of the update contract, not just the create contract. A casual partial update could break signature validation in production.

### 4. GitHub recommends only subscribing to the events you actually handle

From the webhook-creation and event docs:

- repository webhooks should subscribe only to the events the receiver needs
- repository webhooks support the `pull_request` event
- `pull_request` deliveries include the repository, pull request, action, and sender context the current app already expects

Why this matters:

For this repo, `events = ["pull_request"]` is the correct minimum configuration. Adding `push` or unrelated events would create noise and unsupported payloads.

### 5. A new webhook gets an automatic `ping`, and GitHub exposes delivery inspection after that

From the creation and webhook-event docs:

- GitHub sends a `ping` event immediately after webhook creation
- the dedicated ping endpoint can be called later for verification
- delivery inspection exposes the request headers, payload, response status, and response payload

Why this matters:

The implementation should not stop at “created successfully.” It should surface a verification path through `ping` and recent deliveries so operators can tell the difference between a configured hook and a working hook.

### 6. Secret handling rules match the current app implementation

From GitHub’s delivery-validation docs:

- use a random, high-entropy secret
- store the secret securely and never hardcode it in source control
- validate `X-Hub-Signature-256`, not the legacy SHA-1 header
- compute the HMAC with SHA-256 over the raw payload bytes
- compare in constant time
- preserve the payload and headers exactly before validation

Why this matters:

The existing runtime already follows the right verification pattern. The missing work is to configure GitHub with the same secret value that the Lambda expects.

## Practical Interpretation for This Repository

### Recommended implementation shape

The cleanest path is an explicit repository-webhook configuration lane that sits next to, but not inside, the AWS deploy lane.

Recommended components:

1. `scripts/configure-self-webhook.sh`
   - resolves the deployed `webhookUrl` from `.artifacts/<service>-deployment.json`
   - resolves the current repository name from local Git/GitHub context
   - uses GitHub repository-webhook APIs to create or update the hook
   - always configures `content_type=json`, `insecure_ssl=0`, `active=true`, and `events=["pull_request"]`
   - always includes the secret on update as well as create
2. shared helpers in `scripts/common.sh`
   - locate the deployment artifact
   - normalize the current repository slug
   - wrap GitHub API calls and error messages cleanly
3. a local metadata artifact under `.artifacts/`
   - store the managed webhook ID plus the repository and URL for later updates and diagnostics
4. README and AGENTS updates
   - document the separate GitHub-auth requirement
   - document the verification flow through ping, deliveries, and the existing deployed live webhook test

### Recommended auth lane

Prefer one of these operator-only auth paths for webhook management:

- GitHub CLI authenticated as a repository admin
- `GH_TOKEN` supplied with a fine-grained token that has `Webhooks: write` for this repository

Do **not** widen the deployed Lambda runtime token just to make repository-hook creation convenient.

### Recommended idempotency model

Because the repo currently has zero hooks but future endpoint changes are likely, the implementation should support both first-time creation and stable follow-up updates.

Recommended matching order:

1. if a saved webhook metadata file exists in `.artifacts/`, use its `hookId` first
2. otherwise fall back to a current-hook lookup by exact configured URL
3. if no match exists, create a new hook
4. if multiple matches exist, fail clearly and require operator cleanup instead of guessing

Why this is safer than URL-only matching:

- the deployed URL may change after infrastructure replacement
- the saved hook ID provides a stable handle for updates, pings, and delivery inspection

### Recommended verification flow

After create or update:

1. save the webhook metadata locally under `.artifacts/`
2. call the ping endpoint or surface the automatic `ping` result
3. show the hook ID and deliveries endpoint information to the operator
4. point to the existing opt-in deployed webhook success test for a full PR-level check

### Optional label work should stay conditional

Because `required_labels` defaults to empty and the active PR currently has no labels, label creation should be treated as conditional work.

Only add label-bootstrapping tasks if the operator explicitly sets `required_labels` to a non-empty value in the OpenTofu variable file.

## Recommended Refactor Scope

### What should change in the first implementation pass

1. Add an explicit script for self-webhook configuration.
2. Keep GitHub repository-admin auth separate from runtime application auth.
3. Reuse the deployment artifact that already contains `webhookUrl`.
4. Persist webhook metadata in `.artifacts/` for idempotent updates and diagnostics.
5. Document how to verify the hook with ping, deliveries, and the existing deployed live webhook test.

### What should **not** be bundled into the same change unless the user asks for it

- automatic GitHub webhook mutation inside `scripts/deploy.sh`
- a CI workflow that silently edits repository settings on push
- widening the runtime `GITHUB_TOKEN` privilege to include webhook administration
- mandatory label creation when `required_labels` is still empty
- posting comments or status checks back to GitHub, which is a different feature from receiving PR events

## Implementation Guidance Based on Evidence

- Reuse `deployment_summary.webhookUrl`; do not invent a second source of truth for the deployed endpoint.
- Keep the self-configuration step explicit and operator-invoked; do not hide GitHub repository mutation inside the default deploy path.
- Use `pull_request` as the only subscribed event unless the app gains support for more event types.
- Always send `content_type=json`, `insecure_ssl=0`, `active=true`, and the webhook `secret` on both create and update.
- Keep repository-admin auth on GitHub CLI auth or a dedicated `GH_TOKEN`-style operator secret, not the Lambda runtime token.
- Save the created hook ID in `.artifacts/` so later updates, pings, and delivery inspection can target the same managed hook reliably.
- Surface ping and delivery-inspection guidance in docs so operators can debug webhook wiring without digging through the GitHub UI blindfolded.
- Treat label setup as optional follow-up work, gated by non-empty `required_labels`.

## Source Links

- https://github.com/borgius/cvs-challenge/pull/1
- https://docs.github.com/en/rest/webhooks/repo-config
- https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks
- https://docs.github.com/en/webhooks/webhook-events-and-payloads#pull_request
- https://docs.github.com/en/webhooks/using-webhooks/securing-your-webhooks