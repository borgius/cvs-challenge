import { generateKeyPairSync } from 'node:crypto';
import type { Context } from 'aws-lambda';
import { vi } from 'vitest';

import { resetAppConfigCacheForTests } from '../../../src/config/env.ts';
import { resetGitHubAuthCacheForTests } from '../../../src/github/auth.ts';

const { privateKey: localTestGitHubAppPrivateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    format: 'pem',
    type: 'spki',
  },
  privateKeyEncoding: {
    format: 'pem',
    type: 'pkcs8',
  },
});

export const localTestEnvDefaults = {
  AWS_REGION: 'us-east-1',
  EVALUATIONS_TABLE_NAME: 'pr-concierge-evaluations-test',
  EVALUATION_REPOSITORY: 'console',
  ENABLE_RAW_EVENT_ARCHIVE: 'false',
  GITHUB_APP_ID: '123456',
  GITHUB_APP_INSTALLATION_ID: '987654',
  GITHUB_APP_PRIVATE_KEY: localTestGitHubAppPrivateKey,
  GITHUB_TOKEN: 'local-test-github-token',
  GITHUB_WEBHOOK_SECRET: 'local-test-webhook-secret',
  REQUIRED_LABELS: '',
} as const;

export const applyLocalTestEnv = (
  overrides: Record<string, string> = {},
): void => {
  const resolvedEnv = {
    ...localTestEnvDefaults,
    ...overrides,
  };

  for (const [name, value] of Object.entries(resolvedEnv)) {
    vi.stubEnv(name, value);
  }

  resetAppConfigCacheForTests();
  resetGitHubAuthCacheForTests();
};

export const createLambdaContext = (
  awsRequestId = 'local-lambda-request-id',
): Context => ({
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'pr-concierge-test',
  functionVersion: '$LATEST',
  invokedFunctionArn:
    'arn:aws:lambda:us-east-1:123456789012:function:pr-concierge-test',
  memoryLimitInMB: '256',
  awsRequestId,
  logGroupName: '/aws/lambda/pr-concierge-test',
  logStreamName: '2026/05/07/[$LATEST]local-test-stream',
  getRemainingTimeInMillis: () => 30_000,
  done: (_error?: Error, _result?: unknown): void => undefined,
  fail: (_error: Error | string): void => undefined,
  succeed: (_messageOrObject: unknown): void => undefined,
});
