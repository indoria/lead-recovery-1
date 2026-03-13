import { Module } from '@nestjs/common';
import { CRMAdapterModule } from '../../adapters/crm/crm-adapter.module';
import { ExceptionHandlingService } from './exception-handling.service';

@Module({
  imports: [CRMAdapterModule],
  providers: [ExceptionHandlingService],
  exports: [ExceptionHandlingService],
})
export class ExceptionHandlingModule {}