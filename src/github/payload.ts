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
const githubRepositoryHasPullRequestsPropertyName = 'has_pull_requests';
const githubRepositoryPullRequestCreationPolicyPropertyName =
  'pull_request_creation_policy';
const githubRepositoryCustomPropertiesPropertyName = 'custom_properties';
const githubUserViewTypeSchema = {
  type: ['string', 'null'],
} as const;
const githubRepositoryHasPullRequestsSchema = {
  type: 'boolean',
} as const;
const githubRepositoryPullRequestCreationPolicySchema = {
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

const patchSchemaObjectDefinition = (
  definition: unknown,
  options: {
    properties?: Record<string, unknown>;
    optionalPropertyNames?: string[];
  },
): void => {
  if (!isJsonObject(definition)) {
    return;
  }

  const existingProperties = isJsonObject(definition.properties)
    ? definition.properties
    : {};

  if (options.properties) {
    definition.properties = {
      ...existingProperties,
      ...options.properties,
    };
  }

  const optionalPropertyNames = options.optionalPropertyNames;

  if (optionalPropertyNames && Array.isArray(definition.required)) {
    definition.required = definition.required.filter(
      (requiredProperty): requiredProperty is string =>
        typeof requiredProperty === 'string' &&
        !optionalPropertyNames.includes(requiredProperty),
    );
  }
};

const patchGitHubWebhookSchemaForCurrentPullRequestPayloads = (
  schema: GitHubWebhookSchema,
): GitHubWebhookSchema => {
  const patchedSchema = cloneJsonValue(schema);

  // GitHub pull_request webhook payloads now include `user_view_type` on user objects,
  // but the latest published @octokit/webhooks-schemas package does not model it yet.
  patchSchemaObjectDefinition(patchedSchema.definitions['user'], {
    properties: {
      [githubUserViewTypePropertyName]: githubUserViewTypeSchema,
    },
  });

  // The published schema also drifts from current repository payloads: `custom_properties`
  // is not always present, while fields like `has_pull_requests` and
  // `pull_request_creation_policy` can now appear.
  patchSchemaObjectDefinition(patchedSchema.definitions['repository'], {
    properties: {
      [githubRepositoryHasPullRequestsPropertyName]: githubRepositoryHasPullRequestsSchema,
      [githubRepositoryPullRequestCreationPolicyPropertyName]:
        githubRepositoryPullRequestCreationPolicySchema,
    },
    optionalPropertyNames: [githubRepositoryCustomPropertiesPropertyName],
  });

  patchSchemaObjectDefinition(patchedSchema.definitions['repository-lite'], {
    properties: {
      [githubRepositoryHasPullRequestsPropertyName]: githubRepositoryHasPullRequestsSchema,
      [githubRepositoryPullRequestCreationPolicyPropertyName]:
        githubRepositoryPullRequestCreationPolicySchema,
    },
    optionalPropertyNames: [githubRepositoryCustomPropertiesPropertyName],
  });

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
