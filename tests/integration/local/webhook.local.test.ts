import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { setSsmParameterLoaderForTests } from '../../../src/config/env.ts';
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

const expectedCheckBrandingImageUrl =
  'https://raw.githubusercontent.com/octo-org/pr-concierge/0123456789abcdef0123456789abcdef01234567/diagrams/assets/pr-concierge-check-icon.png';

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

  const payloadRecord = payload as unknown as Record<string, unknown>;
  const repository = payloadRecord.repository as Record<string, unknown>;
  const pullRequest = payloadRecord.pull_request as Record<string, unknown>;
  const head = pullRequest.head as Record<string, unknown>;
  const base = pullRequest.base as Record<string, unknown>;
  const headRepo = head.repo as Record<string, unknown>;
  const baseRepo = base.repo as Record<string, unknown>;

  repository.private = false;
  headRepo.full_name = 'octo-org/pr-concierge';
  headRepo.name = 'pr-concierge';
  headRepo.private = false;
  baseRepo.full_name = 'octo-org/pr-concierge';
  baseRepo.name = 'pr-concierge';
  baseRepo.private = false;

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
  const createInstallationTokenUrl =
    'https://api.github.com/app/installations/987654/access_tokens';
  const filesUrl =
    'https://api.github.com/repos/octo-org/pr-concierge/pulls/42/files?per_page=100&page=1';
  const createCheckRunUrl =
    'https://api.github.com/repos/octo-org/pr-concierge/check-runs';
  const updateCheckRunUrl =
    'https://api.github.com/repos/octo-org/pr-concierge/check-runs/7001';
  const installationAccessToken = 'ghs_local_installation_token';

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

      if (request.url === createInstallationTokenUrl && request.method === 'POST') {
        return createJsonResponse(
          {
            token: installationAccessToken,
            expires_at: '2099-01-01T00:00:00Z',
          },
          201,
        );
      }

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
  webhookSecret: string = localTestEnvDefaults.GITHUB_WEBHOOK_SECRET,
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
          webhookSecret,
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

  it('rejects oversized webhook bodies before signature validation', async () => {
    applyLocalTestEnv();

    const response = await handler(
      buildHttpApiV2Event({
        method: 'POST',
        path: '/webhooks/github',
        headers: {
          'content-type': 'application/json',
          'content-length': '1000001',
        },
        body: '{}',
      }),
      createLambdaContext('local-oversized-body-request-id'),
    );
    const body = parseJsonBody(response);

    expect(response.statusCode).toBe(413);
    expect(body).toMatchObject({
      message: 'GitHub webhook request body is too large.',
      details: 'Webhook request bodies must be 1000000 bytes or smaller.',
      requestId: 'local-oversized-body-request-id',
    });
  });

  it('does not return internal error details when webhook processing fails after payload validation', async () => {
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
      details:
        'The webhook could not be processed. Use the requestId to inspect service logs.',
      requestId: 'local-processing-error-request-id',
    });
    expect(JSON.stringify(body)).not.toContain('Synthetic GitHub API failure');
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

  it('loads GitHub runtime secrets from SSM when direct env values are absent', async () => {
    applyLocalTestEnv({
      GITHUB_APP_ID: '',
      GITHUB_APP_INSTALLATION_ID: '',
      GITHUB_APP_PRIVATE_KEY: '',
      GITHUB_TOKEN: '',
      GITHUB_WEBHOOK_SECRET: '',
      GITHUB_APP_ID_SSM_PARAMETER_NAME: '/pr-concierge/test/github/app-id',
      GITHUB_APP_INSTALLATION_ID_SSM_PARAMETER_NAME:
        '/pr-concierge/test/github/app-installation-id',
      GITHUB_APP_PRIVATE_KEY_SSM_PARAMETER_NAME:
        '/pr-concierge/test/github/app-private-key',
      GITHUB_TOKEN_SSM_PARAMETER_NAME: '/pr-concierge/test/github/token',
      GITHUB_WEBHOOK_SECRET_SSM_PARAMETER_NAME:
        '/pr-concierge/test/github/webhook-secret',
    });

    const ssmParameterLoader = vi.fn(
      async (_awsRegion: string, parameterNames: string[]) =>
        new Map(
          parameterNames.map((parameterName) => {
            switch (parameterName) {
              case '/pr-concierge/test/github/webhook-secret':
                return [parameterName, 'ssm-test-webhook-secret'] as const;
              case '/pr-concierge/test/github/token':
                return [parameterName, 'local-test-github-token'] as const;
              case '/pr-concierge/test/github/app-id':
                return [parameterName, '123456'] as const;
              case '/pr-concierge/test/github/app-private-key':
                return [parameterName, localTestEnvDefaults.GITHUB_APP_PRIVATE_KEY] as const;
              case '/pr-concierge/test/github/app-installation-id':
                return [parameterName, '987654'] as const;
              default:
                throw new Error(`Unexpected SSM parameter request: ${parameterName}`);
            }
          }),
        ),
    );

    setSsmParameterLoaderForTests(ssmParameterLoader);

    const payload = buildSuccessfulWebhookPayload({
      body: 'This change proves that CVS is Rock.',
    });
    const { fetchMock, requests } = createGitHubApiFetchMock();

    vi.stubGlobal('fetch', fetchMock);

    const response = await runSignedWebhook(
      payload,
      'local-ssm-config-request-id',
      'ssm-test-webhook-secret',
    );
    const body = parseJsonBody(response);

    expect(response.statusCode).toBe(200);
    expect(body.summary).toContain('cvs phrase: pass');
    expect(ssmParameterLoader).toHaveBeenCalledTimes(1);
    expect(ssmParameterLoader).toHaveBeenCalledWith('us-east-1', [
      '/pr-concierge/test/github/webhook-secret',
      '/pr-concierge/test/github/token',
      '/pr-concierge/test/github/app-id',
      '/pr-concierge/test/github/app-private-key',
      '/pr-concierge/test/github/app-installation-id',
    ]);
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      'POST https://api.github.com/app/installations/987654/access_tokens',
      'POST https://api.github.com/repos/octo-org/pr-concierge/check-runs',
      'GET https://api.github.com/repos/octo-org/pr-concierge/pulls/42/files?per_page=100&page=1',
      'PATCH https://api.github.com/repos/octo-org/pr-concierge/check-runs/7001',
    ]);
    expect(requests[2]?.headers.get('authorization')).toBe(
      'Bearer local-test-github-token',
    );
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

    const installationTokenRequest = getRecordedRequest(requests, 0);
    const checkRunCreateRequest = getRecordedRequest(requests, 1);
    const filesLookupRequest = getRecordedRequest(requests, 2);
    const checkRunUpdateRequest = getRecordedRequest(requests, 3);

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
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      'POST https://api.github.com/app/installations/987654/access_tokens',
      'POST https://api.github.com/repos/octo-org/pr-concierge/check-runs',
      'GET https://api.github.com/repos/octo-org/pr-concierge/pulls/42/files?per_page=100&page=1',
      'PATCH https://api.github.com/repos/octo-org/pr-concierge/check-runs/7001',
    ]);
    expect(installationTokenRequest.headers.get('authorization')).toContain('.');
    expect(checkRunCreateRequest.headers.get('authorization')).toBe(
      'Bearer ghs_local_installation_token',
    );
    expect(checkRunCreateRequest.jsonBody).toMatchObject({
      name: 'pr-concierge',
      head_sha: '0123456789abcdef0123456789abcdef01234567',
      status: 'in_progress',
      external_id: 'delivery-42',
      output: {
        title: 'PR Concierge is evaluating this pull request',
        images: [
          {
            alt: 'PR Concierge branded check artwork',
            image_url: expectedCheckBrandingImageUrl,
          },
        ],
      },
    });
    expect(filesLookupRequest.headers.get('authorization')).toBe(
      'Bearer local-test-github-token',
    );
    expect(checkRunUpdateRequest.headers.get('authorization')).toBe(
      'Bearer ghs_local_installation_token',
    );
    expect(checkRunUpdateRequest.jsonBody).toMatchObject({
      name: 'pr-concierge',
      status: 'completed',
      conclusion: 'success',
      output: {
        title: 'PR Concierge passed',
        images: [
          {
            alt: 'PR Concierge branded check artwork',
            image_url: expectedCheckBrandingImageUrl,
          },
        ],
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
    const checkRunUpdateRequest = getRecordedRequest(requests, requests.length - 1);

    expect(response.statusCode).toBe(200);
    expect(body.summary).toContain('cvs phrase: fail');
    expect(body.checks).toContainEqual({
      name: 'cvs phrase',
      status: 'fail',
      details:
        'PR text says "CVS is not Rock". Remove the opposite phrase or replace it with "CVS is Rock".',
    });
    expect(checkRunUpdateRequest.jsonBody).toMatchObject({
      conclusion: 'failure',
      output: {
        title: 'PR Concierge found issues',
      },
    });
    expect(checkRunUpdateRequest.jsonBody?.output).toMatchObject({
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
    const checkRunUpdateRequest = getRecordedRequest(requests, requests.length - 1);

    expect(response.statusCode).toBe(200);
    expect(body.summary).toContain('cvs phrase: skip');
    expect(body.checks).toContainEqual({
      name: 'cvs phrase',
      status: 'skip',
      details: 'PR text does not mention either CVS phrase.',
    });
    expect(checkRunUpdateRequest.jsonBody).toMatchObject({
      conclusion: 'success',
      output: {
        title: 'PR Concierge passed',
      },
    });
  });
});
