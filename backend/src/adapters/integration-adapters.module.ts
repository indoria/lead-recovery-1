import { Global, Module } from '@nestjs/common';
import { AppConfigService } from '../common/config/app-config.service';
import { LocalAudioCache } from './audio-cache/local-audio-cache';
import { LLM_ADAPTER, OUTREACH_CHANNEL_ADAPTERS, STT_ADAPTER, TELEPHONY_ADAPTER, TTS_ADAPTER } from './integration.tokens';
import { GeminiLLMAdapter } from './llm/gemini-llm-adapter';
import { MockLLMAdapter } from './llm/mock-llm-adapter';
import { EmailOutreachAdapter } from './outreach/email-outreach-adapter';
import { SMSOutreachAdapter } from './outreach/sms-outreach-adapter';
import { WhatsAppOutreachAdapter } from './outreach/whatsapp-outreach-adapter';
import { SarvamSTTAdapter } from './stt/sarvam-stt-adapter';
import { MockSTTAdapter } from './stt/mock-stt-adapter';
import { ExotelTelephonyAdapter } from './telephony/exotel-telephony-adapter';
import { MockTelephonyAdapter } from './telephony/mock-telephony-adapter';
import { TwilioTelephonyAdapter } from './telephony/twilio-telephony-adapter';
import { ElevenLabsTTSAdapter } from './tts/elevenlabs-tts-adapter';
import { MockTTSAdapter } from './tts/mock-tts-adapter';

@Global()
@Module({
  providers: [
    LocalAudioCache,
    MockSTTAdapter,
    SarvamSTTAdapter,
    MockTTSAdapter,
    ElevenLabsTTSAdapter,
    MockLLMAdapter,
    GeminiLLMAdapter,
    MockTelephonyAdapter,
    TwilioTelephonyAdapter,
    ExotelTelephonyAdapter,
    SMSOutreachAdapter,
    EmailOutreachAdapter,
    WhatsAppOutreachAdapter,
    {
      provide: STT_ADAPTER,
      useFactory: (
        configService: AppConfigService,
        mockSTTAdapter: MockSTTAdapter,
        sarvamSTTAdapter: SarvamSTTAdapter,
      ) => {
        return configService.getConfig().stt.provider === 'sarvam' ? sarvamSTTAdapter : mockSTTAdapter;
      },
      inject: [AppConfigService, MockSTTAdapter, SarvamSTTAdapter],
    },
    {
      provide: TTS_ADAPTER,
      useFactory: (
        configService: AppConfigService,
        mockTTSAdapter: MockTTSAdapter,
        elevenLabsTTSAdapter: ElevenLabsTTSAdapter,
      ) => {
        return configService.getConfig().tts.provider === 'elevenlabs' ? elevenLabsTTSAdapter : mockTTSAdapter;
      },
      inject: [AppConfigService, MockTTSAdapter, ElevenLabsTTSAdapter],
    },
    {
      provide: LLM_ADAPTER,
      useFactory: (
        configService: AppConfigService,
        mockLLMAdapter: MockLLMAdapter,
        geminiLLMAdapter: GeminiLLMAdapter,
      ) => {
        return configService.getConfig().llm.provider === 'gemini' ? geminiLLMAdapter : mockLLMAdapter;
      },
      inject: [AppConfigService, MockLLMAdapter, GeminiLLMAdapter],
    },
    {
      provide: TELEPHONY_ADAPTER,
      useFactory: (
        configService: AppConfigService,
        mockTelephonyAdapter: MockTelephonyAdapter,
        twilioTelephonyAdapter: TwilioTelephonyAdapter,
        exotelTelephonyAdapter: ExotelTelephonyAdapter,
      ) => {
        const provider = configService.getConfig().telephony.provider;
        if (provider === 'twilio') {
          return twilioTelephonyAdapter;
        }
        if (provider === 'exotel') {
          return exotelTelephonyAdapter;
        }
        return mockTelephonyAdapter;
      },
      inject: [AppConfigService, MockTelephonyAdapter, TwilioTelephonyAdapter, ExotelTelephonyAdapter],
    },
    {
      provide: OUTREACH_CHANNEL_ADAPTERS,
      useFactory: (
        smsOutreachAdapter: SMSOutreachAdapter,
        emailOutreachAdapter: EmailOutreachAdapter,
        whatsappOutreachAdapter: WhatsAppOutreachAdapter,
      ) => {
        return [smsOutreachAdapter, emailOutreachAdapter, whatsappOutreachAdapter];
      },
      inject: [SMSOutreachAdapter, EmailOutreachAdapter, WhatsAppOutreachAdapter],
    },
  ],
  exports: [
    LocalAudioCache,
    STT_ADAPTER,
    TTS_ADAPTER,
    LLM_ADAPTER,
    TELEPHONY_ADAPTER,
    OUTREACH_CHANNEL_ADAPTERS,
    MockSTTAdapter,
    MockTTSAdapter,
    MockLLMAdapter,
    MockTelephonyAdapter,
  ],
})
export class IntegrationAdaptersModule {}
