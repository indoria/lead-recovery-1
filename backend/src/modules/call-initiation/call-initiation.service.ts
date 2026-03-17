import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CallEventStoreService } from '../../analytics/call-event-store.service';
import { TELEPHONY_ADAPTER } from '../../adapters/integration.tokens';
import { TelephonyAdapter } from '../../adapters/telephony/telephony-adapter.interface';
import { AppConfigService } from '../../common/config/app-config.service';
import { WorkflowModuleError } from '../../common/errors/workflow-module.error';
import { ExecutionContext } from '../../common/interfaces/execution-context.interface';
import { ModuleInput, ModuleOutput, ValidationError } from '../../common/interfaces/module.types';
import { WorkflowModule } from '../../common/interfaces/workflow-module.interface';
import { AppLoggerService } from '../../common/logger/app-logger.service';
import { Customer } from '../../common/models/customer.model';
import { Lead } from '../../common/models/lead.model';

export interface CallInitiationInput extends ModuleInput {
  customer: Customer;
  lead: Lead;
  callbackBaseUrl: string;
}

export interface CallInitiationOutput extends ModuleOutput {
  providerCallId: string;
  callSessionId: string;
  status: 'ringing' | 'answered';
}

@Injectable()
export class CallInitiationService implements WorkflowModule<CallInitiationInput, CallInitiationOutput> {
  readonly id = 'call-initiation';
  private readonly logger: ReturnType<AppLoggerService['createLogger']>;

  constructor(
    @Inject(TELEPHONY_ADAPTER)
    private readonly telephonyAdapter: TelephonyAdapter,
    private readonly loggerFactory: AppLoggerService,
    private readonly configService: AppConfigService,
    private readonly callEventStore: CallEventStoreService,
  ) {
    this.logger = this.loggerFactory.createLogger(this.id);
  }

  async execute(input: CallInitiationInput, _context: ExecutionContext): Promise<CallInitiationOutput> {
    const validationErrors = this.validateInputs(input);
    if (validationErrors.length > 0) {
      throw new WorkflowModuleError(validationErrors[0].message, this.id);
    }

    const call = await this.telephonyAdapter.initiateCall({
      fromNumber: this.configService.getConfig().telephony.fromNumber,
      toNumber: input.customer.phone,
      callbackUrl: `${input.callbackBaseUrl}/telephony/events`,
      metadata: {
        leadId: input.lead.id,
        customerId: input.customer.id,
      },
    });

    const output: CallInitiationOutput = {
      providerCallId: call.providerCallId,
      callSessionId: `session_${randomUUID()}`,
      status: call.status === 'ringing' ? 'ringing' : 'answered',
    };

    this.logger.info('Call initiated', output);
    this.callEventStore.recordEvent({
      eventName: 'call.initiated',
      category: 'workflow',
      direction: 'internal',
      phase: 'completed',
      provider: this.configService.getConfig().telephony.provider,
      callSessionId: output.callSessionId,
      providerCallId: output.providerCallId,
      occurredAt: new Date().toISOString(),
      payload: {
        customerId: input.customer.id,
        leadId: input.lead.id,
        status: output.status,
      },
    });

    return output;
  }

  validateInputs(input: CallInitiationInput): ValidationError[] {
    const errors: ValidationError[] = [];
    if (!input.customer || typeof input.customer.phone !== 'string' || input.customer.phone.trim().length === 0) {
      errors.push({ field: 'customer.phone', message: 'customer phone is required' });
    }
    if (!input.lead || typeof input.lead.id !== 'string') {
      errors.push({ field: 'lead', message: 'lead is required' });
    }
    if (typeof input.callbackBaseUrl !== 'string' || input.callbackBaseUrl.trim().length === 0) {
      errors.push({ field: 'callbackBaseUrl', message: 'callbackBaseUrl is required' });
    }
    return errors;
  }

  getDependencies(): string[] {
    return ['call-preparation'];
  }

  isFusable(adjacentModuleId: string): boolean {
    return adjacentModuleId === 'welcome-message';
  }

  canSkip(_context: ExecutionContext): boolean {
    return false;
  }
}
