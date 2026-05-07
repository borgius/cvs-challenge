import { Hono } from 'hono';
import type { LambdaContext, LambdaEvent } from 'hono/aws-lambda';
import { logger as honoLogger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { requestId, type RequestIdVariables } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';

import { loadAppConfig } from './config/env.ts';
import { fetchPullRequestFiles } from './github/client.ts';
import { isValidGitHubSignature } from './github/signature.ts';
import { evaluatePullRequest } from './services/evaluatePullRequest.ts';
import { createEvaluationRepository } from './storage/evaluationRepository.ts';
import { supportedPullRequestActions } from './types/github.ts';
import { isPullRequestPayload, isSupportedPullRequestAction } from './utils/guards.ts';
import { accessLogger, logger } from './utils/logger.ts';
import { buildRawEventKey } from './utils/storageKeys.ts';

type AppBindings = {
  event: LambdaEvent | undefined;
  lambdaContext: LambdaContext | undefined;
};

type AppEnv = {
  Bindings: AppBindings;
  Variables: RequestIdVariables;
};


export const app = new Hono<AppEnv>();

app.use(
  '*',
  requestId({
    generator: (c) => c.env.lambdaContext?.awsRequestId ?? crypto.randomUUID(),
  }),
);
app.use('*', honoLogger(accessLogger));
app.use('*', secureHeaders());
app.use('*', prettyJSON());

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'pr-concierge',
    requestId: c.get('requestId'),
    timestamp: new Date().toISOString(),
  }),
);

app.post('/webhooks/github', async (c) => {
  const requestId = c.get('requestId');
  const rawBody = await c.req.text();

  if (!rawBody) {
    return c.json(
      {
        message: 'GitHub webhook requests must include a body.',
        requestId,
      },
      400,
    );
  }

  try {
    const config = loadAppConfig();
    const repository = createEvaluationRepository(config);
    const signatureHeader = c.req.header('x-hub-signature-256');

    if (!isValidGitHubSignature(rawBody, signatureHeader, config.githubWebhookSecret)) {
      return c.json(
        {
          message: 'Invalid GitHub signature.',
          requestId,
        },
        401,
      );
    }

    let payload: unknown;

    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      return c.json(
        {
          message: 'GitHub webhook payload must be valid JSON.',
          requestId,
        },
        400,
      );
    }

    if (!isPullRequestPayload(payload)) {
      return c.json(
        {
          message: 'Unsupported GitHub pull request payload.',
          requestId,
        },
        400,
      );
    }

    if (!isSupportedPullRequestAction(payload.action)) {
      return c.json(
        {
          message: `Ignoring pull request action '${payload.action}'.`,
          requestId,
          supportedActions: supportedPullRequestActions,
        },
        202,
      );
    }

    const pullNumber = payload.number ?? payload.pull_request.number;

    if (!pullNumber) {
      return c.json(
        {
          message: 'Pull request number is missing from the webhook payload.',
          requestId,
        },
        400,
      );
    }

    const repositoryFullName = payload.repository.full_name;
    const labels = (payload.pull_request.labels ?? []).map((label) => label.name);
    const changedFiles = (await fetchPullRequestFiles(
      repositoryFullName,
      pullNumber,
      config.githubToken,
    )).map((file) => file.filename);
    const githubDeliveryId = c.req.header('x-github-delivery');
    const rawEventS3Key =
      config.enableRawEventArchive && config.rawEventBucketName
        ? buildRawEventKey(repositoryFullName, pullNumber, githubDeliveryId)
        : undefined;

    const evaluation = await evaluatePullRequest({
      action: payload.action,
      repositoryFullName,
      pullNumber,
      branchName: payload.pull_request.head.ref,
      baseBranch: payload.pull_request.base.ref,
      headSha: payload.pull_request.head.sha,
      changedFiles,
      labels,
      requiredLabels: config.requiredLabels,
      githubDeliveryId,
      rawEventS3Key,
      repository,
    });

    logger.info('Pull request evaluation completed', {
      requestId,
      repositoryFullName,
      pullRequestNumber: pullNumber,
      action: payload.action,
      riskLevel: evaluation.riskAssessment.riskLevel,
      changedFileCount: changedFiles.length,
    });

    return c.json({
      message: 'Pull request evaluated successfully.',
      requestId,
      summary: evaluation.summary,
      riskLevel: evaluation.riskAssessment.riskLevel,
      changedAreas: evaluation.riskAssessment.changedAreas,
      checks: evaluation.checks,
      recordKey: {
        pk: evaluation.record.pk,
        sk: evaluation.record.sk,
      },
    });
  } catch (error) {
    logger.error('Failed to process GitHub webhook', { requestId, error: error instanceof Error ? error : new Error(String(error)) });

    return c.json(
      {
        message: 'Failed to process GitHub webhook.',
        requestId,
      },
      500,
    );
  }
});

app.notFound((c) =>
  c.json(
    {
      message: 'Route not found.',
      requestId: c.get('requestId'),
    },
    404,
  ),
);