import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../common/config/app-config.service';
import { CallInitiationRequest, TelephonyAdapter, TelephonyCallSession } from './telephony-adapter.interface';

@Injectable()
export class TwilioTelephonyAdapter implements TelephonyAdapter {
  constructor(private readonly configService: AppConfigService) {}

  async initiateCall(req: CallInitiationRequest): Promise<TelephonyCallSession> {
    const config = this.configService.getConfig().telephony.twilio;
    const accountSid = process.env[config.accountSidEnvVar] ?? process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env[config.authTokenEnvVar] ?? process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials are not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const form = new URLSearchParams({
        To: req.toNumber,
        From: req.fromNumber,
        Url: req.callbackUrl,
        StatusCallback: req.callbackUrl,
      });

      const response = await fetch(`${config.baseUrl}/2010-04-01/Accounts/${accountSid}/Calls.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Twilio call request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as { sid?: string; status?: string };
      return {
        providerCallId: payload.sid ?? 'twilio-unknown',
        status: payload.status === 'ringing' ? 'ringing' : 'answered',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async hangUp(providerCallId: string): Promise<void> {
    void providerCallId;
  }

  async streamAudio(providerCallId: string, audio: Buffer): Promise<void> {
    void providerCallId;
    void audio;
  }
}