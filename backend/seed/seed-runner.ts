import fs from 'fs';
import path from 'path';

const seedFiles = [
  'customers.seed.json',
  'leads.seed.json',
  'funnels.seed.json',
  'funnel-contexts.seed.json',
];

interface CrmDb {
  customers: unknown[];
  leads: unknown[];
  funnels: unknown[];
  funnelContexts: unknown[];
}

const dbOutputPath = process.env.CRM_DB_PATH ?? path.join(process.cwd(), '.data', 'crm-dev.json');

function ensureArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function indexBy<T extends Record<string, unknown>>(items: T[], keySelector: (item: T) => string): Map<string, T> {
  const indexed = new Map<string, T>();
  for (const item of items) {
    indexed.set(keySelector(item), item);
  }
  return indexed;
}

export function runAllSeeds(): void {
  const consolidated: CrmDb = {
    customers: [],
    leads: [],
    funnels: [],
    funnelContexts: [],
  };

  if (fs.existsSync(dbOutputPath)) {
    const current = JSON.parse(fs.readFileSync(dbOutputPath, 'utf-8')) as Partial<CrmDb>;
    consolidated.customers = ensureArray(current.customers);
    consolidated.leads = ensureArray(current.leads);
    consolidated.funnels = ensureArray(current.funnels);
    consolidated.funnelContexts = ensureArray(current.funnelContexts);
  }

  for (const file of seedFiles) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const rows = ensureArray(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    const table = file.replace('.seed.json', '');

    if (table === 'funnel-contexts') {
      const target = indexBy(consolidated.funnelContexts as Record<string, unknown>[], (entry) =>
        `${String(entry.customerId)}::${String(entry.funnelId)}`,
      );
      for (const row of rows) {
        target.set(`${String(row.customerId)}::${String(row.funnelId)}`, row);
      }
      consolidated.funnelContexts = [...target.values()];
      continue;
    }

    const key = 'id';
    const currentRows = (consolidated as Record<string, unknown[]>)[table] ?? [];
    const target = indexBy(currentRows as Record<string, unknown>[], (entry) => String(entry[key]));
    for (const row of rows) {
      target.set(String(row[key]), row);
    }
    (consolidated as Record<string, unknown[]>)[table] = [...target.values()];
  }

  fs.mkdirSync(path.dirname(dbOutputPath), { recursive: true });
  fs.writeFileSync(dbOutputPath, JSON.stringify(consolidated, null, 2), 'utf-8');
}

if (require.main === module) {
  runAllSeeds();
  console.log(`Seeded local CRM file DB at ${dbOutputPath}`);
}
