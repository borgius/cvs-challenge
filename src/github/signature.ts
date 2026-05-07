import { createHmac, timingSafeEqual } from 'node:crypto';

const signaturePrefix = 'sha256=';

export const isValidGitHubSignature = (
  rawBody: string,
  signatureHeader: string | undefined,
  webhookSecret: string,
): boolean => {
  if (!signatureHeader?.startsWith(signaturePrefix)) {
    return false;
  }

  const receivedSignature = signatureHeader.slice(signaturePrefix.length);
  const expectedSignature = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

  if (receivedSignature.length !== expectedSignature.length) {
    return false;
  }

  try {
    return timingSafeEqual(
      Buffer.from(receivedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex'),
    );
  } catch {
    return false;
  }
};
