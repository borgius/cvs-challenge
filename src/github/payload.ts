import { createRequire } from 'node:module';

import type { AnySchemaObject, ErrorObject } from 'ajv';
import type { PullRequestEvent } from '@octokit/webhooks-types';

interface GitHubWebhookSchema {
  $schema?: string;
  definitions: Record<string, unknown>;
}

type JsonObject = Record<string, unknown>;
type AjvModule = typeof import('ajv');
type AjvFormatsModule = typeof import('ajv-formats');
const maxValidationErrorsToReport = 20;

export interface PullRequestPayloadValidationError {
  instancePath: string;
  keyword: string;
  message: string;
  params: ErrorObject['params'];
}

export type PullRequestPayloadValidationResult =
  | {
      isValid: true;
      payload: PullRequestEvent;
    }
  | {
      isValid: false;
      errors: PullRequestPayloadValidationError[];
    };

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const formatValidationErrors = (
  errors: ErrorObject[] | null | undefined,
): PullRequestPayloadValidationError[] =>
  (errors ?? []).slice(0, maxValidationErrorsToReport).map((error) => ({
    instancePath: error.instancePath || '/',
    keyword: error.keyword,
    message: error.message ?? 'Schema validation failed.',
    params: error.params,
  }));

const require = createRequire(import.meta.url);
const { default: Ajv } = require('ajv') as AjvModule;
const { default: addFormats } = require('ajv-formats') as AjvFormatsModule;
const githubWebhookSchema = require('@octokit/webhooks-schemas') as GitHubWebhookSchema;
const pullRequestEventSchemaDefinition =
  githubWebhookSchema.definitions['pull_request_event'];

if (!isJsonObject(pullRequestEventSchemaDefinition)) {
  throw new Error(
    'The @octokit/webhooks-schemas package does not expose a pull_request_event schema definition.',
  );
}

const ajv = new Ajv({ allErrors: true, strict: true });

addFormats(ajv);
ajv.addKeyword('tsAdditionalProperties');

const pullRequestEventSchema = {
  $schema: githubWebhookSchema.$schema,
  ...pullRequestEventSchemaDefinition,
  definitions: githubWebhookSchema.definitions,
} as AnySchemaObject;

const validatePullRequestEventSchema = ajv.compile<PullRequestEvent>(
  pullRequestEventSchema,
);

export const validatePullRequestPayload = (
  value: unknown,
): PullRequestPayloadValidationResult => {
  if (validatePullRequestEventSchema(value)) {
    return {
      isValid: true,
      payload: value as PullRequestEvent,
    };
  }

  return {
    isValid: false,
    errors: formatValidationErrors(validatePullRequestEventSchema.errors),
  };
};
