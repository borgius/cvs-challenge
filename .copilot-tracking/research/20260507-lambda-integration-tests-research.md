<!-- markdownlint-disable-file -->

# Research: Lambda Integration Tests for Local and Deployed Environments

## Task Summary

Add integration-test coverage for the PR Concierge Lambda so contributors can verify the service in two places:

- locally, against the exported AWS Lambda handler
- after deployment, against the real HTTP API endpoint

The plan needs to fit the current repository shape, keep local tests deterministic, and avoid forcing live GitHub or DynamoDB dependencies unless the operator explicitly opts into a full end-to-end run.

## Tool Usage and Verified Findings

### Workspace inspection

- `file_search` confirmed there was no existing research for this task under `.copilot-tracking/research/`.
- `grep_search` over `**/*.{ts,js,mjs,cjs}` found no existing test files or test suites in the repository.
- `read_file` was used on `package.json`, `tsconfig.json`, `src/index.ts`, `src/app.ts`, `src/config/env.ts`, `src/storage/evaluationRepository.ts`, `scripts/deploy.sh`, `scripts/common.sh`, `scripts/smoke-test.sh`, `README.md`, and relevant docs to verify the current runtime and deployment behavior.

### External documentation

- `mcp_context7_get-library-docs` for Vitest verified support for multi-project configuration, `vi.stubGlobal`, and automatic cleanup options such as `unstubEnvs`.
- `mcp_context7_get-library-docs` for Hono verified two useful testing surfaces:
  - `app.request()` for route-level HTTP testing
  - `handle(app)` plus `LambdaEvent` and `LambdaContext` bindings for AWS Lambda execution
- `fetch_webpage` against the AWS API Gateway HTTP API Lambda integration docs verified the official payload-format `2.0` event shape, including `version`, `routeKey`, `rawPath`, `headers`, `requestContext.http`, `body`, and `isBase64Encoded`.

### Structural search note

- `hypergrep --model "" .` returned an empty cached index in this environment, so file-level inspection remained the reliable source of verified repository structure for this planning pass.

## Current Repository State

### Runtime entrypoints

`src/index.ts` exports both application entrypoints that matter for this task:

- `app` for local Node server use
- `handler = handle(app)` for AWS Lambda use

That split matters. A local integration test that only hits `npm run dev` exercises the Node adapter, not the Lambda adapter. If the goal is “integration tests for lambda,” the local test harness should invoke `handler` directly with realistic API Gateway HTTP API events.

### Route surface and observable behaviors

`src/app.ts` currently exposes two public routes:

- `GET /health`
- `POST /webhooks/github`

Verified response behaviors that are good integration-test candidates:

- `GET /health` returns `200` with JSON containing `status`, `service`, `requestId`, and `timestamp`
- `POST /webhooks/github` with an empty body returns `400` before config loading
- `POST /webhooks/github` with invalid JSON returns `400`
- `POST /webhooks/github` with an invalid signature returns `401`
- unsupported pull request actions return `202`
- supported pull request actions call the GitHub files API, evaluate the PR, persist the record, and return `200`

### Environment and dependency contract

`src/config/env.ts` verifies that webhook processing expects these environment variables:

- `GITHUB_WEBHOOK_SECRET`
- `GITHUB_TOKEN`
- `EVALUATIONS_TABLE_NAME`
- optional `AWS_REGION`, `RAW_EVENT_BUCKET_NAME`, `ENABLE_RAW_EVENT_ARCHIVE`, `REQUIRED_LABELS`, and `EVALUATION_REPOSITORY`

`src/storage/evaluationRepository.ts` shows an important testing seam:

- `EVALUATION_REPOSITORY=console` avoids AWS writes and logs the record instead
- `EVALUATION_REPOSITORY=dynamodb` creates a real DynamoDB client and issues `PutCommand`

That means local integration tests can stay deterministic and AWS-free by forcing the console repository mode.

### GitHub API dependency shape

`src/github/client.ts` makes outbound `fetch()` calls to the GitHub REST API endpoint:

