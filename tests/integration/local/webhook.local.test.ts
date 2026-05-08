import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

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

interface RecordedGitHubRequest {
  method: string;
  url: string;
  headers: Headers;
  jsonBody: Record<string, unknown> | undefined;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const annotateGitHubUsersWithViewType = (value: unknown): void => {
  if (Array.isArray(value)) {
    value.forEach((item) => {
      annotateGitHubUsersWithViewType(item);
    });

    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (
    typeof value.login === 'string' &&
    typeof value.avatar_url === 'string' &&
    typeof value.site_admin === 'boolean'
  ) {
    value.user_view_type = 'public';
  }

  Object.values(value).forEach((nestedValue) => {
    annotateGitHubUsersWithViewType(nestedValue);
  });
};

const applyCurrentGitHubRepositoryShape = (value: unknown): void => {
  if (!isRecord(value)) {
    return;
  }

  delete value.custom_properties;
  value.has_pull_requests = true;
  value.pull_request_creation_policy = 'enabled';
};

const loadWebhookFixture = (): PullRequestPayload => {
  const payload = JSON.parse(
    readFileSync(
      new URL('../fixtures/github-pull-request-opened.official.json', import.meta.url),
      'utf8',
    ),
  ) as PullRequestPayload;

  const payloadRecord = payload as unknown as Record<string, unknown>;
  const pullRequest = payloadRecord.pull_request as Record<string, unknown>;
  const head = pullRequest.head as Record<string, unknown>;
  const base = pullRequest.base as Record<string, unknown>;

  annotateGitHubUsersWithViewType(payload as unknown);
  applyCurrentGitHubRepositoryShape(payloadRecord.repository);
  applyCurrentGitHubRepositoryShape(head.repo);
  applyCurrentGitHubRepositoryShape(base.repo);

  return payload;
};

const buildSuccessfulWebhookPayload = (
  contentOverrides: {
    title?: string;
    body?: string | null;
  } = {},
): PullRequestPayload => {
  const payload = loadWebhookFixture();
  const existingLabels = payload.pull_request.labels ?? [];

  payload.number = 42;
  payload.pull_request.number = 42;
  payload.pull_request.title =
    contentOverrides.title ?? 'Feature: validate pull request events';
  payload.pull_request.body =
    contentOverrides.body ?? 'This change keeps the webhook payload strict.';
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

const getRecordedRequest = (
  requests: RecordedGitHubRequest[],
  index: number,
): RecordedGitHubRequest => {
  const request = requests[index];

  expect(request).toBeDefined();

  if (!request) {
    throw new Error(`Missing recorded GitHub request at index ${index}.`);
  }

  return request;
};

const createJsonResponse = (
  body: unknown,
  status: number,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });

const createGitHubApiFetchMock = (): {
  fetchMock: ReturnType<typeof vi.fn>;
  requests: RecordedGitHubRequest[];
} => {
  const requests: RecordedGitHubRequest[] = [];
  const filesUrl =
    'https://api.github.com/repos/octo-org/pr-concierge/pulls/42/files?per_page=100&page=1';
  const createCheckRunUrl =
    'https://api.github.com/repos/octo-org/pr-concierge/check-runs';
  const updateCheckRunUrl =
    'https://api.github.com/repos/octo-org/pr-concierge/check-runs/7001';

  const fetchMock = vi.fn(
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const request = new Request(input, init);
      const bodyText = request.method === 'GET' ? undefined : await request.clone().text();

      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        jsonBody: bodyText
          ? (JSON.parse(bodyText) as Record<string, unknown>)
          : undefined,
      });

      if (request.url === createCheckRunUrl && request.method === 'POST') {
        return createJsonResponse({ id: 7001 }, 201);
      }

      if (request.url === filesUrl && request.method === 'GET') {
        return createJsonResponse(
          [
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
          ],
          200,
        );
      }

      if (request.url === updateCheckRunUrl && request.method === 'PATCH') {
        return createJsonResponse({ id: 7001 }, 200);
      }

      throw new Error(`Unexpected GitHub API request: ${request.method} ${request.url}`);
    },
  );

  return { fetchMock, requests };
};

