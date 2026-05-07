import type { LambdaEvent } from 'hono/aws-lambda';

export interface BuildHttpApiV2EventInput {
  method: 'GET' | 'POST';
  path: string;
  headers?: Record<string, string>;
  body?: string;
  queryStringParameters?: Record<string, string>;
  requestId?: string;
}

const normalizeHeaders = (
  headers: Record<string, string> | undefined,
): Record<string, string> => {
  if (!headers) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
};

export const buildHttpApiV2Event = (
  input: BuildHttpApiV2EventInput,
): LambdaEvent => {
  const rawQueryString = new URLSearchParams(
    input.queryStringParameters ?? {},
  ).toString();
  const routeKey = `${input.method} ${input.path}`;
  const event: LambdaEvent = {
    version: '2.0',
    routeKey,
    rawPath: input.path,
    rawQueryString,
    headers: normalizeHeaders(input.headers),
    body: input.body ?? null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'local-test-api',
      authentication: null,
      authorizer: {},
      domainName: 'local.test',
      domainPrefix: 'local',
      http: {
        method: input.method,
        path: input.path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: input.requestId ?? 'local-request-context-id',
      routeKey,
      stage: '$default',
      time: '07/May/2026:00:00:00 +0000',
      timeEpoch: 1778112000000,
    },
    isBase64Encoded: false,
  };

  if (
    input.queryStringParameters &&
    Object.keys(input.queryStringParameters).length > 0
  ) {
    event.queryStringParameters = input.queryStringParameters;
  }

  return event;
};