`https://api.github.com/repos/{owner}/{repo}/pulls/{pullNumber}/files`

This makes `globalThis.fetch` the cleanest seam for local integration tests. There is no custom HTTP client abstraction yet, so the test harness needs to stub `fetch()` for GitHub calls while leaving the rest of the route stack intact.

### Current test posture

The repository has no dedicated test runner yet.

Verified from `package.json`:

- `npm run build` -> `tsc -p tsconfig.json`
- `npm run typecheck` -> `tsc -p tsconfig.json --noEmit`
- `npm run test` -> `npm run typecheck`

Verified from `.github/workflows/ci.yml`:

- CI installs dependencies, builds TypeScript, and type-checks
- CI does not run any application tests yet

### TypeScript constraints that affect test-file placement

`tsconfig.json` currently sets:

- `rootDir` to `./src`
- `include` to `src/**/*.ts`
- `types` to `["node", "aws-lambda"]`

This is a key implementation constraint.

If tests are added outside `src/`, the current build config will not type-check them. If tests are added inside `src/`, they risk being emitted into `dist/`, which is undesirable for Lambda packaging. The cleanest path is to keep the production `tsconfig.json` focused on `src/` and add a separate test-oriented TypeScript configuration for Vitest.

### Deployment output discovery already exists

`scripts/deploy.sh` writes `.artifacts/${SERVICE_NAME}-deployment.json` using OpenTofu outputs.

`scripts/smoke-test.sh` already resolves `healthUrl` from that file when no URL is passed. The deployment summary is therefore a verified and stable source of truth for deployed integration-test target URLs.

### Repository docs already call for end-to-end validation

The planning docs are ahead of implementation, but they clearly expect an integration pass:

- `docs/build-by-stages.md` stage `S3` calls for “Run one end-to-end webhook test”
- `docs/multiagent-stage-briefs.md` says the integration phase is done when a webhook request works end to end and the DynamoDB record is created

Adding integration tests is aligned with the repository’s own stated target, not an extra side quest.

## External Research

### Vitest patterns that fit this repository

From the Vitest docs:

- Vitest supports `test.projects`, which is a good fit for splitting local Lambda integration tests from deployed endpoint tests without inventing two separate test stacks.
- `vi.stubGlobal()` can replace globals such as `fetch` during tests.
- `unstubGlobals: true` and `unstubEnvs: true` are recommended when tests stub globals or environment variables so state does not leak between cases.
- TypeScript support for global APIs can be added with `vitest/globals` in a test-specific `types` list.

Representative configuration pattern from the docs:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'local-lambda',
          include: ['tests/integration/local/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'deployed',
          include: ['tests/integration/deployed/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
    unstubGlobals: true,
    unstubEnvs: true,
  },
})
```

Why this matters here:

- this repo is plain TypeScript running on Node, so Vitest fits without adding browser tooling
- the project split lets CI run only local tests while operators can run the deployed suite explicitly
- automatic unstubbing is valuable because local tests will stub `fetch` and mutate environment variables

### Hono testing and Lambda adapter guidance

From the Hono docs:

- `app.request()` is the built-in route-testing surface for Hono applications
- `handle(app)` creates the AWS Lambda handler export
- Hono’s AWS Lambda adapter binds `event` and `lambdaContext` into `c.env`

Representative examples from the docs:

```ts
import { Hono } from 'hono'
import { handle } from 'hono/aws-lambda'

const app = new Hono()
app.get('/', (c) => c.text('Hello Hono!'))

