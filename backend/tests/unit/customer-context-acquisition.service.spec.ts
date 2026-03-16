import { AppLoggerService } from 'src/common/logger/app-logger.service';
import { CorrelationIdService } from 'src/common/logger/correlation-id.service';
import { AppConfigService } from 'src/common/config/app-config.service';
import { CustomerContextAcquisitionService } from 'src/modules/customer-context-acquisition/customer-context-acquisition.service';
import { buildExecutionContext, testConfig } from './test-helpers';
import { createMockCRMAdapter } from './crm-test-fixtures';

describe('CustomerContextAcquisitionService', () => {
  const configService = { getConfig: () => testConfig } as AppConfigService;
  const loggerFactory = new AppLoggerService(configService, new CorrelationIdService());

  it('returns funnel context for a valid customer and funnel', async () => {
    const service = new CustomerContextAcquisitionService(createMockCRMAdapter(), loggerFactory);

    const result = await service.execute(
      { customerId: 'cust_001', funnelId: 'funnel_bob_credit_card' },
      buildExecutionContext(),
    );

    expect(result.funnelContext.currentStageId).toBe('stage_mobile_verification');
    expect(result.funnelContext.anticipatedObjections).toHaveLength(1);
  });

  it('throws when funnel context is missing', async () => {
    const service = new CustomerContextAcquisitionService(createMockCRMAdapter(), loggerFactory);

    await expect(
      service.execute(
        { customerId: 'cust_missing', funnelId: 'funnel_bob_credit_card' },
        buildExecutionContext(),
      ),
    ).rejects.toThrow('Funnel context not found');
  });

  it('validates required inputs', () => {
    const service = new CustomerContextAcquisitionService(createMockCRMAdapter(), loggerFactory);

    expect(service.validateInputs({ customerId: '', funnelId: '' })).toEqual([
      { field: 'customerId', message: 'customerId is required' },
      { field: 'funnelId', message: 'funnelId is required' },
    ]);
  });
});
