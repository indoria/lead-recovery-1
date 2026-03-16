import { buildTwilioSignature, isValidTwilioSignature } from 'src/telephony/twilio-signature';

describe('Twilio signature validation', () => {
  it('validates a correctly signed payload', () => {
    const url = 'https://example.test/api/telephony/events';
    const params = {
      CallSid: 'CA123',
      CallStatus: 'ringing',
      To: '+919000000001',
    };
    const authToken = 'twilio-secret';

    const signature = buildTwilioSignature(url, params, authToken);

    expect(
      isValidTwilioSignature({
        signature,
        url,
        params,
        authToken,
      }),
    ).toBe(true);
  });

  it('rejects invalid signatures', () => {
    expect(
      isValidTwilioSignature({
        signature: 'invalid-signature',
        url: 'https://example.test/api/telephony/events',
        params: { CallSid: 'CA123' },
        authToken: 'twilio-secret',
      }),
    ).toBe(false);
  });
});
