import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../../analytics/analytics.module';
import { ConversationLoggingService } from './conversation-logging.service';

@Module({
  imports: [AnalyticsModule],
  providers: [ConversationLoggingService],
  exports: [ConversationLoggingService],
})
export class ConversationLoggingModule {}