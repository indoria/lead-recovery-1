import { Module } from '@nestjs/common';
import { CallInitiationModule } from '../../modules/call-initiation/call-initiation.module';
import { ConversationLoopModule } from '../../modules/conversation-loop/conversation-loop.module';
import { CustomerContextAcquisitionModule } from '../../modules/customer-context-acquisition/customer-context-acquisition.module';
import { CustomerDataRetrievalModule } from '../../modules/customer-data-retrieval/customer-data-retrieval.module';
import { WelcomeMessageModule } from '../../modules/welcome-message/welcome-message.module';
import { CRMContextFusedAdapter } from './crm-context-fused-adapter';
import { FusedAdapterRegistry } from './fused-adapter.registry';
import { FullConversationalAIAdapter } from './full-conversational-ai-adapter';
import { TelephonyWelcomeFusedAdapter } from './telephony-welcome-fused-adapter';

@Module({
  imports: [
    CustomerDataRetrievalModule,
    CustomerContextAcquisitionModule,
    CallInitiationModule,
    WelcomeMessageModule,
    ConversationLoopModule,
  ],
  providers: [
    CRMContextFusedAdapter,
    TelephonyWelcomeFusedAdapter,
    FullConversationalAIAdapter,
    {
      provide: FusedAdapterRegistry,
      inject: [CRMContextFusedAdapter, TelephonyWelcomeFusedAdapter, FullConversationalAIAdapter],
      useFactory: (
        crmContextFusedAdapter: CRMContextFusedAdapter,
        telephonyWelcomeFusedAdapter: TelephonyWelcomeFusedAdapter,
        fullConversationalAIAdapter: FullConversationalAIAdapter,
      ) => {
        const registry = new FusedAdapterRegistry();
        registry.register(crmContextFusedAdapter.id, crmContextFusedAdapter, ['phase-3']);
        registry.register(telephonyWelcomeFusedAdapter.id, telephonyWelcomeFusedAdapter, ['phase-3']);
        registry.register(fullConversationalAIAdapter.id, fullConversationalAIAdapter, ['phase-3']);
        return registry;
      },
    },
  ],
  exports: [CRMContextFusedAdapter, TelephonyWelcomeFusedAdapter, FullConversationalAIAdapter, FusedAdapterRegistry],
})
export class FusedAdaptersModule {}