export const handler = handle(app)
```

```ts
test('GET /hello is ok', async () => {
  const res = await app.request('/hello')
  expect(res.status).toBe(200)
})
```

Why this matters here:

- `app.request()` is still useful for narrow route checks, but it does not prove the Lambda adapter wiring
- invoking the exported `handler` is the closer match for local Lambda integration coverage
- because `requestId` generation in `src/app.ts` reads `c.env.lambdaContext?.awsRequestId`, direct handler invocation is the only local path that naturally verifies Lambda context propagation

### Official AWS HTTP API payload-format `2.0` shape

From the AWS API Gateway HTTP API Lambda integration docs:

- Lambda proxy integrations for HTTP APIs use payload format version `2.0`
- version `2.0` includes `rawPath`, `headers`, `queryStringParameters`, `cookies`, `requestContext.http`, `body`, `pathParameters`, `stageVariables`, and `isBase64Encoded`
- duplicate headers are combined in `headers`, and the event does not include `multiValueHeaders`

Representative AWS example:

```json
{
  "version": "2.0",
  "routeKey": "$default",
  "rawPath": "/my/path",
  "headers": {
    "header1": "value1"
  },
  "requestContext": {
    "http": {
      "method": "POST",
      "path": "/my/path",
      "protocol": "HTTP/1.1",
      "sourceIp": "192.0.2.1",
      "userAgent": "agent"
    },
    "requestId": "id",
    "routeKey": "$default",
    "stage": "$default"
  },
  "body": "Hello from Lambda",
  "isBase64Encoded": false
}
```

Why this matters here:

- local handler tests should build request events that look like API Gateway HTTP API events, not arbitrary objects
- a thin event-builder helper can make the local suite readable while keeping the event shape faithful to AWS

## Recommended Test Strategy

### 1. Use one test runner with two explicit projects

Recommended tooling:

- add `vitest` as the integration-test runner
- add `vitest.config.ts` with two projects:
  - `local-lambda`
  - `deployed`
- add a test-only TypeScript config such as `tsconfig.vitest.json`

Why:

- the repository is already TypeScript-first and ESM-based
- one runner keeps contributor ergonomics simple
- separate projects let CI and humans choose the right surface without ad hoc flags

### 2. Local tests should invoke the exported Lambda handler

Recommended local harness:

- import `handler` from `src/index.ts`
- construct API Gateway HTTP API payload-format `2.0` events
- pass a small fake Lambda context with a stable `awsRequestId`
- set test env vars explicitly
- force `EVALUATION_REPOSITORY=console`
- stub `globalThis.fetch` only for the GitHub files lookup

Representative local helper shape:

```ts
export const buildHttpApiV2Event = (input: {
  method: 'GET' | 'POST'
  path: string
  headers?: Record<string, string>
  body?: string
}) => ({
  version: '2.0',
  routeKey: '$default',
  rawPath: input.path,
  rawQueryString: '',
  headers: input.headers ?? {},
  requestContext: {
    accountId: '123456789012',
    apiId: 'local-test',
    domainName: 'local.test',
    domainPrefix: 'local',
    http: {
      method: input.method,
      path: input.path,
      protocol: 'HTTP/1.1',
      sourceIp: '127.0.0.1',
      userAgent: 'vitest',
    },
    requestId: 'local-request-id',
    routeKey: '$default',
    stage: '$default',
    time: '12/Mar/2020:19:03:58 +0000',
    timeEpoch: 1583348638390,
  },
  body: input.body,
  isBase64Encoded: false,
})
```

Recommended minimum local assertions:

- `GET /health` returns `200` and uses the Lambda request ID when present
- `POST /webhooks/github` returns `400` on empty body
- `POST /webhooks/github` returns `401` on invalid signature
- `POST /webhooks/github` returns `202` for unsupported actions
- `POST /webhooks/github` returns `200` on a signed, supported webhook with mocked GitHub file data

### 3. Deployed tests should hit the real HTTP API, but stay safe by default

Recommended deployed harness:

- resolve `healthUrl` and `webhookUrl` from `.artifacts/${SERVICE_NAME}-deployment.json`
- allow env overrides for operators who want to point at another deployment
- use real `fetch()` against the deployed endpoint

Recommended safe-by-default deployed assertions:

- `GET /health` returns `200`
- `POST /webhooks/github` with an empty body returns `400`
- `POST /webhooks/github` with an intentionally invalid signature returns `401`

These checks exercise API Gateway plus Lambda without requiring:

- a live GitHub test PR
- a real webhook secret in the test process
- a real DynamoDB assertion path

### 4. Make the full deployed webhook success path opt-in

The repository planning docs want an end-to-end webhook test, but the default deployed suite should stay safe and repeatable.

Recommended opt-in variables for a true deployed success-path test:

- `DEPLOYED_WEBHOOK_SECRET`
- `DEPLOYED_PR_REPOSITORY`
- `DEPLOYED_PR_NUMBER`
- optional `DEPLOYED_REQUIRED_LABELS_EXPECTED` or similar fixture metadata if the response needs more precise assertions

If these variables are absent, the full deployed success case should be skipped rather than faked.

Why:

- a real success-path deployed webhook test triggers GitHub API access and persistence behavior
- the repo can support that path, but it should be explicit, not accidental

### 5. Reuse the repo’s existing deployment-summary convention

Recommended helper behavior:

- first read explicit env overrides such as `DEPLOYED_HEALTH_URL` and `DEPLOYED_WEBHOOK_URL`
- otherwise read `.artifacts/${SERVICE_NAME}-deployment.json`
- fail with a clear message if neither source exists for the deployed test project

This aligns with `scripts/smoke-test.sh` and avoids inventing a second way to discover deployed URLs.

### 6. Keep test code out of Lambda build output

Recommended TypeScript structure:

- keep `tsconfig.json` focused on production build output from `src/`
- add `tsconfig.vitest.json` for tests and Vitest globals
- place tests under `tests/integration/`

Representative test tsconfig shape:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": ".",
    "types": ["node", "aws-lambda", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

Why:

- production build behavior stays predictable
- tests still get strict TypeScript checking
- Lambda packaging does not pick up test files from `dist/`

## Recommended File Layout

```text
tests/
  integration/
    fixtures/
      github-pull-request-opened.json
    helpers/
      buildHttpApiV2Event.ts
      createGitHubSignature.ts
      loadDeploymentSummary.ts
      testEnv.ts
    local/
      health.local.test.ts
      webhook.local.test.ts
    deployed/
      health.deployed.test.ts
      webhook.deployed.test.ts
