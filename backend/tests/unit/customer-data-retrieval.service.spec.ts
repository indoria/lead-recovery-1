import { AppConfigService } from 'src/common/config/app-config.service';
import { AppLoggerService } from 'src/common/logger/app-logger.service';
import { CorrelationIdService } from 'src/common/logger/correlation-id.service';
import { CustomerDataRetrievalService } from 'src/modules/customer-data-retrieval/customer-data-retrieval.service';
import { buildExecutionContext, testConfig } from './test-helpers';
import { createMockCRMAdapter } from './crm-test-fixtures';

describe('CustomerDataRetrievalService', () => {
  const configService = { getConfig: () => testConfig } as AppConfigService;
  const loggerFactory = new AppLoggerService(configService, new CorrelationIdService());

  it('returns customer and lead for a scheduled lead', async () => {
    const service = new CustomerDataRetrievalService(createMockCRMAdapter(), loggerFactory, configService);

    const result = await service.execute({ leadId: 'lead_001' }, buildExecutionContext());

    expect(result.lead.id).toBe('lead_001');
    expect(result.customer.id).toBe('cust_001');
  });

  it('throws for unknown lead', async () => {
    const service = new CustomerDataRetrievalService(createMockCRMAdapter(), loggerFactory, configService);

    await expect(service.execute({ leadId: 'missing' }, buildExecutionContext())).rejects.toThrow('Lead not found');
  });

  it('throws when lead is not scheduled', async () => {
    const service = new CustomerDataRetrievalService(createMockCRMAdapter(), loggerFactory, configService);

    await expect(service.execute({ leadId: 'lead_002' }, buildExecutionContext())).rejects.toThrow(
      'is not scheduled',
    );
  });

  it('validates missing lead id', () => {
    const service = new CustomerDataRetrievalService(createMockCRMAdapter(), loggerFactory, configService);

    expect(service.validateInputs({ leadId: '' })).toEqual([
      { field: 'leadId', message: 'leadId is required' },
    ]);
  });
});
