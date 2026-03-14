import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../common/config/app-config.service';
import { CallInitiationRequest, TelephonyAdapter, TelephonyCallSession } from './telephony-adapter.interface';

@Injectable()
export class ExotelTelephonyAdapter implements TelephonyAdapter {
  constructor(private readonly configService: AppConfigService) {}

  async initiateCall(req: CallInitiationRequest): Promise<TelephonyCallSession> {
    const telephonyConfig = this.configService.getConfig().telephony;
    const config = telephonyConfig.exotel;
    const sid = process.env[config.accountSidEnvVar] ?? process.env.EXOTEL_ACCOUNT_SID;
    const token = process.env[config.authTokenEnvVar] ?? process.env.EXOTEL_AUTH_TOKEN;

    if (!sid || !token) {
      throw new Error('Exotel credentials are not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const form = new URLSearchParams({
        From: req.fromNumber,
        To: req.toNumber,
        CallerId: telephonyConfig.fromNumber,
        Url: req.callbackUrl,
      });

      const response = await fetch(`https://${config.subdomain}/v1/Accounts/${sid}/Calls/connect`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Exotel call request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as { Call?: { Sid?: string; Status?: string } };
      const status = payload.Call?.Status?.toLowerCase() ?? 'in-progress';

      return {
        providerCallId: payload.Call?.Sid ?? 'exotel-unknown',
        status: status === 'ringing' ? 'ringing' : 'answered',
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