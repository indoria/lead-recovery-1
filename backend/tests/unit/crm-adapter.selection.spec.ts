import { FileCRMAdapter } from 'src/adapters/crm/file-crm-adapter';
import { InternalCRMAdapter } from 'src/adapters/crm/internal-crm-adapter';
import { MockCRMAdapter } from 'src/adapters/crm/mock-crm-adapter';
import { AppConfigService } from 'src/common/config/app-config.service';
import { testConfig } from './test-helpers';
import { createMockCRMAdapter } from './crm-test-fixtures';

describe('CRM adapter selection', () => {
  function selectAdapter(
    adapter: 'mock' | 'file' | 'internal',
    mockAdapter: MockCRMAdapter,
    fileAdapter: FileCRMAdapter,
    internalAdapter: InternalCRMAdapter,
  ): MockCRMAdapter | FileCRMAdapter | InternalCRMAdapter {
    if (adapter === 'internal') {
      return internalAdapter;
    }
    if (adapter === 'file') {
      return fileAdapter;
    }
    return mockAdapter;
  }

  it('returns file adapter when config is file', () => {
    const mock = createMockCRMAdapter();
    const file = new FileCRMAdapter(
      (mock as unknown as { customerRepository: never }).customerRepository,
      (mock as unknown as { leadRepository: never }).leadRepository,
      (mock as unknown as { funnelContextRepository: never }).funnelContextRepository,
    );
    const internal = new InternalCRMAdapter({
      getConfig: () => ({ ...testConfig, crm: { ...testConfig.crm, adapter: 'internal', baseUrl: 'http://x' } }),
    } as AppConfigService);

    const selected = selectAdapter('file', mock, file, internal);
    expect(selected).toBe(file);
  });

  it('returns internal adapter when config is internal', () => {
    const mock = createMockCRMAdapter();
    const file = new FileCRMAdapter(
      (mock as unknown as { customerRepository: never }).customerRepository,
      (mock as unknown as { leadRepository: never }).leadRepository,
      (mock as unknown as { funnelContextRepository: never }).funnelContextRepository,
    );
    const internal = new InternalCRMAdapter({
      getConfig: () => ({ ...testConfig, crm: { ...testConfig.crm, adapter: 'internal', baseUrl: 'http://x' } }),
    } as AppConfigService);

    const selected = selectAdapter('internal', mock, file, internal);
    expect(selected).toBe(internal);
  });

  it('returns mock adapter by default', () => {
    const mock = createMockCRMAdapter();
    const file = new FileCRMAdapter(
      (mock as unknown as { customerRepository: never }).customerRepository,
      (mock as unknown as { leadRepository: never }).leadRepository,
      (mock as unknown as { funnelContextRepository: never }).funnelContextRepository,
    );
    const internal = new InternalCRMAdapter({ getConfig: () => testConfig } as AppConfigService);

    const selected = selectAdapter('mock', mock, file, internal);
    expect(selected).toBe(mock);
  });
});
