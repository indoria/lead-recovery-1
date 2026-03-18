import { Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { AppConfigService } from '../common/config/app-config.service';

export interface IntegrationStatus {
  id: string;
  label: string;
  configured: boolean;
  activeProvider: boolean;
  message: string;
}

export interface IntegrationTestResult {
  ok: boolean;
  reason?: string;
  message: string;
}

const DEFAULT_ENV_VARS = {
  sarvamApiKey: 'SARVAM_API_KEY',
  elevenLabsApiKey: 'ELEVEN_LABS_API_KEY',
  twilioAccountSid: 'TWILIO_ACCOUNT_SID',
  twilioAuthToken: 'TWILIO_AUTH_TOKEN',
  exotelAccountSid: 'EXOTEL_ACCOUNT_SID',
  exotelAuthToken: 'EXOTEL_AUTH_TOKEN',
} as const;

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly configService: AppConfigService) {}

  @Get()
  list(): IntegrationStatus[] {
    const config = this.configService.getConfig();
    const telephonyProvider = config.telephony.provider;

    return [
      {
        id: 'sarvam-ai',
        label: 'Sarvam AI',
        configured: this.testSarvam().ok,
        activeProvider: config.stt.provider === 'sarvam',
        message: this.testSarvam().message,
      },
      {
        id: 'eleven-labs',
        label: 'Eleven Labs',
        configured: this.testElevenLabs().ok,
        activeProvider: config.tts.provider === 'elevenlabs',
        message: this.testElevenLabs().message,
      },
      {
        id: 'twilio',
        label: 'Twilio',
        configured: this.testTwilio().ok,
        activeProvider: telephonyProvider === 'twilio',
        message: this.testTwilio().message,
      },
      {
        id: 'exotel',
        label: 'Exotel',
        configured: this.testExotel().ok,
        activeProvider: telephonyProvider === 'exotel',
        message: this.testExotel().message,
      },
      {
        id: 'crm',
        label: 'CRM',
        configured: this.testCrm().ok,
        activeProvider: config.crm.adapter !== 'mock',
        message: this.testCrm().message,
      },
    ];
  }

  @Post(':id/test')
  test(@Param('id') id: string): IntegrationTestResult {
    switch (id) {
      case 'sarvam-ai':
        return this.testSarvam();
      case 'eleven-labs':
        return this.testElevenLabs();
      case 'twilio':
        return this.testTwilio();
      case 'exotel':
        return this.testExotel();
      case 'crm':
        return this.testCrm();
      default:
        throw new NotFoundException(`Unknown integration: ${id}`);
    }
  }

  private testSarvam(): IntegrationTestResult {
    const cfg = this.configService.getConfig().stt.sarvam;
    const key = this.resolveSecret(cfg.apiKeyEnvVar, DEFAULT_ENV_VARS.sarvamApiKey);
    if (!key) {
      return {
        ok: false,
        reason: 'not_configured',
        message: `Not configured — set ${DEFAULT_ENV_VARS.sarvamApiKey}`,
      };
    }
    return { ok: true, message: 'API key is configured' };
  }

  private testElevenLabs(): IntegrationTestResult {
    const cfg = this.configService.getConfig().tts.elevenLabs;
    const key = this.resolveSecret(cfg.apiKeyEnvVar, DEFAULT_ENV_VARS.elevenLabsApiKey);
    if (!key) {
      return {
        ok: false,
        reason: 'not_configured',
        message: `Not configured — set ${DEFAULT_ENV_VARS.elevenLabsApiKey}`,
      };
    }
    return { ok: true, message: 'API key is configured' };
  }

  private testTwilio(): IntegrationTestResult {
    const cfg = this.configService.getConfig().telephony.twilio;
    const sid = this.resolveSecret(cfg.accountSidEnvVar, DEFAULT_ENV_VARS.twilioAccountSid);
    const token = this.resolveSecret(cfg.authTokenEnvVar, DEFAULT_ENV_VARS.twilioAuthToken);
    if (!sid || !token) {
      const missing = [
        !sid && DEFAULT_ENV_VARS.twilioAccountSid,
        !token && DEFAULT_ENV_VARS.twilioAuthToken,
      ].filter(Boolean).join(', ');
      return {
        ok: false,
        reason: 'not_configured',
        message: `Not configured — set: ${missing}`,
      };
    }
    return { ok: true, message: 'Credentials are configured' };
  }

  private testExotel(): IntegrationTestResult {
    const cfg = this.configService.getConfig().telephony.exotel;
    const sid = this.resolveSecret(cfg.accountSidEnvVar, DEFAULT_ENV_VARS.exotelAccountSid);
    const token = this.resolveSecret(cfg.authTokenEnvVar, DEFAULT_ENV_VARS.exotelAuthToken);
    if (!sid || !token) {
      const missing = [
        !sid && DEFAULT_ENV_VARS.exotelAccountSid,
        !token && DEFAULT_ENV_VARS.exotelAuthToken,
      ].filter(Boolean).join(', ');
      return {
        ok: false,
        reason: 'not_configured',
        message: `Not configured — set: ${missing}`,
      };
    }
    return { ok: true, message: 'Credentials are configured' };
  }

  private testCrm(): IntegrationTestResult {
    const config = this.configService.getConfig().crm;
    if (config.adapter === 'mock') {
      return {
        ok: false,
        reason: 'not_configured',
        message: 'Using mock CRM — set crm.adapter in config to a real provider',
      };
    }
    return { ok: true, message: `Using ${config.adapter} CRM adapter` };
  }

  private resolveSecret(configEntry: string | undefined, fallbackEnvName: string): string | undefined {
    if (typeof configEntry === 'string' && configEntry.length > 0) {
      if (this.looksLikeEnvVarName(configEntry)) {
        return process.env[configEntry] ?? process.env[fallbackEnvName];
      }
      // Backward compatibility: some environments stored raw credentials in config.
      return configEntry;
    }

    return process.env[fallbackEnvName];
  }

  private looksLikeEnvVarName(value: string): boolean {
    return /^[A-Z_][A-Z0-9_]*$/.test(value);
  }
}
