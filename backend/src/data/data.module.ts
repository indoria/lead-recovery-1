import { Global, Module } from '@nestjs/common';
import { CrmDataStoreService } from './crm-data-store.service';

@Global()
@Module({
  providers: [CrmDataStoreService],
  exports: [CrmDataStoreService],
})
export class DataModule {}
