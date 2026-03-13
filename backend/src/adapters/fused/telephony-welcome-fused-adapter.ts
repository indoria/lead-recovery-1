import { Injectable } from '@nestjs/common';
import { ExecutionContext } from '../../common/interfaces/execution-context.interface';
import { ModuleInput, ModuleOutput } from '../../common/interfaces/module.types';
import { CallInitiationService } from '../../modules/call-initiation/call-initiation.service';
import { AgentPersona } from '../../modules/phase2.types';
import { WelcomeMessageService } from '../../modules/welcome-message/welcome-message.service';
import { Customer } from '../../common/models/customer.model';
import { FunnelContext } from '../../common/models/funnel.model';
import { Lead } from '../../common/models/lead.model';
import { FusedAdapter } from '../../orchestrator/orchestrator.types';

interface TelephonyWelcomeFusedInput extends ModuleInput {
  customer: Customer;
  lead: Lead;
  funnelContext: FunnelContext;
  agentPersona: AgentPersona;
  callbackBaseUrl: string;
}

interface TelephonyWelcomeFusedOutput extends ModuleOutput {
  providerCallId: string;
  callSessionId: string;
  status: 'ringing' | 'answered';
  welcomeDeliveredAt: Date;
  welcomeAudioRef: string;
  welcomeText: string;
}

@Injectable()
export class TelephonyWelcomeFusedAdapter
  implements FusedAdapter<TelephonyWelcomeFusedInput, TelephonyWelcomeFusedOutput>
{
  readonly id = 'telephony-welcome-fused-adapter';
  readonly type = 'telephony-welcome';
  readonly fusesModuleIds = ['call-initiation', 'welcome-message'];

  constructor(
    private readonly callInitiationService: CallInitiationService,
    private readonly welcomeMessageService: WelcomeMessageService,
  ) {}

  async execute(input: TelephonyWelcomeFusedInput, context: ExecutionContext): Promise<TelephonyWelcomeFusedOutput> {
    const initiation = await this.callInitiationService.execute(
      {
        customer: input.customer,
        lead: input.lead,
        callbackBaseUrl: input.callbackBaseUrl,
      },
      context,
    );
    const welcome = await this.welcomeMessageService.execute(
      {
        providerCallId: initiation.providerCallId,
        customer: input.customer,
        funnelContext: input.funnelContext,
        agentPersona: input.agentPersona,
      },
      context,
    );

    return {
      providerCallId: initiation.providerCallId,
      callSessionId: initiation.callSessionId,
      status: initiation.status,
      welcomeDeliveredAt: welcome.deliveredAt,
      welcomeAudioRef: welcome.welcomeAudioRef,
      welcomeText: welcome.welcomeText,
    };
  }

  expandOutput(output: TelephonyWelcomeFusedOutput): Record<string, ModuleOutput> {
    return {
      'call-initiation': {
        providerCallId: output.providerCallId,
        callSessionId: output.callSessionId,
        status: output.status,
      },
      'welcome-message': {
        deliveredAt: output.welcomeDeliveredAt,
        welcomeAudioRef: output.welcomeAudioRef,
        welcomeText: output.welcomeText,
      },
    };
  }
}