vitest.config.ts
tsconfig.vitest.json
```

This keeps local and deployed concerns separate while still sharing fixtures and helpers.

## Implementation Guidance Based on Evidence

- Prefer `vitest` over a custom Node script runner because the repo needs repeated local assertions, environment cleanup, and HTTP/global stubbing.
- Do not route local Lambda integration tests through `npm run dev`; that covers the Node server entrypoint, not the exported Lambda handler.
- Use real HMAC signing in local happy-path webhook tests so signature validation is exercised, not bypassed.
- Keep local tests in `console` repository mode so they do not need AWS credentials or a local DynamoDB emulator.
- Use `vi.stubGlobal('fetch', ...)` plus `unstubGlobals: true` for GitHub API mocking; this matches the current code’s actual dependency seam.
- Keep the default deployed suite limited to safe endpoint checks that do not require live GitHub or persistence fixtures.
- Gate the fully deployed success-path webhook test behind explicit env variables because it depends on live external state.
- Update `package.json`, `README.md`, `AGENTS.md`, and `.github/workflows/ci.yml` together if the implementation changes the supported test commands.

## Suggested Verification Targets

Local verification should end with commands equivalent to:

- build the app
- run the local Lambda integration project
- run the broader test command that contributors are expected to use

Deployed verification should end with commands equivalent to:

- deploy the stack
- run the deployed integration project against the generated `.artifacts/...deployment.json`
- optionally run the opt-in success-path webhook case when explicit fixture env vars are present

## Bottom Line

The cleanest evidence-backed approach is:

1. add Vitest with separate `local-lambda` and `deployed` projects
2. invoke the exported `handler` directly for local Lambda integration coverage
3. hit the deployed HTTP API for remote verification using the existing deployment summary file
4. keep the default deployed suite safe, and make the full end-to-end webhook success path opt-in

That gives the repository real Lambda integration coverage without making every test depend on AWS, GitHub, or interview-demo luck.