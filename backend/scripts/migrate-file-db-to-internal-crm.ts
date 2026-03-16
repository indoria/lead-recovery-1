import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface CrmSnapshot {
  customers?: Record<string, unknown>[];
  leads?: Record<string, unknown>[];
  funnels?: Record<string, unknown>[];
  funnelContexts?: Record<string, unknown>[];
  ['funnel-contexts']?: Record<string, unknown>[];
}

interface MigrationOptions {
  apply: boolean;
  continueOnError: boolean;
  filePath: string;
  baseUrl: string;
  apiKey?: string;
}

function parseOptions(argv: string[]): MigrationOptions {
  const apply = argv.includes('--apply');
  const continueOnError = argv.includes('--continue-on-error');
  const filePathArg = argv.find((entry) => entry.startsWith('--file='));
  const baseUrlArg = argv.find((entry) => entry.startsWith('--base-url='));

  return {
    apply,
    continueOnError,
    filePath: filePathArg?.split('=')[1] ?? process.env.CRM_DB_PATH ?? join(process.cwd(), '.data', 'crm-dev.json'),
    baseUrl: (baseUrlArg?.split('=')[1] ?? process.env.CRM_BASE_URL ?? '').replace(/\/$/, ''),
    apiKey: process.env.CRM_API_KEY,
  };
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function loadSnapshot(filePath: string): CrmSnapshot {
  if (!existsSync(filePath)) {
    throw new Error(`CRM file DB not found: ${filePath}`);
  }
  return JSON.parse(readFileSync(filePath, 'utf8')) as CrmSnapshot;
}

async function request(
  baseUrl: string,
  path: string,
  method: 'PUT' | 'POST',
  body: Record<string, unknown>,
  apiKey?: string,
): Promise<void> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Migration request failed ${method} ${path}: ${response.status} ${detail}`);
  }
}

async function upsertById(
  rows: Record<string, unknown>[],
  resourcePath: string,
  options: MigrationOptions,
): Promise<void> {
  for (const row of rows) {
    const id = String(row.id ?? '');
    if (!id) {
      throw new Error(`Row missing id for ${resourcePath}`);
    }

    if (!options.apply) {
      console.log(`[DRY-RUN] PUT ${resourcePath}/${encodeURIComponent(id)}`);
      continue;
    }

    await request(options.baseUrl, `${resourcePath}/${encodeURIComponent(id)}`, 'PUT', row, options.apiKey);
  }
}

async function upsertFunnelContexts(rows: Record<string, unknown>[], options: MigrationOptions): Promise<void> {
  for (const row of rows) {
    const customerId = String(row.customerId ?? '');
    const funnelId = String(row.funnelId ?? '');
    if (!customerId || !funnelId) {
      throw new Error('Funnel context row missing customerId or funnelId');
    }

    if (!options.apply) {
      console.log(`[DRY-RUN] POST /funnel-context with customerId=${customerId}, funnelId=${funnelId}`);
      continue;
    }

    await request(options.baseUrl, '/funnel-context', 'POST', row, options.apiKey);
  }
}

async function run(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const snapshot = loadSnapshot(options.filePath);

  const customers = asArray(snapshot.customers);
  const leads = asArray(snapshot.leads);
  const funnels = asArray(snapshot.funnels);
  const funnelContexts = asArray(snapshot.funnelContexts ?? snapshot['funnel-contexts']);

  console.log('Migration source:', options.filePath);
  console.log('Entities:', {
    customers: customers.length,
    leads: leads.length,
    funnels: funnels.length,
    funnelContexts: funnelContexts.length,
  });

  if (!options.apply) {
    console.log('Dry run mode enabled. Use --apply to execute writes.');
    if (!options.baseUrl) {
      console.log('No CRM base URL needed in dry run.');
    }
  }

  if (options.apply && !options.baseUrl) {
    throw new Error('CRM base URL is required for --apply mode. Set CRM_BASE_URL or pass --base-url=...');
  }

  const steps: Array<() => Promise<void>> = [
    () => upsertById(customers, '/customers', options),
    () => upsertById(leads, '/leads', options),
    () => upsertById(funnels, '/funnels', options),
    () => upsertFunnelContexts(funnelContexts, options),
  ];

  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      if (!options.continueOnError) {
        throw error;
      }
      console.error('[WARN] Migration step failed and was skipped:', (error as Error).message);
    }
  }

  console.log(options.apply ? 'Migration complete.' : 'Dry run complete.');
}

void run().catch((error) => {
  console.error('[ERROR] Migration failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
