import { Body, Controller, Headers, Post, Req, UnauthorizedException } from '@nestjs/common';
import { AppConfigService } from '../common/config/app-config.service';
import { isValidTwilioSignature } from './twilio-signature';

type RequestLike = {
  protocol?: string;
  headers?: Record<string, string | string[] | undefined>;
  get?: (header: string) => string | undefined;
  originalUrl?: string;
  url?: string;
};

@Controller('telephony')
export class TelephonyEventsController {
  constructor(private readonly configService: AppConfigService) {}

  @Post('events')
  handleEvents(
    @Body() payload: Record<string, unknown>,
    @Headers('x-twilio-signature') twilioSignature: string | undefined,
    @Req() request: RequestLike,
  ): { ok: true; provider: 'twilio' | 'exotel' | 'mock' | 'unknown'; event: string } {
    const telephony = this.configService.getConfig().telephony;

    if (telephony.provider === 'twilio') {
      const authToken = process.env[telephony.twilio.authTokenEnvVar] ?? process.env.TWILIO_AUTH_TOKEN;
      if (!authToken) {
        throw new UnauthorizedException('Twilio auth token is not configured for webhook validation');
      }

      const url = this.resolveRequestUrl(request);
      const valid = isValidTwilioSignature({
        signature: twilioSignature,
        url,
        params: payload,
        authToken,
      });

      if (!valid) {
        throw new UnauthorizedException('Invalid Twilio webhook signature');
      }
    }

    const event = String(payload.CallStatus ?? payload.EventType ?? 'received');
    return {
      ok: true,
      provider: telephony.provider,
      event,
    };
  }

  private resolveRequestUrl(request: RequestLike): string {
    const xfProto = request.headers?.['x-forwarded-proto'];
    const protocol = (Array.isArray(xfProto) ? xfProto[0] : xfProto) ?? request.protocol ?? 'http';
    const host = request.get?.('host') ?? request.headers?.host ?? 'localhost';
    const path = request.originalUrl ?? request.url ?? '/api/telephony/events';
    return `${protocol}://${host}${path}`;
  }
}
