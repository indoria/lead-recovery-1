import { AppConfigService } from 'src/common/config/app-config.service';
import { AppLoggerService } from 'src/common/logger/app-logger.service';
import { CorrelationIdService } from 'src/common/logger/correlation-id.service';
import { CallPreparationService } from 'src/modules/call-preparation/call-preparation.service';
import { ObjectionDatabaseService } from 'src/services/objection-database.service';
import { PromptBuilderService } from 'src/services/prompt-builder.service';
import { buildExecutionContext, testConfig } from './test-helpers';
import { FunnelRepository } from 'src/repositories/funnel.repository';
import { customersFixture, funnelContextsFixture, funnelsFixture, leadsFixture } from './crm-test-fixtures';

describe('CallPreparationService', () => {
  const configService = { getConfig: () => testConfig } as AppConfigService;
  const loggerFactory = new AppLoggerService(configService, new CorrelationIdService());

  it('builds conversation strategy with system prompt and goals', async () => {
    const funnelRepository: FunnelRepository = {
      findAll: async () => structuredClone(funnelsFixture),
      findById: async (id: string) => structuredClone(funnelsFixture.find((entry) => entry.id === id) ?? null),
      update: async () => null,
    };

    const service = new CallPreparationService(
      new ObjectionDatabaseService(funnelRepository),
      new PromptBuilderService(),
      loggerFactory,
    );

    const result = await service.execute(
      {
        customer: customersFixture[0],
        lead: leadsFixture[0],
        funnelContext: funnelContextsFixture[0],
      },
      buildExecutionContext(),
    );

    expect(result.conversationStrategy.systemPrompt).toContain('Customer: Riya Sharma');
    expect(result.conversationStrategy.goals.length).toBeGreaterThan(0);
    expect(result.conversationStrategy.agentPersona.name).toBe('Asha');
  });
});
