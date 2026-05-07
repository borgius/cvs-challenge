import { describe, expect, it } from 'vitest';

import { resolveDeployedUrl } from '../helpers/loadDeploymentSummary.ts';

describe('deployed health integration', () => {
  it('returns the deployed health payload', async () => {
    const response = await fetch(resolveDeployedUrl('healthUrl'));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      service: 'pr-concierge',
      status: 'ok',
    });
    expect(typeof body.requestId).toBe('string');
    expect(typeof body.timestamp).toBe('string');
  });
});
