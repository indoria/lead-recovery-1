import { Module } from '@nestjs/common';
import { IntegrationAdaptersModule } from './adapters/integration-adapters.module';
import { AppConfigModule } from './common/config/app-config.module';
import { LoggerModule } from './common/logger/logger.module';
import { ModuleRegistryModule } from './common/registry/module-registry.module';
import { HealthModule } from './health/health.module';
import { CRMAdapterModule } from './adapters/crm/crm-adapter.module';
import { CallInitiationModule } from './modules/call-initiation/call-initiation.module';
import { CallPreparationModule } from './modules/call-preparation/call-preparation.module';
import { ConversationLoggingModule } from './modules/conversation-logging/conversation-logging.module';
import { ConversationLoopModule } from './modules/conversation-loop/conversation-loop.module';
import { CustomerDataRetrievalModule } from './modules/customer-data-retrieval/customer-data-retrieval.module';
import { CustomerContextAcquisitionModule } from './modules/customer-context-acquisition/customer-context-acquisition.module';
import { ExceptionHandlingModule } from './modules/exception-handling/exception-handling.module';
import { ResponseProcessingModule } from './modules/response-processing/response-processing.module';
import { WelcomeMessageModule } from './modules/welcome-message/welcome-message.module';
import { WorkflowModule } from './workflow/workflow.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    CRMAdapterModule,
    IntegrationAdaptersModule,
    ModuleRegistryModule,
    HealthModule,
    WorkflowModule,
    CustomerDataRetrievalModule,
    CustomerContextAcquisitionModule,
    CallPreparationModule,
    CallInitiationModule,
    WelcomeMessageModule,
    ResponseProcessingModule,
    ConversationLoopModule,
    ExceptionHandlingModule,
    ConversationLoggingModule,
  ],
  exports: [ModuleRegistryModule, CRMAdapterModule],
})
export class AppModule {}