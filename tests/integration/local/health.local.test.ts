import { describe, expect, it } from 'vitest';

import { handler } from '../../../src/index.ts';
import { buildHttpApiV2Event } from '../helpers/buildHttpApiV2Event.ts';
import { applyLocalTestEnv, createLambdaContext } from '../helpers/testEnv.ts';

type LambdaResponse = Awaited<ReturnType<typeof handler>>;

const parseJsonBody = (response: LambdaResponse): Record<string, unknown> => {
  expect(response.body).toBeDefined();

  return JSON.parse(response.body ?? '{}') as Record<string, unknown>;
};

describe('local Lambda health integration', () => {
  it('returns the health payload through the exported Lambda handler', async () => {
    applyLocalTestEnv();

    const response = await handler(
      buildHttpApiV2Event({
        method: 'GET',
        path: '/health',
      }),
      createLambdaContext('local-health-request-id'),
    );
    const body = parseJsonBody(response);

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      requestId: 'local-health-request-id',
      service: 'pr-concierge',
      status: 'ok',
    });
    expect(typeof body.timestamp).toBe('string');
  });
});
