---
applyTo: '.copilot-tracking/changes/20260507-self-pr-concierge-configuration-changes.md'
---

<!-- markdownlint-disable-file -->

# Task Checklist: Self PR Concierge Configuration

## Overview

Add a safe, explicit, and idempotent operator path that wires `borgius/cvs-challenge` to its own deployed PR Concierge webhook endpoint for `pull_request` events.

## Objectives

- Reuse the existing deployment artifact and webhook-secret contract to connect the repository to the deployed `POST /webhooks/github` endpoint
- Keep GitHub repository-admin auth and verification separate from the Lambda runtime token and the default AWS deploy path
- Give operators a repeatable way to create or update the self webhook, verify ping and deliveries, and understand the optional label follow-up

## Research Summary

### Project Files

- `scripts/deploy.sh` - Already writes `.artifacts/<service>-deployment.json` with the deployed `webhookUrl`
- `scripts/common.sh` - Shared Bash helper layer and the natural place for reusable deployment-summary and GitHub-helper functions
- `src/app.ts` - Current `POST /webhooks/github` receiver that already validates signatures and processes PR events
- `src/github/signature.ts` - Existing HMAC-SHA256 and constant-time signature verification helper
- `src/github/client.ts` - Shows that the runtime `GITHUB_TOKEN` is for changed-file lookups, not repository administration
- `tests/integration/deployed/webhook.deployed.test.ts` - Existing opt-in live deployed webhook test that can be reused for self-hook verification
- `infra/terraform/outputs.tf` - Exposes the deployment summary and `webhook_url` already needed for GitHub-side configuration
- `infra/terraform/env/dev.auto.tfvars.example` - Shows that `required_labels` is empty by default, so label setup is optional follow-up work

### External References

- #file:../research/20260507-self-pr-concierge-configuration-research.md - Verified repository findings plus GitHub webhook API and secret-validation guidance
- https://docs.github.com/en/rest/webhooks/repo-config - Repository webhook list/create/update/ping/deliveries API contract and permission model
- https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks - Repository-admin requirement, event selection, content type, secret, and automatic ping behavior
- https://docs.github.com/en/webhooks/webhook-events-and-payloads#pull_request - `pull_request` event availability and delivery headers
- https://docs.github.com/en/webhooks/using-webhooks/securing-your-webhooks - `X-Hub-Signature-256`, HMAC-SHA256, UTF-8, and constant-time comparison guidance

### Standards References

- `AGENTS.md` - Repository rules for honest docs, explicit operator workflows, and safe infrastructure claims

## Implementation Checklist

### [ ] Phase 1: Define the self-dogfooding operator contract

- [ ] Task 1.1: Reuse the existing deployment artifact and webhook secret contract

  - Details: `.copilot-tracking/details/20260507-self-pr-concierge-configuration-details.md` (Lines 11-28)

- [ ] Task 1.2: Keep GitHub repository-admin auth explicit and separate from runtime app auth

  - Details: `.copilot-tracking/details/20260507-self-pr-concierge-configuration-details.md` (Lines 30-48)

### [ ] Phase 2: Add idempotent repository-webhook automation

- [ ] Task 2.1: Add a Bash script that creates or updates the managed self webhook

  - Details: `.copilot-tracking/details/20260507-self-pr-concierge-configuration-details.md` (Lines 52-70)

- [ ] Task 2.2: Persist managed-hook metadata and expose a repeatable verification path

  - Details: `.copilot-tracking/details/20260507-self-pr-concierge-configuration-details.md` (Lines 72-91)

### [ ] Phase 3: Document and prove the self-use workflow

- [ ] Task 3.1: Document the operator flow from deploy to live self-hook verification

  - Details: `.copilot-tracking/details/20260507-self-pr-concierge-configuration-details.md` (Lines 95-112)

- [ ] Task 3.2: Keep required-label follow-up conditional and honest

  - Details: `.copilot-tracking/details/20260507-self-pr-concierge-configuration-details.md` (Lines 114-131)

## Dependencies

- A deployed stack and `.artifacts/<service>-deployment.json` created by `scripts/deploy.sh`
- GitHub repository-admin access through GitHub CLI auth or `GH_TOKEN` with `Webhooks: write`
- Verified research in `.copilot-tracking/research/20260507-self-pr-concierge-configuration-research.md`

## Success Criteria

- The repository has an explicit, idempotent operator path to create or update a `pull_request` webhook that targets the deployed PR Concierge endpoint
- GitHub repository-admin auth stays separate from the Lambda runtime token used for changed-file lookups
- Operators can verify the hook with ping and delivery inspection, then optionally reuse the existing deployed live webhook test for a full PR check
- Documentation explains the self-hook workflow clearly and keeps required-label setup conditional instead of mandatory