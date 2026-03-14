import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { OutreachChannelAdapter, OutreachContent, OutreachDeliveryStatus } from './outreach-adapter.interface';

@Injectable()
export class SMSOutreachAdapter implements OutreachChannelAdapter {
  readonly channel = 'sms' as const;
  private readonly logger: ReturnType<AppLoggerService['createLogger']>;

  constructor(loggerFactory: AppLoggerService) {
    this.logger = loggerFactory.createLogger('sms-outreach-adapter');
  }

  async send(to: string, content: OutreachContent): Promise<{ messageId: string }> {
    const messageId = `sms_${randomUUID()}`;
    this.logger.info('SMS outreach stub send', { to, messageId, contentPreview: content.text.slice(0, 120) });
    return { messageId };
  }

  async getStatus(_messageId: string): Promise<OutreachDeliveryStatus> {
    return 'delivered';
  }
}