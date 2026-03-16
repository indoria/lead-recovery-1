import { Module } from '@nestjs/common';
import { AppConfigService } from '../../common/config/app-config.service';
import { CRM_ADAPTER } from './crm.tokens';
import { FileCRMAdapter } from './file-crm-adapter';
import { InternalCRMAdapter } from './internal-crm-adapter';
import { MockCRMAdapter } from './mock-crm-adapter';

@Module({
  providers: [
    MockCRMAdapter,
    FileCRMAdapter,
    InternalCRMAdapter,
    {
      provide: CRM_ADAPTER,
      useFactory: (
        configService: AppConfigService,
        mockCRMAdapter: MockCRMAdapter,
        fileCRMAdapter: FileCRMAdapter,
        internalCRMAdapter: InternalCRMAdapter,
      ) => {
        const adapter = configService.getConfig().crm.adapter;
        if (adapter === 'internal') {
          return internalCRMAdapter;
        }
        if (adapter === 'file') {
          return fileCRMAdapter;
        }
        return mockCRMAdapter;
      },
      inject: [AppConfigService, MockCRMAdapter, FileCRMAdapter, InternalCRMAdapter],
    },
  ],
  exports: [CRM_ADAPTER],
})
export class CRMAdapterModule {}
