import { Module } from '@nestjs/common';
import { CallInitiationModule } from '../../modules/call-initiation/call-initiation.module';
import { CallInitiationService } from '../../modules/call-initiation/call-initiation.service';
import { CallPreparationModule } from '../../modules/call-preparation/call-preparation.module';
import { CallPreparationService } from '../../modules/call-preparation/call-preparation.service';
import { ConversationLoggingModule } from '../../modules/conversation-logging/conversation-logging.module';
import { ConversationLoggingService } from '../../modules/conversation-logging/conversation-logging.service';
import { ConversationLoopModule } from '../../modules/conversation-loop/conversation-loop.module';
import { ConversationLoopService } from '../../modules/conversation-loop/conversation-loop.service';
import { CustomerContextAcquisitionModule } from '../../modules/customer-context-acquisition/customer-context-acquisition.module';
import { CustomerContextAcquisitionService } from '../../modules/customer-context-acquisition/customer-context-acquisition.service';
import { CustomerDataRetrievalModule } from '../../modules/customer-data-retrieval/customer-data-retrieval.module';
import { CustomerDataRetrievalService } from '../../modules/customer-data-retrieval/customer-data-retrieval.service';
import { ExceptionHandlingModule } from '../../modules/exception-handling/exception-handling.module';
import { ExceptionHandlingService } from '../../modules/exception-handling/exception-handling.service';
import { ResponseProcessingModule } from '../../modules/response-processing/response-processing.module';
import { ResponseProcessingService } from '../../modules/response-processing/response-processing.service';
import { WelcomeMessageModule } from '../../modules/welcome-message/welcome-message.module';
import { WelcomeMessageService } from '../../modules/welcome-message/welcome-message.service';
import { ModuleRegistry } from './module-registry';

@Module({
  imports: [
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
  providers: [
    {
      provide: ModuleRegistry,
      inject: [
        CustomerDataRetrievalService,
        CustomerContextAcquisitionService,
        CallPreparationService,
        CallInitiationService,
        WelcomeMessageService,
        ResponseProcessingService,
        ConversationLoopService,
        ExceptionHandlingService,
        ConversationLoggingService,
      ],
      useFactory: (
        customerDataRetrievalService: CustomerDataRetrievalService,
        customerContextAcquisitionService: CustomerContextAcquisitionService,
        callPreparationService: CallPreparationService,
        callInitiationService: CallInitiationService,
        welcomeMessageService: WelcomeMessageService,
        responseProcessingService: ResponseProcessingService,
        conversationLoopService: ConversationLoopService,
        exceptionHandlingService: ExceptionHandlingService,
        conversationLoggingService: ConversationLoggingService,
      ) => {
        const registry = new ModuleRegistry();
        registry.register(customerDataRetrievalService.id, customerDataRetrievalService, ['workflow']);
        registry.register(customerContextAcquisitionService.id, customerContextAcquisitionService, ['workflow']);
        registry.register(callPreparationService.id, callPreparationService, ['workflow', 'phase-2']);
        registry.register(callInitiationService.id, callInitiationService, ['workflow', 'phase-2']);
        registry.register(welcomeMessageService.id, welcomeMessageService, ['workflow', 'phase-2']);
        registry.register(responseProcessingService.id, responseProcessingService, ['workflow', 'phase-2']);
        registry.register(conversationLoopService.id, conversationLoopService, ['workflow', 'phase-2']);
        registry.register(exceptionHandlingService.id, exceptionHandlingService, ['workflow', 'phase-3']);
        registry.register(conversationLoggingService.id, conversationLoggingService, ['workflow', 'phase-3']);
        return registry;
      },
    },
  ],
  exports: [ModuleRegistry],
})
export class ModuleRegistryModule {}
