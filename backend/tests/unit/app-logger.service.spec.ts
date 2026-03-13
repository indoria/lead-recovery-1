import { AppLoggerService } from 'src/common/logger/app-logger.service';
import { CorrelationIdService } from 'src/common/logger/correlation-id.service';
import { AppConfigService } from 'src/common/config/app-config.service';

describe('AppLoggerService', () => {
  const originalLog = console.log;
  const originalError = console.error;

  beforeEach(() => {
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  it('masks PII fields in logs', () => {
    const configService = {
      getConfig: () => ({
        logging: {
          format: 'json',
        },
      }),
    } as unknown as AppConfigService;
    const correlationIdService = new CorrelationIdService();
    const loggerService = new AppLoggerService(configService, correlationIdService);
    const logger = loggerService.createLogger('test-module');

    logger.info('Logging payload', {
      name: 'Riya Sharma',
      phone: '+919900000001',
      nested: {
        email: 'riya@example.com',
      },
    });

    const serialized = (console.log as jest.Mock).mock.calls[0][0] as string;
    expect(serialized).toContain('*******arma');
    expect(serialized).toContain('*********0001');
    expect(serialized).toContain('************.com');
  });

  it('includes correlation id when present', () => {
    const configService = {
      getConfig: () => ({
        logging: {
          format: 'json',
        },
      }),
    } as unknown as AppConfigService;
    const correlationIdService = new CorrelationIdService();
    const loggerService = new AppLoggerService(configService, correlationIdService);
    const logger = loggerService.createLogger('test-module');

    correlationIdService.run('corr_123', () => {
      logger.info('Inside context');
    });

    const serialized = (console.log as jest.Mock).mock.calls[0][0] as string;
    expect(serialized).toContain('corr_123');
    expect(serialized).toContain('test-module');
  });
});
