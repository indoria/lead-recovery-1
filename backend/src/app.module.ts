import { Module } from '@nestjs/common';
import { AgentsModule } from './agents/agents.module';
import { IntegrationAdaptersModule } from './adapters/integration-adapters.module';
import { AppConfigModule } from './common/config/app-config.module';
import { LoggerModule } from './common/logger/logger.module';
import { ModuleRegistryModule } from './common/registry/module-registry.module';
import { CustomersModule } from './customers/customers.module';
import { FunnelsModule } from './funnels/funnels.module';
import { HealthModule } from './health/health.module';
import { LeadsModule } from './leads/leads.module';
import { CRMAdapterModule } from './adapters/crm/crm-adapter.module';
import { DataModule } from './data/data.module';
import { CallInitiationModule } from './modules/call-initiation/call-initiation.module';
import { CallPreparationModule } from './modules/call-preparation/call-preparation.module';
import { AccomplishmentAssessmentModule } from './modules/accomplishment-assessment/accomplishment-assessment.module';
import { ConversationLoggingModule } from './modules/conversation-logging/conversation-logging.module';
import { ConversationLoopModule } from './modules/conversation-loop/conversation-loop.module';
import { CustomerDataRetrievalModule } from './modules/customer-data-retrieval/customer-data-retrieval.module';
import { CustomerContextAcquisitionModule } from './modules/customer-context-acquisition/customer-context-acquisition.module';
import { ExceptionHandlingModule } from './modules/exception-handling/exception-handling.module';
import { EscalationModule } from './modules/escalation/escalation.module';
import { ObjectionsModule } from './modules/objections/objections.module';
import { ResponseProcessingModule } from './modules/response-processing/response-processing.module';
import { SuggestionsModule } from './suggestions/suggestions.module';
import { WelcomeMessageModule } from './modules/welcome-message/welcome-message.module';
import { WorkflowModule } from './workflow/workflow.module';
import { RepositoriesModule } from './repositories/repositories.module';
import { TelephonyModule } from './telephony/telephony.module';

@Module({
  imports: [
    AppConfigModule,
    DataModule,
    RepositoriesModule,
    LoggerModule,
    AgentsModule,
    CustomersModule,
    FunnelsModule,
    CRMAdapterModule,
    IntegrationAdaptersModule,
    ModuleRegistryModule,
    HealthModule,
    WorkflowModule,
    TelephonyModule,
    AccomplishmentAssessmentModule,
    CustomerDataRetrievalModule,
    CustomerContextAcquisitionModule,
    CallPreparationModule,
    CallInitiationModule,
    WelcomeMessageModule,
    ResponseProcessingModule,
    ConversationLoopModule,
    ExceptionHandlingModule,
    ConversationLoggingModule,
    EscalationModule,
    ObjectionsModule,
    LeadsModule,
    SuggestionsModule,
  ],
  exports: [ModuleRegistryModule, CRMAdapterModule],
})
export class AppModule {}