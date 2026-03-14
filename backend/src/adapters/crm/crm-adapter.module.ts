import { Module } from '@nestjs/common';
import { AppConfigService } from '../../common/config/app-config.service';
import { CRM_ADAPTER } from './crm.tokens';
import { InternalCRMAdapter } from './internal-crm-adapter';
import { MockCRMAdapter } from './mock-crm-adapter';

@Module({
  providers: [
    MockCRMAdapter,
    InternalCRMAdapter,
    {
      provide: CRM_ADAPTER,
      useFactory: (
        configService: AppConfigService,
        mockCRMAdapter: MockCRMAdapter,
        internalCRMAdapter: InternalCRMAdapter,
      ) => {
        return configService.getConfig().crm.adapter === 'internal' ? internalCRMAdapter : mockCRMAdapter;
      },
      inject: [AppConfigService, MockCRMAdapter, InternalCRMAdapter],
    },
  ],
  exports: [CRM_ADAPTER],
})
export class CRMAdapterModule {}
