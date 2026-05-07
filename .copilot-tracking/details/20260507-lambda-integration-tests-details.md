<!-- markdownlint-disable-file -->

# Task Details: Lambda Integration Tests

## Research Reference

**Source Research**: #file:../research/20260507-lambda-integration-tests-research.md

## Phase 1: Establish the integration-test harness

### Task 1.1: Add the test runner, project config, and test-only TypeScript config

Introduce a dedicated integration-test runner that fits the repo's existing TypeScript and ESM setup without polluting the production build. The implementation should keep the current production `tsconfig.json` focused on Lambda source output and add a separate test-oriented config for Vitest.

- **Files**:
  - `package.json` - Add `vitest` and scripts for local and deployed integration projects
  - `package-lock.json` - Capture the new dependency graph
  - `vitest.config.ts` - Define the `local-lambda` and `deployed` projects with Node environment settings and automatic unstubbing
  - `tsconfig.vitest.json` - Type-check tests, helpers, and the Vitest config without changing the production build output
- **Success**:
  - The repository has one integration-test runner with distinct local and deployed projects
  - Tests can type-check without broadening the production `dist/` build scope
  - Global and environment stubs are automatically cleaned up between test cases
- **Research References**:
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 85-110) - Current test posture and the `tsconfig.json` constraints that make a separate test config necessary
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 129-171) - Vitest project configuration and automatic unstubbing guidance
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 246-262) - Recommended two-project test-runner strategy for this repo
- **Dependencies**:
  - Verified research baseline

### Task 1.2: Add shared fixtures and helpers for webhook signing, Lambda events, deployment discovery, and test env setup

Create the reusable test assets that both suites need. The helpers should hide the noisy mechanics of API Gateway event construction, HMAC signature generation, deployment-summary lookup, and environment-variable setup so the actual tests stay readable.

- **Files**:
  - `tests/integration/fixtures/github-pull-request-opened.json` - Stable webhook fixture for local and optional deployed success-path coverage
  - `tests/integration/helpers/buildHttpApiV2Event.ts` - Build realistic API Gateway HTTP API payload-format `2.0` events for local handler invocation
  - `tests/integration/helpers/createGitHubSignature.ts` - Generate `x-hub-signature-256` values from raw webhook bodies
  - `tests/integration/helpers/loadDeploymentSummary.ts` - Resolve deployed URLs from environment overrides or `.artifacts/${SERVICE_NAME}-deployment.json`
  - `tests/integration/helpers/testEnv.ts` - Centralize the local test environment defaults and restoration behavior
- **Success**:
  - The local suite can generate realistic Lambda events instead of hand-writing raw objects inline
  - The webhook tests can sign payloads with the same HMAC flow the app validates in production
  - The deployed suite can discover target URLs the same way the repository already does for `scripts/smoke-test.sh`
- **Research References**:
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 77-83) - GitHub API calls currently depend on `globalThis.fetch`
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 206-244) - Official HTTP API payload-format `2.0` structure for local event builders
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 264-318) - Local Lambda harness shape, request context, and baseline assertions
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 358-418) - Deployment-summary lookup behavior and recommended test file layout
- **Dependencies**:
  - Task 1.1 completion

## Phase 2: Cover the local Lambda integration flow

### Task 2.1: Add local handler integration tests for health and webhook behavior

Implement the local integration suite by invoking the exported `handler` from `src/index.ts` with realistic HTTP API events and a small fake Lambda context. Keep the repository mode set to `console` and stub GitHub file lookups so the suite stays deterministic and AWS-free.

- **Files**:
  - `tests/integration/local/health.local.test.ts` - Verify `GET /health` through the Lambda handler and confirm request ID propagation from Lambda context
  - `tests/integration/local/webhook.local.test.ts` - Verify empty-body, invalid-signature, unsupported-action, and signed-success webhook flows through the Lambda handler
  - `tests/integration/helpers/testEnv.ts` - Add any helper behavior needed to apply and restore environment defaults cleanly
- **Success**:
  - Local tests exercise the exported Lambda handler, not the Node dev server
  - The health test proves the Lambda request ID reaches the JSON response
  - Webhook tests cover the safe negative paths plus one signed happy path with mocked GitHub file data
  - The local suite runs without AWS credentials or a DynamoDB emulator
- **Research References**:
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 36-83) - Verified route behaviors, environment contract, and GitHub fetch dependency seam
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 173-244) - Hono Lambda adapter guidance and official HTTP API event shape
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 264-318) - Recommended local harness and minimum assertion set
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 420-428) - Evidence-backed guard rails for local Lambda testing
- **Dependencies**:
  - Phase 1 completion

## Phase 3: Cover the deployed integration flow

### Task 3.1: Add safe-by-default deployed endpoint integration tests

