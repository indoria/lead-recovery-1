import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AppConfigService } from 'src/common/config/app-config.service';

describe('AppConfigService', () => {
  const originalCwd = process.cwd();
  const tempRoot = join(originalCwd, '.tmp-config-tests');
  const configDir = join(tempRoot, 'config');
  const defaultConfigSource = join(originalCwd, 'config', 'default.yaml');

  const writeDefaultConfig = (): void => {
    writeFileSync(join(configDir, 'default.yaml'), readFileSync(defaultConfigSource, 'utf8'));
  };

  beforeEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    mkdirSync(configDir, { recursive: true });
    process.chdir(tempRoot);
    delete process.env.APP_PORT;
    delete process.env.LOG_LEVEL;
    delete process.env.JWT_SECRET;
    delete process.env.LLM_MAX_PROMPT_TOKENS;
    delete process.env.STT_PROVIDER;
    delete process.env.CRM_BASE_URL;
    delete process.env.CRM_TIMEOUT;
    delete process.env.NODE_ENV;
  });

  afterAll(() => {
    process.chdir(originalCwd);
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('loads default config successfully', () => {
    writeDefaultConfig();

    const service = new AppConfigService();

    expect(service.getConfig().app.port).toBe(3000);
    expect(service.getConfig().crm.adapter).toBe('file');
  });

  it('merges environment and process env overrides', () => {
    writeDefaultConfig();
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
    process.env.LLM_MAX_PROMPT_TOKENS = '3000';
    process.env.STT_PROVIDER = 'sarvam';
    process.env.CRM_BASE_URL = 'https://crm.example.internal';
    process.env.CRM_TIMEOUT = '9000';

    const service = new AppConfigService();

    expect(service.getConfig().app.environment).toBe('test');
    expect(service.getConfig().app.port).toBe(4100);
    expect(service.getConfig().security.jwtSecret).toBe('secret-token');
    expect(service.getConfig().llm.maxPromptTokens).toBe(3000);
    expect(service.getConfig().stt.provider).toBe('sarvam');
    expect(service.getConfig().crm.baseUrl).toBe('https://crm.example.internal');
    expect(service.getConfig().crm.timeout).toBe(9000);
  });

  it('throws when config is invalid', () => {
    writeFileSync(join(configDir, 'default.yaml'), 'app:\n  port: not-a-number\n');

    expect(() => new AppConfigService()).toThrow('Invalid application config');
  });
});
