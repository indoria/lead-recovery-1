import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { OutreachChannelAdapter, OutreachContent, OutreachDeliveryStatus } from './outreach-adapter.interface';

@Injectable()
export class EmailOutreachAdapter implements OutreachChannelAdapter {
  readonly channel = 'email' as const;
  private readonly logger: ReturnType<AppLoggerService['createLogger']>;

  constructor(loggerFactory: AppLoggerService) {
    this.logger = loggerFactory.createLogger('email-outreach-adapter');
  }

  async send(to: string, content: OutreachContent): Promise<{ messageId: string }> {
    const messageId = `email_${randomUUID()}`;
    const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
    this.logger.info('Email outreach stub send', {
      to,
      messageId,
      smtpConfigured,
      subject: content.subject ?? '(none)',
      contentPreview: content.text.slice(0, 120),
    });
    return { messageId };
  }

  async getStatus(_messageId: string): Promise<OutreachDeliveryStatus> {
    return 'pending';
  }
}