const runSignedWebhook = async (
  payload: PullRequestPayload,
  requestId: string,
): Promise<LambdaResponse> => {
  const rawBody = JSON.stringify(payload);

  return handler(
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
    createLambdaContext(requestId),
  );
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

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
      details: 'The webhook request body was empty.',
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
      details:
        'The x-hub-signature-256 header did not match the request body and configured webhook secret.',
      requestId: 'local-invalid-signature-request-id',
    });
  });

  it('returns details when webhook processing fails after payload validation', async () => {
    applyLocalTestEnv();

    const payload = buildSuccessfulWebhookPayload({
      body: 'This change proves that CVS is Rock.',
    });
    const rawBody = JSON.stringify(payload);
    const fetchMock = vi.fn(async () => {
      throw new Error('Synthetic GitHub API failure');
    });

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
      createLambdaContext('local-processing-error-request-id'),
    );
    const body = parseJsonBody(response);

    expect(response.statusCode).toBe(500);
    expect(body).toMatchObject({
      message: 'Failed to process GitHub webhook.',
      details: 'Synthetic GitHub API failure',
      requestId: 'local-processing-error-request-id',
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

  it('ignores review_requested payloads from GitHub\'s current user shape without calling GitHub', async () => {
    applyLocalTestEnv();

    const payload = loadWebhookFixture() as unknown as Record<string, unknown>;
    const pullRequest = payload.pull_request as Record<string, unknown>;
    const requestedReviewers = pullRequest.requested_reviewers as Record<string, unknown>[];

    payload.action = 'review_requested';
    payload.requested_reviewer = requestedReviewers[0];

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
      createLambdaContext('local-review-requested-request-id'),
    );
    const body = parseJsonBody(response);

    expect(response.statusCode).toBe(202);
    expect(body).toMatchObject({
      message: "Ignoring pull request action 'review_requested'.",
      requestId: 'local-review-requested-request-id',
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
      details: expect.arrayContaining([
        expect.objectContaining({
          instancePath: '/',
          keyword: 'required',
          params: expect.objectContaining({
            missingProperty: 'sender',
          }),
        }),
      ]),
    });
    expect(Array.isArray(body.details)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('creates and completes a GitHub check run when the PR text says CVS is Rock', async () => {
    applyLocalTestEnv();

    const payload = buildSuccessfulWebhookPayload({
      body: 'This change proves that CVS is Rock.',
    });
    const { fetchMock, requests } = createGitHubApiFetchMock();

    vi.stubGlobal('fetch', fetchMock);

    const response = await runSignedWebhook(payload, 'local-success-request-id');
    const body = parseJsonBody(response);

    const checkRunCreateRequest = getRecordedRequest(requests, 0);
    const filesLookupRequest = getRecordedRequest(requests, 1);
    const checkRunUpdateRequest = getRecordedRequest(requests, 2);

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
    expect(body.summary).toContain('cvs phrase: pass');
    expect(body.checks).toContainEqual({
      name: 'cvs phrase',
      status: 'pass',
      details: 'PR text includes "CVS is Rock".',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      'POST https://api.github.com/repos/octo-org/pr-concierge/check-runs',
      'GET https://api.github.com/repos/octo-org/pr-concierge/pulls/42/files?per_page=100&page=1',
      'PATCH https://api.github.com/repos/octo-org/pr-concierge/check-runs/7001',
    ]);
    expect(checkRunCreateRequest.headers.get('authorization')).toBe(
      'Bearer local-test-github-token',
    );
    expect(checkRunCreateRequest.jsonBody).toMatchObject({
      name: 'pr-concierge',
      head_sha: '0123456789abcdef0123456789abcdef01234567',
      status: 'in_progress',
      external_id: 'delivery-42',
      output: {
        title: 'PR Concierge is evaluating this pull request',
      },
    });
    expect(filesLookupRequest.headers.get('authorization')).toBe(
      'Bearer local-test-github-token',
    );
    expect(checkRunUpdateRequest.jsonBody).toMatchObject({
      name: 'pr-concierge',
      status: 'completed',
      conclusion: 'success',
      output: {
        title: 'PR Concierge passed',
      },
    });
    expect(checkRunUpdateRequest.jsonBody?.output).toMatchObject({
      summary: expect.stringContaining('Checks: 2 passed, 0 failed, 0 warned, 1 skipped'),
      text: expect.stringContaining('cvs phrase: pass'),
    });
  });

  it('completes the GitHub check run with failure when the PR text says CVS is not Rock', async () => {
    applyLocalTestEnv();

    const payload = buildSuccessfulWebhookPayload({
      body: 'Please note that CVS is not Rock.',
    });
    const { fetchMock, requests } = createGitHubApiFetchMock();

    vi.stubGlobal('fetch', fetchMock);

    const response = await runSignedWebhook(payload, 'local-cvs-failure-request-id');
    const body = parseJsonBody(response);

    expect(response.statusCode).toBe(200);
    expect(body.summary).toContain('cvs phrase: fail');
    expect(body.checks).toContainEqual({
      name: 'cvs phrase',
      status: 'fail',
      details:
        'PR text says "CVS is not Rock". Remove the opposite phrase or replace it with "CVS is Rock".',
    });
    expect(requests[2]?.jsonBody).toMatchObject({
      conclusion: 'failure',
      output: {
        title: 'PR Concierge found issues',
      },
    });
    expect(requests[2]?.jsonBody?.output).toMatchObject({
      summary: expect.stringContaining('Next step: update the PR title or description to remove "CVS is not Rock"'),
      text: expect.stringContaining('cvs phrase: fail'),
    });
  });

  it('keeps the CVS rule non-blocking when the PR text does not mention either phrase', async () => {
    applyLocalTestEnv();

    const payload = buildSuccessfulWebhookPayload({
      body: 'This change improves the webhook pipeline without the easter egg.',
    });
    const { fetchMock, requests } = createGitHubApiFetchMock();

    vi.stubGlobal('fetch', fetchMock);

    const response = await runSignedWebhook(payload, 'local-cvs-skip-request-id');
    const body = parseJsonBody(response);

    expect(response.statusCode).toBe(200);
    expect(body.summary).toContain('cvs phrase: skip');
    expect(body.checks).toContainEqual({
      name: 'cvs phrase',
      status: 'skip',
      details: 'PR text does not mention either CVS phrase.',
    });
    expect(requests[2]?.jsonBody).toMatchObject({
      conclusion: 'success',
      output: {
        title: 'PR Concierge passed',
      },
    });
  });
});
