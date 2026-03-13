import { Injectable } from '@nestjs/common';
import { Customer } from '../../common/models/customer.model';
import { FunnelContext, Objection } from '../../common/models/funnel.model';
import { Lead } from '../../common/models/lead.model';
import { TranscriptEntry } from '../../common/models/call-session.model';
import { ExecutionContext } from '../../common/interfaces/execution-context.interface';
import { ModuleInput, ModuleOutput } from '../../common/interfaces/module.types';
import { ConversationLoopService } from '../../modules/conversation-loop/conversation-loop.service';
import { AssessmentResult, ConversationEndReason, ConversationStrategy } from '../../modules/phase2.types';
import { TelephonyWelcomeFusedAdapter } from './telephony-welcome-fused-adapter';
import { FusedAdapter } from '../../orchestrator/orchestrator.types';

interface FullConversationalAIInput extends ModuleInput {
  customer: Customer;
  lead: Lead;
  funnelContext: FunnelContext;
  conversationStrategy: ConversationStrategy;
  callbackBaseUrl: string;
  scriptedCustomerUtterances?: string[];
}

interface FullConversationalAIOutput extends ModuleOutput {
  providerCallId: string;
  callSessionId: string;
  welcomeAudioRef: string;
  welcomeText: string;
  welcomeDeliveredAt: Date;
  finalTranscript: TranscriptEntry[];
  endReason: ConversationEndReason;
  turnCount: number;
  detectedObjections: Objection[];
  assessment: AssessmentResult;
  intentHistory: string[];
  turnsSinceGoalProgress: number;
}

@Injectable()
export class FullConversationalAIAdapter
  implements FusedAdapter<FullConversationalAIInput, FullConversationalAIOutput>
{
  readonly id = 'full-conversational-ai-adapter';
  readonly type = 'full-conversational-ai';
  readonly fusesModuleIds = ['call-initiation', 'welcome-message', 'conversation-loop'];

  constructor(
    private readonly telephonyWelcomeFusedAdapter: TelephonyWelcomeFusedAdapter,
    private readonly conversationLoopService: ConversationLoopService,
  ) {}

  async execute(input: FullConversationalAIInput, context: ExecutionContext): Promise<FullConversationalAIOutput> {
    const telephonyWelcome = await this.telephonyWelcomeFusedAdapter.execute(
      {
        customer: input.customer,
        lead: input.lead,
        funnelContext: input.funnelContext,
        agentPersona: input.conversationStrategy.agentPersona,
        callbackBaseUrl: input.callbackBaseUrl,
      },
      context,
    );

    const conversation = await this.conversationLoopService.execute(
      {
        providerCallId: telephonyWelcome.providerCallId,
        callSessionId: telephonyWelcome.callSessionId,
        conversationStrategy: input.conversationStrategy,
        initialAgentText: telephonyWelcome.welcomeText,
        initialAgentAudioRef: telephonyWelcome.welcomeAudioRef,
        initialAgentTimestamp: telephonyWelcome.welcomeDeliveredAt,
        scriptedCustomerUtterances: input.scriptedCustomerUtterances,
      },
      context,
    );

    return {
      providerCallId: telephonyWelcome.providerCallId,
      callSessionId: telephonyWelcome.callSessionId,
      welcomeAudioRef: telephonyWelcome.welcomeAudioRef,
      welcomeText: telephonyWelcome.welcomeText,
      welcomeDeliveredAt: telephonyWelcome.welcomeDeliveredAt,
      finalTranscript: conversation.finalTranscript,
      endReason: conversation.endReason,
      turnCount: conversation.turnCount,
      detectedObjections: conversation.detectedObjections,
      assessment: conversation.assessment,
      intentHistory: conversation.intentHistory,
      turnsSinceGoalProgress: conversation.turnsSinceGoalProgress,
    };
  }

  expandOutput(output: FullConversationalAIOutput): Record<string, ModuleOutput> {
    return {
      'call-initiation': {
        providerCallId: output.providerCallId,
        callSessionId: output.callSessionId,
        status: 'answered',
      },
      'welcome-message': {
        deliveredAt: output.welcomeDeliveredAt,
        welcomeAudioRef: output.welcomeAudioRef,
        welcomeText: output.welcomeText,
      },
      'conversation-loop': {
        finalTranscript: output.finalTranscript,
        endReason: output.endReason,
        turnCount: output.turnCount,
        detectedObjections: output.detectedObjections,
        assessment: output.assessment,
        intentHistory: output.intentHistory,
        turnsSinceGoalProgress: output.turnsSinceGoalProgress,
      },
    };
  }
}