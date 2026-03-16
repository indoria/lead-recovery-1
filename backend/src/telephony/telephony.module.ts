import { Module } from '@nestjs/common';
import { TelephonyEventsController } from './telephony-events.controller';

@Module({
  controllers: [TelephonyEventsController],
})
export class TelephonyModule {}
