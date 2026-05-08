import { Hono } from 'hono';
import type { LambdaContext, LambdaEvent } from 'hono/aws-lambda';
import { logger as honoLogger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { requestId, type RequestIdVariables } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';

import { loadAppConfig } from './config/env.ts';
import { fetchPullRequestFiles } from './github/client.ts';
import {
  buildCompletedGitHubCheckOutput,
  buildFailedGitHubCheckOutput,
  buildGitHubCheckExternalId,
  completeGitHubCheckRun,
  createGitHubCheckRun,
  deriveGitHubCheckConclusion,
} from './github/checks.ts';
import { validatePullRequestPayload } from './github/payload.ts';
import { isValidGitHubSignature } from './github/signature.ts';
import { evaluatePullRequest } from './services/evaluatePullRequest.ts';
import { createEvaluationRepository } from './storage/evaluationRepository.ts';
import { supportedPullRequestActions } from './types/github.ts';
import { isSupportedPullRequestAction } from './utils/guards.ts';
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

    let parsedPayload: unknown;

    try {
      parsedPayload = JSON.parse(rawBody) as unknown;
    } catch {
      return c.json(
        {
          message: 'GitHub webhook payload must be valid JSON.',
          requestId,
        },
        400,
      );
    }

    const payloadValidationResult = validatePullRequestPayload(parsedPayload);

    if (!payloadValidationResult.isValid) {
      logger.warn('GitHub webhook payload failed pull request schema validation', {
        requestId,
        validationErrors: payloadValidationResult.errors,
      });

      return c.json(
        {
          message: 'Invalid GitHub pull request payload.',
          requestId,
        },
        400,
      );
    }

    const payload = payloadValidationResult.payload;

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
    const headSha = payload.pull_request.head.sha;

    if (!headSha) {
      return c.json(
        {
          message: 'Pull request head SHA is missing from the webhook payload.',
          requestId,
        },
        400,
      );
    }

    const labels = (payload.pull_request.labels ?? []).map((label) => label.name);
    const githubDeliveryId = c.req.header('x-github-delivery');
    const rawEventS3Key =
      config.enableRawEventArchive && config.rawEventBucketName
        ? buildRawEventKey(repositoryFullName, pullNumber, githubDeliveryId)
        : undefined;
    const repository = createEvaluationRepository(config);
    const checkRunExternalId = buildGitHubCheckExternalId(
      repositoryFullName,
      pullNumber,
      headSha,
      githubDeliveryId,
    );
    let checkRunId: number | undefined;

    try {
      const createdCheckRun = await createGitHubCheckRun({
        repositoryFullName,
        githubToken: config.githubToken,
        headSha,
        externalId: checkRunExternalId,
      });

      checkRunId = createdCheckRun.id;

      const changedFiles = (await fetchPullRequestFiles(
        repositoryFullName,
        pullNumber,
        config.githubToken,
      )).map((file) => file.filename);
      const evaluation = await evaluatePullRequest({
        action: payload.action,
        repositoryFullName,
        pullNumber,
        pullRequestTitle: payload.pull_request.title,
        pullRequestBody: payload.pull_request.body,
        branchName: payload.pull_request.head.ref,
        baseBranch: payload.pull_request.base.ref,
        headSha,
        changedFiles,
        labels,
        requiredLabels: config.requiredLabels,
        githubDeliveryId,
        rawEventS3Key,
        repository,
      });
      const checkConclusion = deriveGitHubCheckConclusion(evaluation);

      await completeGitHubCheckRun({
        repositoryFullName,
        githubToken: config.githubToken,
        checkRunId,
        conclusion: checkConclusion,
        output: buildCompletedGitHubCheckOutput(evaluation),
      });

      logger.info('Pull request evaluation completed', {
        requestId,
        repositoryFullName,
        pullRequestNumber: pullNumber,
        action: payload.action,
        checkRunId,
        checkConclusion,
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
      if (checkRunId !== undefined) {
        try {
          await completeGitHubCheckRun({
            repositoryFullName,
            githubToken: config.githubToken,
            checkRunId,
            conclusion: 'failure',
            output: buildFailedGitHubCheckOutput(requestId),
          });
        } catch (checkRunError) {
          logger.error('Failed to complete GitHub check run after webhook error', {
            requestId,
            repositoryFullName,
            pullRequestNumber: pullNumber,
            checkRunId,
            error:
              checkRunError instanceof Error
                ? checkRunError
                : new Error(String(checkRunError)),
          });
        }
      }

      throw error;
    }
  } catch (error) {
    logger.error('Failed to process GitHub webhook', {
      requestId,
      error: error instanceof Error ? error : new Error(String(error)),
    });

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