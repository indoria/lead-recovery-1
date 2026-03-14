export interface OutreachContent {
  subject?: string;
  text: string;
  templateId?: string;
  metadata?: Record<string, string>;
}

export type OutreachChannel = 'sms' | 'email' | 'whatsapp' | 'call';
export type OutreachDeliveryStatus = 'delivered' | 'failed' | 'pending';

export interface OutreachChannelAdapter {
  readonly channel: OutreachChannel;
  send(to: string, content: OutreachContent): Promise<{ messageId: string }>;
  getStatus(messageId: string): Promise<OutreachDeliveryStatus>;
}