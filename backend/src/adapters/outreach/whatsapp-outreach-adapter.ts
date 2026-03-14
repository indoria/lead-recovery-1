import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { OutreachChannelAdapter, OutreachContent, OutreachDeliveryStatus } from './outreach-adapter.interface';

@Injectable()
export class WhatsAppOutreachAdapter implements OutreachChannelAdapter {
  readonly channel = 'whatsapp' as const;
  private readonly logger: ReturnType<AppLoggerService['createLogger']>;

  constructor(loggerFactory: AppLoggerService) {
    this.logger = loggerFactory.createLogger('whatsapp-outreach-adapter');
  }

  async send(to: string, content: OutreachContent): Promise<{ messageId: string }> {
    const messageId = `wa_${randomUUID()}`;
    this.logger.info('WhatsApp outreach skeleton send', {
      to,
      messageId,
      provider: 'twilio-whatsapp',
      contentPreview: content.text.slice(0, 120),
    });
    return { messageId };
  }

  async getStatus(_messageId: string): Promise<OutreachDeliveryStatus> {
    return 'pending';
  }
}