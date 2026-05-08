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
const githubUserViewTypePropertyName = 'user_view_type';
const githubUserViewTypeSchema = {
  type: ['string', 'null'],
} as const;

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

const cloneJsonValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const patchGitHubWebhookSchemaForCurrentPullRequestPayloads = (
  schema: GitHubWebhookSchema,
): GitHubWebhookSchema => {
  const patchedSchema = cloneJsonValue(schema);
  const userDefinition = patchedSchema.definitions['user'];

  if (!isJsonObject(userDefinition)) {
    return patchedSchema;
  }

  const userProperties = isJsonObject(userDefinition.properties)
    ? userDefinition.properties
    : {};

  // GitHub pull_request webhook payloads now include `user_view_type` on user objects,
  // but the latest published @octokit/webhooks-schemas package does not model it yet.
  userDefinition.properties = {
    ...userProperties,
    [githubUserViewTypePropertyName]: githubUserViewTypeSchema,
  };

  return patchedSchema;
};

const require = createRequire(import.meta.url);
const { default: Ajv } = require('ajv') as AjvModule;
const { default: addFormats } = require('ajv-formats') as AjvFormatsModule;
const githubWebhookSchema = patchGitHubWebhookSchemaForCurrentPullRequestPayloads(
  require('@octokit/webhooks-schemas') as GitHubWebhookSchema,
);
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
