import { createHmac, timingSafeEqual } from 'crypto';

function normalizeParams(params: Record<string, unknown>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${key}${String(params[key] ?? '')}`)
    .join('');
}

export function buildTwilioSignature(url: string, params: Record<string, unknown>, authToken: string): string {
  const payload = `${url}${normalizeParams(params)}`;
  return createHmac('sha1', authToken).update(payload).digest('base64');
}

export function isValidTwilioSignature(options: {
  signature: string | undefined;
  url: string;
  params: Record<string, unknown>;
  authToken: string;
}): boolean {
  const { signature, url, params, authToken } = options;
  if (!signature) {
    return false;
  }

  const expected = buildTwilioSignature(url, params, authToken);
  const actualBuffer = Buffer.from(signature.trim());
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}
