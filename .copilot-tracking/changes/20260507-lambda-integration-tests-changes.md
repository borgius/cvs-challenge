<!-- markdownlint-disable-file -->

# Lambda Integration Tests Changes

## Status

- [x] Phase 1: Establish the integration-test harness
- [x] Phase 2: Cover the local Lambda integration flow
- [x] Phase 3: Cover the deployed integration flow
- [x] Phase 4: Wire commands, CI, and contributor guidance

## Changes made

- Created this tracking file.
- Added Vitest project configuration and a test-only TypeScript config.
- Added shared integration-test fixtures and helpers for Lambda events, GitHub signatures, deployment discovery, and test environment setup.
- Added local Lambda integration tests and deployed HTTP API integration tests.
- Updated package scripts, CI, README, and AGENTS guidance for the new test workflow.
- Deleted the implementation prompt after completing the task.

## Verification

- `npm run build`
- `npm run test`
- `npm run test:integration:deployed`

## Notes

- The deployed suite ran against `.artifacts/pr-concierge-deployment.json`.
- The opt-in deployed live webhook success-path test was skipped because its explicit environment variables were not set.
