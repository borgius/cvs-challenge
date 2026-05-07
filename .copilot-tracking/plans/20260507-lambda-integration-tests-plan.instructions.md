---
applyTo: '.copilot-tracking/changes/20260507-lambda-integration-tests-changes.md'
---

<!-- markdownlint-disable-file -->

# Task Checklist: Lambda Integration Tests

## Overview

Add integration tests that verify the PR Concierge Lambda locally through the exported handler and after deployment through the real HTTP API.

## Objectives

- Add a deterministic local Lambda integration-test harness that does not require AWS credentials or live GitHub dependencies
- Add a deployed integration-test path that reuses the existing deployment summary output and stays safe by default
- Update scripts, CI, and docs so contributors know exactly how to run the new local and deployed test flows

## Research Summary

### Project Files

- `src/index.ts` - Exports both the local server entrypoint and the AWS Lambda `handler`
- `src/app.ts` - Defines the `/health` and `/webhooks/github` behaviors the integration tests should exercise
- `src/config/env.ts` - Defines the runtime env contract that local tests need to satisfy explicitly
- `src/storage/evaluationRepository.ts` - Provides the `console` repository mode that keeps local tests AWS-free
- `tsconfig.json` - Current build-only TypeScript config that should stay focused on `src/`
- `scripts/deploy.sh` - Produces the deployment summary JSON that deployed tests should reuse
- `scripts/smoke-test.sh` - Existing URL-discovery pattern for the deployed health endpoint
- `.github/workflows/ci.yml` - Current CI flow that needs to start running the local integration suite

### External References

- #file:../research/20260507-lambda-integration-tests-research.md - Verified repo analysis, upstream test-runner guidance, Lambda payload-shape notes, and the recommended local-plus-deployed strategy
- https://main.vitest.dev/guide/projects - Vitest project configuration guidance for splitting local and deployed suites
- https://main.vitest.dev/guide/mocking - Vitest guidance for `vi.stubGlobal`, `unstubGlobals`, and `unstubEnvs`
- https://hono.dev/docs/getting-started/aws-lambda - Hono AWS Lambda adapter usage with `handle(app)`
- https://hono.dev/docs/guides/testing - Hono testing guidance for request-driven assertions
- https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html - Official API Gateway HTTP API payload-format `2.0` event structure

### Standards References

- `AGENTS.md` - Repository conventions for test commands, source-of-truth files, and doc updates when behavior changes

## Implementation Checklist

### [ ] Phase 1: Establish the integration-test harness

- [ ] Task 1.1: Add the test runner, project config, and test-only TypeScript config

  - Details: `.copilot-tracking/details/20260507-lambda-integration-tests-details.md` (Lines 11-29)

- [ ] Task 1.2: Add shared fixtures and helpers for Lambda events, webhook signing, deployment discovery, and test env setup

  - Details: `.copilot-tracking/details/20260507-lambda-integration-tests-details.md` (Lines 31-51)

### [ ] Phase 2: Cover the local Lambda integration flow

- [ ] Task 2.1: Add local handler integration tests for health and webhook behavior

  - Details: `.copilot-tracking/details/20260507-lambda-integration-tests-details.md` (Lines 55-74)

### [ ] Phase 3: Cover the deployed integration flow

- [ ] Task 3.1: Add safe-by-default deployed endpoint integration tests

  - Details: `.copilot-tracking/details/20260507-lambda-integration-tests-details.md` (Lines 78-95)

- [ ] Task 3.2: Make the full deployed webhook success path explicit and opt-in

  - Details: `.copilot-tracking/details/20260507-lambda-integration-tests-details.md` (Lines 97-113)

### [ ] Phase 4: Wire commands, CI, and contributor guidance

- [ ] Task 4.1: Update package scripts and CI to run the local integration suite by default

  - Details: `.copilot-tracking/details/20260507-lambda-integration-tests-details.md` (Lines 117-133)

- [ ] Task 4.2: Update docs so contributors know how to run local and deployed integration tests

  - Details: `.copilot-tracking/details/20260507-lambda-integration-tests-details.md` (Lines 135-151)

## Dependencies

- Verified research in `.copilot-tracking/research/20260507-lambda-integration-tests-research.md`
- A test runner that supports Node, TypeScript, environment stubbing, and project-level separation
- The existing deployment summary contract in `.artifacts/${SERVICE_NAME}-deployment.json`

## Success Criteria

- Contributors can run local Lambda integration tests without AWS credentials or a live GitHub fixture
- Contributors can run deployed integration tests against a real deployment using the generated deployment summary or explicit URL overrides
- CI runs the local Lambda integration suite on pull requests and pushes
- README and `AGENTS.md` both describe the new test commands and the opt-in nature of the live deployed success-path test