import { ExotelTelephonyAdapter } from 'src/adapters/telephony/exotel-telephony-adapter';
import { TwilioTelephonyAdapter } from 'src/adapters/telephony/twilio-telephony-adapter';
import { AppConfigService } from 'src/common/config/app-config.service';
import { testConfig } from './test-helpers';

describe('Telephony adapters', () => {
  const originalTwilioSid = process.env.TWILIO_ACCOUNT_SID;
  const originalTwilioToken = process.env.TWILIO_AUTH_TOKEN;
  const originalExotelSid = process.env.EXOTEL_ACCOUNT_SID;
  const originalExotelToken = process.env.EXOTEL_AUTH_TOKEN;

  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = 'twilio-sid';
    process.env.TWILIO_AUTH_TOKEN = 'twilio-token';
    process.env.EXOTEL_ACCOUNT_SID = 'exotel-sid';
    process.env.EXOTEL_AUTH_TOKEN = 'exotel-token';

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
    } as Response);
  });

  afterEach(() => {
    if (originalTwilioSid === undefined) {
      delete process.env.TWILIO_ACCOUNT_SID;
    } else {
      process.env.TWILIO_ACCOUNT_SID = originalTwilioSid;
    }

    if (originalTwilioToken === undefined) {
      delete process.env.TWILIO_AUTH_TOKEN;
    } else {
      process.env.TWILIO_AUTH_TOKEN = originalTwilioToken;
    }

    if (originalExotelSid === undefined) {
      delete process.env.EXOTEL_ACCOUNT_SID;
    } else {
      process.env.EXOTEL_ACCOUNT_SID = originalExotelSid;
    }

    if (originalExotelToken === undefined) {
      delete process.env.EXOTEL_AUTH_TOKEN;
    } else {
      process.env.EXOTEL_AUTH_TOKEN = originalExotelToken;
    }

    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('Twilio adapter sends hangup request', async () => {
    const configService = { getConfig: () => testConfig } as AppConfigService;
    const adapter = new TwilioTelephonyAdapter(configService);

    await adapter.hangUp('CA123');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/Calls/CA123.json'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('Twilio adapter sends stream audio request', async () => {
    const configService = { getConfig: () => testConfig } as AppConfigService;
    const adapter = new TwilioTelephonyAdapter(configService);

    await adapter.streamAudio('CA456', Buffer.from('hello'));

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/Calls/CA456/UserDefinedMessages.json'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('Exotel adapter sends hangup request', async () => {
    const configService = { getConfig: () => testConfig } as AppConfigService;
    const adapter = new ExotelTelephonyAdapter(configService);

    await adapter.hangUp('EXO123');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/Calls/EXO123'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('Exotel adapter sends stream audio request', async () => {
    const configService = { getConfig: () => testConfig } as AppConfigService;
    const adapter = new ExotelTelephonyAdapter(configService);

    await adapter.streamAudio('EXO456', Buffer.from('hello'));

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/Calls/EXO456/stream'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
