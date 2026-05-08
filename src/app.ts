import { Hono } from 'hono';
import type { LambdaContext, LambdaEvent } from 'hono/aws-lambda';
import { logger as honoLogger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { requestId, type RequestIdVariables } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';

import { loadAppConfig } from './config/env.ts';
import {
  getGitHubChecksWriteToken,
  getGitHubRepositoryReadToken,
} from './github/auth.ts';
import { fetchPullRequestFiles } from './github/client.ts';
import {
  buildCompletedGitHubCheckOutput,
  buildGitHubCheckBrandingImageUrl,
  buildFailedGitHubCheckOutput,
  buildGitHubCheckExternalId,
  completeGitHubCheckRun,
  createGitHubCheckRun,
  deriveGitHubCheckConclusion,
} from './github/checks.ts';
import {
  validatePullRequestPayload,
  type PullRequestPayloadValidationError,
} from './github/payload.ts';
import { parseGitHubRepositoryFullName } from './github/repository.ts';
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

type ErrorResponseDetails = string | PullRequestPayloadValidationError[];

const maxWebhookBodyBytes = 1_000_000;
const internalWebhookErrorDetails =
  'The webhook could not be processed. Use the requestId to inspect service logs.';

const parseContentLength = (contentLengthHeader: string | undefined): number | undefined => {
  if (!contentLengthHeader) {
    return undefined;
  }

  const parsedContentLength = Number.parseInt(contentLengthHeader, 10);

  return Number.isInteger(parsedContentLength) && parsedContentLength >= 0
    ? parsedContentLength
    : undefined;
};

const buildErrorResponseBody = (
  message: string,
  requestId: string,
  details: ErrorResponseDetails,
) => ({
  message,
  details,
  requestId,
});


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
  const contentLength = parseContentLength(c.req.header('content-length'));

  if (contentLength !== undefined && contentLength > maxWebhookBodyBytes) {
    return c.json(
      buildErrorResponseBody(
        'GitHub webhook request body is too large.',
        requestId,
        `Webhook request bodies must be ${maxWebhookBodyBytes} bytes or smaller.`,
      ),
      413,
    );
  }

  const rawBody = await c.req.text();

  if (!rawBody) {
    return c.json(
      buildErrorResponseBody(
        'GitHub webhook requests must include a body.',
        requestId,
        'The webhook request body was empty.',
      ),
      400,
    );
  }

  if (Buffer.byteLength(rawBody, 'utf8') > maxWebhookBodyBytes) {
    return c.json(
      buildErrorResponseBody(
        'GitHub webhook request body is too large.',
        requestId,
        `Webhook request bodies must be ${maxWebhookBodyBytes} bytes or smaller.`,
      ),
      413,
    );
  }

  try {
    const config = await loadAppConfig();
    const signatureHeader = c.req.header('x-hub-signature-256');

    if (!isValidGitHubSignature(rawBody, signatureHeader, config.githubWebhookSecret)) {
      return c.json(
        buildErrorResponseBody(
          'Invalid GitHub signature.',
          requestId,
          'The x-hub-signature-256 header did not match the request body and configured webhook secret.',
        ),
        401,
      );
    }

    let parsedPayload: unknown;

    try {
      parsedPayload = JSON.parse(rawBody) as unknown;
    } catch {
      return c.json(
        buildErrorResponseBody(
          'GitHub webhook payload must be valid JSON.',
          requestId,
          'The webhook request body could not be parsed as JSON.',
        ),
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
        buildErrorResponseBody(
          'Invalid GitHub pull request payload.',
          requestId,
          payloadValidationResult.errors,
        ),
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
        buildErrorResponseBody(
          'Pull request number is missing from the webhook payload.',
          requestId,
          'Expected number or pull_request.number in the webhook payload.',
        ),
        400,
      );
    }

    const repositoryFullName = payload.repository.full_name;

    try {
      parseGitHubRepositoryFullName(repositoryFullName);
    } catch {
      return c.json(
        buildErrorResponseBody(
          'Invalid GitHub repository name.',
          requestId,
          'Expected repository.full_name in owner/repo format with GitHub-safe characters.',
        ),
        400,
      );
    }

    const headSha = payload.pull_request.head.sha;

    if (!headSha) {
      return c.json(
        buildErrorResponseBody(
          'Pull request head SHA is missing from the webhook payload.',
          requestId,
          'Expected pull_request.head.sha in the webhook payload.',
        ),
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
    const checkBrandingImageUrl = payload.repository.private
      ? undefined
      : buildGitHubCheckBrandingImageUrl(
          payload.pull_request.head.repo?.full_name ?? repositoryFullName,
          headSha,
        );
    let checkRunId: number | undefined;
    let githubChecksToken: string | undefined;

    try {
      githubChecksToken = await getGitHubChecksWriteToken(
        config,
        repositoryFullName,
      );

      const createdCheckRun = await createGitHubCheckRun({
        repositoryFullName,
        githubToken: githubChecksToken,
        headSha,
        externalId: checkRunExternalId,
        ...(checkBrandingImageUrl === undefined
          ? {}
          : { brandingImageUrl: checkBrandingImageUrl }),
      });

      checkRunId = createdCheckRun.id;
      const githubRepositoryReadToken = await getGitHubRepositoryReadToken(
        config,
        repositoryFullName,
      );

      const changedFiles = (await fetchPullRequestFiles(
        repositoryFullName,
        pullNumber,
        githubRepositoryReadToken,
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
        githubToken: githubChecksToken,
        checkRunId,
        conclusion: checkConclusion,
        output: buildCompletedGitHubCheckOutput(evaluation, checkBrandingImageUrl),
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
      if (checkRunId !== undefined && githubChecksToken !== undefined) {
        try {
          await completeGitHubCheckRun({
            repositoryFullName,
            githubToken: githubChecksToken,
            checkRunId,
            conclusion: 'failure',
            output: buildFailedGitHubCheckOutput(requestId, checkBrandingImageUrl),
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
      buildErrorResponseBody(
        'Failed to process GitHub webhook.',
        requestId,
        internalWebhookErrorDetails,
      ),
      500,
    );
  }
});

app.notFound((c) =>
  c.json(
    buildErrorResponseBody(
      'Route not found.',
      c.get('requestId'),
      `No route matches ${c.req.method} ${c.req.path}.`,
    ),
    404,
  ),
);