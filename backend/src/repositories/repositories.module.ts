import { Global, Module } from '@nestjs/common';
import { CUSTOMER_REPOSITORY, FUNNEL_CONTEXT_REPOSITORY, FUNNEL_REPOSITORY, LEAD_REPOSITORY } from './repository.tokens';
import { FileCustomerRepository } from './file/file-customer.repository';
import { FileLeadRepository } from './file/file-lead.repository';
import { FileFunnelRepository } from './file/file-funnel.repository';
import { FileFunnelContextRepository } from './file/file-funnel-context.repository';

@Global()
@Module({
  providers: [
    FileCustomerRepository,
    FileLeadRepository,
    FileFunnelRepository,
    FileFunnelContextRepository,
    {
      provide: CUSTOMER_REPOSITORY,
      useExisting: FileCustomerRepository,
    },
    {
      provide: LEAD_REPOSITORY,
      useExisting: FileLeadRepository,
    },
    {
      provide: FUNNEL_REPOSITORY,
      useExisting: FileFunnelRepository,
    },
    {
      provide: FUNNEL_CONTEXT_REPOSITORY,
      useExisting: FileFunnelContextRepository,
    },
  ],
  exports: [CUSTOMER_REPOSITORY, LEAD_REPOSITORY, FUNNEL_REPOSITORY, FUNNEL_CONTEXT_REPOSITORY],
})
export class RepositoriesModule {}
