import { createHmac } from 'node:crypto';

const signaturePrefix = 'sha256=';

export const createGitHubSignature = (
  rawBody: string,
  webhookSecret: string,
): string =>
  `${signaturePrefix}${createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex')}`;
