import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AppConfigService } from 'src/common/config/app-config.service';

describe('AppConfigService', () => {
  const originalCwd = process.cwd();
  const tempRoot = join(originalCwd, '.tmp-config-tests');
  const configDir = join(tempRoot, 'config');

  beforeEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    mkdirSync(configDir, { recursive: true });
    process.chdir(tempRoot);
    delete process.env.APP_PORT;
    delete process.env.LOG_LEVEL;
    delete process.env.JWT_SECRET;
    delete process.env.NODE_ENV;
  });

  afterAll(() => {
    process.chdir(originalCwd);
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('loads default config successfully', () => {
    writeFileSync(
      join(configDir, 'default.yaml'),
      [
        'app:',
        '  name: lead-recovery',
        '  environment: development',
        '  port: 3000',
        'crm:',
        '  adapter: mock',
        "  baseUrl: ''",
        '  timeout: 5000',
        '  supportsContextFusion: false',
        'telephony:',
        '  playsWelcomeOnConnect: false',
        'logging:',
        '  level: info',
        '  format: json',
        '  correlationIdHeader: X-Correlation-ID',
        'llm:',
        '  hasBuiltInDeviation: false',
        'conversationalAi:',
        '  useFullService: false',
        'analytics:',
        '  enabled: true',
        'scheduling:',
        '  maxCallAttempts: 3',
        '  retryIntervalMinutes: 60',
        'security:',
        '  encryptionKeyEnvVar: ENCRYPTION_KEY',
        "  jwtSecret: ''",
      ].join('\n'),
    );

    const service = new AppConfigService();

    expect(service.getConfig().app.port).toBe(3000);
    expect(service.getConfig().crm.adapter).toBe('mock');
  });

  it('merges environment and process env overrides', () => {
    writeFileSync(
      join(configDir, 'default.yaml'),
      [
        'app:',
        '  name: lead-recovery',
        '  environment: development',
        '  port: 3000',
        'crm:',
        '  adapter: mock',
        "  baseUrl: ''",
        '  timeout: 5000',
        '  supportsContextFusion: false',
        'telephony:',
        '  playsWelcomeOnConnect: false',
        'logging:',
        '  level: info',
        '  format: json',
        '  correlationIdHeader: X-Correlation-ID',
        'llm:',
        '  hasBuiltInDeviation: false',
        'conversationalAi:',
        '  useFullService: false',
        'analytics:',
        '  enabled: true',
        'scheduling:',
        '  maxCallAttempts: 3',
        '  retryIntervalMinutes: 60',
        'security:',
        '  encryptionKeyEnvVar: ENCRYPTION_KEY',
        "  jwtSecret: ''",
      ].join('\n'),
    );
    writeFileSync(
      join(configDir, 'test.yaml'),
      [
        'app:',
        '  environment: test',
        'logging:',
        '  level: debug',
      ].join('\n'),
    );

    process.env.NODE_ENV = 'test';
    process.env.APP_PORT = '4100';
    process.env.JWT_SECRET = 'secret-token';

    const service = new AppConfigService();

    expect(service.getConfig().app.environment).toBe('test');
    expect(service.getConfig().app.port).toBe(4100);
    expect(service.getConfig().security.jwtSecret).toBe('secret-token');
  });

  it('throws when config is invalid', () => {
    writeFileSync(join(configDir, 'default.yaml'), 'app:\n  port: not-a-number\n');

    expect(() => new AppConfigService()).toThrow('Invalid application config');
  });
});