Implement the deployed suite so it talks to the real HTTP API endpoint using `fetch()` and resolves target URLs from the existing deployment summary file or explicit environment overrides. The default suite should stay safe by only checking endpoint behaviors that do not require live GitHub or persistence fixtures.

- **Files**:
  - `tests/integration/deployed/health.deployed.test.ts` - Verify the deployed `GET /health` endpoint
  - `tests/integration/deployed/webhook.deployed.test.ts` - Verify deployed empty-body and invalid-signature webhook responses
  - `tests/integration/helpers/loadDeploymentSummary.ts` - Support environment overrides and deployment-summary fallback
- **Success**:
  - The deployed suite can discover the target API without a second bespoke URL-discovery mechanism
  - The default deployed tests exercise API Gateway plus Lambda with no live GitHub dependency
  - The deployed suite fails clearly when no deployment summary or URL override is available
- **Research References**:
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 112-116) - Existing deployment-summary output contract
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 320-366) - Safe deployed harness design and deployment-summary reuse
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 427-428) - Guard rails for keeping the default deployed suite safe
- **Dependencies**:
  - Phase 1 completion

### Task 3.2: Make the full deployed webhook success path explicit and opt-in

Extend the deployed webhook suite with a real success-path case only when the operator provides the required live-fixture inputs. The test should skip cleanly when those inputs are missing instead of pretending to validate behavior that depends on GitHub and persistence.

- **Files**:
  - `tests/integration/deployed/webhook.deployed.test.ts` - Add the opt-in success-path test and its skip conditions
  - `README.md` - Document the extra environment variables needed for the full deployed success-path test
- **Success**:
  - The repository supports a true deployed webhook success case without forcing it into the default suite
  - Missing live-fixture variables cause a clear skip, not a false pass or an opaque failure
  - The live success-path test uses a real signature and a real PR fixture source when enabled
- **Research References**:
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 118-125) - Repository docs already expect an end-to-end webhook test at the integration stage
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 340-356) - Opt-in variable guidance and why the success path must stay explicit
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 427-428) - Evidence-backed rule to gate live external-state coverage behind explicit env vars
- **Dependencies**:
  - Task 3.1 completion

## Phase 4: Wire commands, CI, and contributor guidance

### Task 4.1: Update package scripts and CI to run the local integration suite by default

Promote the local Lambda integration project into the repository's standard test surface while keeping the deployed suite opt-in. CI should run the local project, not the deployed project.

- **Files**:
  - `package.json` - Define contributor-facing commands such as `test`, `test:integration:local`, and `test:integration:deployed`
  - `.github/workflows/ci.yml` - Run the local integration suite in CI after install and build steps
- **Success**:
  - Contributors have one obvious local command for integration coverage
  - CI validates the local Lambda integration path on every push and pull request
  - The deployed suite remains a manual or post-deploy command rather than a CI flake generator
- **Research References**:
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 85-98) - Current repo scripts and CI do not run tests yet
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 248-262) - Two-project strategy that cleanly separates local and deployed runs
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 420-429) - Implementation guidance for default local coverage and coordinated script/doc updates
- **Dependencies**:
  - Phases 2 and 3 completion

### Task 4.2: Update docs so contributors know how to run local and deployed integration tests

Document the supported commands, fixture expectations, and deployed URL discovery flow. Keep the docs honest about what the default deployed suite covers and what requires explicit live-fixture inputs.

- **Files**:
  - `README.md` - Add local and deployed integration-test instructions and explain the deployment-summary fallback
  - `AGENTS.md` - Update the verified test command guidance and note the deployed suite behavior
- **Success**:
  - A contributor can discover how to run local Lambda integration tests from the README alone
  - The docs explain how the deployed suite discovers URLs and when the full success-path test is skipped
  - `AGENTS.md` stays aligned with the new scripts and verification expectations
- **Research References**:
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 118-125) - End-to-end testing is already part of the documented project intent
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 358-418) - Deployment-summary discovery and recommended file layout that the docs should describe
  - #file:../research/20260507-lambda-integration-tests-research.md (Lines 429-454) - Coordinated update guidance, verification targets, and final recommended direction
- **Dependencies**:
  - Task 4.1 completion

## Dependencies

- `vitest` added as a dev dependency
- Existing Node.js and npm workflow retained for build and test commands
- Current `.artifacts/${SERVICE_NAME}-deployment.json` contract preserved for deployed URL discovery

## Success Criteria

- The repository has one clear local Lambda integration-test path and one clear deployed integration-test path
- Local tests cover the exported Lambda handler with deterministic fixtures and no AWS dependency
- Deployed tests can reuse the existing deployment summary and stay safe by default
- CI and docs both point contributors at the new supported local test command