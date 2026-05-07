import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { PullRequestPayload } from '../../../src/types/github.ts';
import { createGitHubSignature } from '../helpers/createGitHubSignature.ts';
import { resolveDeployedUrl } from '../helpers/loadDeploymentSummary.ts';

interface DeployedWebhookSuccessConfig {
  webhookSecret: string;
  repositoryFullName: string;
  pullNumber: number;
  branchName: string;
  baseBranch: string;
  headSha: string;
  labels: string[];
}

const loadWebhookFixture = (): PullRequestPayload =>
  JSON.parse(
    readFileSync(
      new URL('../fixtures/github-pull-request-opened.json', import.meta.url),
      'utf8',
    ),
  ) as PullRequestPayload;

const parseRepositoryFullName = (
  repositoryFullName: string,
): { owner: string; repo: string } => {
  const [owner, repo] = repositoryFullName.split('/');

  if (!owner || !repo) {
    throw new Error(
      `DEPLOYED_PR_REPOSITORY must be in owner/repo format. Received '${repositoryFullName}'.`,
    );
  }

  return { owner, repo };
};

const loadDeployedWebhookSuccessConfig = (): DeployedWebhookSuccessConfig | undefined => {
  const webhookSecret = process.env.DEPLOYED_WEBHOOK_SECRET?.trim();
  const repositoryFullName = process.env.DEPLOYED_PR_REPOSITORY?.trim();
  const pullNumberText = process.env.DEPLOYED_PR_NUMBER?.trim();

  if (!webhookSecret || !repositoryFullName || !pullNumberText) {
    return undefined;
  }

  const pullNumber = Number.parseInt(pullNumberText, 10);

  if (!Number.isInteger(pullNumber) || pullNumber <= 0) {
    throw new Error(
      `DEPLOYED_PR_NUMBER must be a positive integer. Received '${pullNumberText}'.`,
    );
  }

  return {
    webhookSecret,
    repositoryFullName,
    pullNumber,
    branchName:
      process.env.DEPLOYED_PR_BRANCH_NAME?.trim() ||
      'feature/deployed-webhook-integration-test',
    baseBranch: process.env.DEPLOYED_PR_BASE_BRANCH?.trim() || 'main',
    headSha:
      process.env.DEPLOYED_PR_HEAD_SHA?.trim() ||
      '0123456789abcdef0123456789abcdef01234567',
    labels:
      process.env.DEPLOYED_PR_LABELS
        ?.split(',')
        .map((label) => label.trim())
        .filter(Boolean) ?? [],
  };
};

const buildLiveWebhookPayload = (
  config: DeployedWebhookSuccessConfig,
): PullRequestPayload => {
  const payload = loadWebhookFixture();
  const { owner, repo } = parseRepositoryFullName(config.repositoryFullName);

  payload.action = 'opened';
  payload.number = config.pullNumber;
  payload.pull_request.number = config.pullNumber;
  payload.pull_request.head.ref = config.branchName;
  payload.pull_request.head.sha = config.headSha;
  payload.pull_request.base.ref = config.baseBranch;
  payload.pull_request.labels = config.labels.map((name) => ({ name }));
  payload.repository.full_name = config.repositoryFullName;
  payload.repository.owner = { login: owner };
  payload.repository.name = repo;

  return payload;
};

const deployedWebhookSuccessConfig = loadDeployedWebhookSuccessConfig();
const optInLiveWebhookTest = deployedWebhookSuccessConfig ? it : it.skip;

describe('deployed webhook integration', () => {
  it('rejects empty webhook bodies', async () => {
    const response = await fetch(resolveDeployedUrl('webhookUrl'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: '',
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      message: 'GitHub webhook requests must include a body.',
    });
  });

  it('rejects invalid webhook signatures', async () => {
    const rawBody = JSON.stringify(loadWebhookFixture());
    const response = await fetch(resolveDeployedUrl('webhookUrl'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': 'sha256=definitely-not-valid',
      },
      body: rawBody,
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      message: 'Invalid GitHub signature.',
    });
  });

  optInLiveWebhookTest(
    'processes a signed live webhook when DEPLOYED_WEBHOOK_SECRET, DEPLOYED_PR_REPOSITORY, and DEPLOYED_PR_NUMBER are set',
    async () => {
      if (!deployedWebhookSuccessConfig) {
        throw new Error('Missing deployed webhook success configuration.');
      }

      const payload = buildLiveWebhookPayload(deployedWebhookSuccessConfig);
      const rawBody = JSON.stringify(payload);
      const response = await fetch(resolveDeployedUrl('webhookUrl'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-delivery': 'deployed-live-webhook-test',
          'x-hub-signature-256': createGitHubSignature(
            rawBody,
            deployedWebhookSuccessConfig.webhookSecret,
          ),
        },
        body: rawBody,
      });
      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        message: 'Pull request evaluated successfully.',
      });
      expect(['low', 'medium', 'high']).toContain(body.riskLevel);
      expect(Array.isArray(body.changedAreas)).toBe(true);
      expect(Array.isArray(body.checks)).toBe(true);
      expect(typeof body.requestId).toBe('string');
    },
  );
});
