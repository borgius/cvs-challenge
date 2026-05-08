import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import type { PullRequestPayload } from '../../../src/types/github.ts';
import { handler } from '../../../src/index.ts';
import { buildHttpApiV2Event } from '../helpers/buildHttpApiV2Event.ts';
import { createGitHubSignature } from '../helpers/createGitHubSignature.ts';
import {
  applyLocalTestEnv,
  createLambdaContext,
  localTestEnvDefaults,
} from '../helpers/testEnv.ts';

type LambdaResponse = Awaited<ReturnType<typeof handler>>;

const loadWebhookFixture = (): PullRequestPayload =>
  JSON.parse(
    readFileSync(
      new URL('../fixtures/github-pull-request-opened.official.json', import.meta.url),
      'utf8',
    ),
  ) as PullRequestPayload;

const buildSuccessfulWebhookPayload = (): PullRequestPayload => {
  const payload = loadWebhookFixture();
  const existingLabels = payload.pull_request.labels ?? [];

  payload.number = 42;
  payload.pull_request.number = 42;
  payload.pull_request.head.ref = 'feature/lambda-integration-tests';
  payload.pull_request.head.sha = '0123456789abcdef0123456789abcdef01234567';
  payload.pull_request.base.ref = 'main';
  payload.pull_request.labels = existingLabels.length > 0
    ? [{ ...existingLabels[0], name: 'safe-to-deploy' }]
    : [{ name: 'safe-to-deploy' }];
  payload.repository.full_name = 'octo-org/pr-concierge';
  payload.repository.owner = {
    ...payload.repository.owner,
    login: 'octo-org',
  };
  payload.repository.name = 'pr-concierge';

  return payload;
};

const parseJsonBody = (response: LambdaResponse): Record<string, unknown> => {
  expect(response.body).toBeDefined();

  return JSON.parse(response.body ?? '{}') as Record<string, unknown>;
};

describe('local Lambda webhook integration', () => {
  it('rejects requests with an empty body', async () => {
    applyLocalTestEnv();

    const response = await handler(
      buildHttpApiV2Event({
        method: 'POST',
        path: '/webhooks/github',
        headers: {
          'content-type': 'application/json',
        },
      }),
      createLambdaContext('local-empty-body-request-id'),
    );
    const body = parseJsonBody(response);

    expect(response.statusCode).toBe(400);
    expect(body).toMatchObject({
      message: 'GitHub webhook requests must include a body.',
      requestId: 'local-empty-body-request-id',
    });
  });

  it('rejects requests with an invalid GitHub signature', async () => {
    applyLocalTestEnv();

    const rawBody = JSON.stringify(loadWebhookFixture());
    const response = await handler(
      buildHttpApiV2Event({
        method: 'POST',
        path: '/webhooks/github',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': 'sha256=definitely-not-valid',
        },
        body: rawBody,
      }),
      createLambdaContext('local-invalid-signature-request-id'),
    );
    const body = parseJsonBody(response);

    expect(response.statusCode).toBe(401);
    expect(body).toMatchObject({
      message: 'Invalid GitHub signature.',
      requestId: 'local-invalid-signature-request-id',
    });
  });

  it('ignores unsupported pull request actions without calling GitHub', async () => {
    applyLocalTestEnv();

    const payload = loadWebhookFixture();
    payload.action = 'unlocked';

    const rawBody = JSON.stringify(payload);
    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(
      buildHttpApiV2Event({
        method: 'POST',
        path: '/webhooks/github',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': createGitHubSignature(
            rawBody,
            localTestEnvDefaults.GITHUB_WEBHOOK_SECRET,
          ),
        },
        body: rawBody,
      }),
      createLambdaContext('local-unsupported-action-request-id'),
    );
    const body = parseJsonBody(response);

    expect(response.statusCode).toBe(202);
    expect(body).toMatchObject({
      message: "Ignoring pull request action 'unlocked'.",
      requestId: 'local-unsupported-action-request-id',
      supportedActions: ['opened', 'synchronize', 'reopened'],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects webhook bodies that fail the official pull_request schema', async () => {
    applyLocalTestEnv();

    const payload = loadWebhookFixture() as unknown as Record<string, unknown>;

    delete payload.sender;

    const rawBody = JSON.stringify(payload);
    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(
      buildHttpApiV2Event({
        method: 'POST',
        path: '/webhooks/github',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': createGitHubSignature(
            rawBody,
            localTestEnvDefaults.GITHUB_WEBHOOK_SECRET,
          ),
        },
        body: rawBody,
      }),
      createLambdaContext('local-invalid-payload-request-id'),
    );
    const body = parseJsonBody(response);

    expect(response.statusCode).toBe(400);
    expect(body).toMatchObject({
      message: 'Invalid GitHub pull request payload.',
      requestId: 'local-invalid-payload-request-id',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('evaluates a signed opened webhook with mocked GitHub file data', async () => {
    applyLocalTestEnv();

    const payload = buildSuccessfulWebhookPayload();
    const rawBody = JSON.stringify(payload);
    const fetchMock = vi.fn(
      async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const request = new Request(input, init);

        expect(request.url).toBe(
          'https://api.github.com/repos/octo-org/pr-concierge/pulls/42/files?per_page=100&page=1',
        );
        expect(request.headers.get('authorization')).toBe(
          'Bearer local-test-github-token',
        );

        return new Response(
          JSON.stringify([
            {
              filename: 'src/services/evaluatePullRequest.ts',
              status: 'modified',
              additions: 10,
              deletions: 2,
              changes: 12,
            },
            {
              filename: 'README.md',
              status: 'modified',
              additions: 2,
              deletions: 0,
              changes: 2,
            },
          ]),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        );
      },
    );

    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(
      buildHttpApiV2Event({
        method: 'POST',
        path: '/webhooks/github',
        headers: {
          'content-type': 'application/json',
          'x-github-delivery': 'delivery-42',
          'x-hub-signature-256': createGitHubSignature(
            rawBody,
            localTestEnvDefaults.GITHUB_WEBHOOK_SECRET,
          ),
        },
        body: rawBody,
      }),
      createLambdaContext('local-success-request-id'),
    );
    const body = parseJsonBody(response);

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      message: 'Pull request evaluated successfully.',
      requestId: 'local-success-request-id',
      riskLevel: 'medium',
      changedAreas: ['api', 'docs'],
      recordKey: {
        pk: 'octo-org/pr-concierge#42',
      },
    });
    expect(typeof body.summary).toBe('string');
    expect(Array.isArray(body.checks)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
