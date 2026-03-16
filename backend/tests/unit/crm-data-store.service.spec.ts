import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CrmDataStoreService } from 'src/data/crm-data-store.service';

describe('CrmDataStoreService', () => {
  const originalCwd = process.cwd();
  const tempRoot = join(originalCwd, '.tmp-crm-store-tests');
  const seedDir = join(tempRoot, 'seed');
  const dbFile = join(tempRoot, '.data', 'crm-dev.json');

  beforeEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    mkdirSync(seedDir, { recursive: true });

    writeFileSync(
      join(seedDir, 'customers.seed.json'),
      JSON.stringify(
        [
          {
            id: 'cust_001',
            name: 'Riya Sharma',
            phone: '+919900000001',
            email: 'riya.sharma@example.com',
            language: 'en-IN',
            createdAt: '2026-03-10T10:00:00.000Z',
            updatedAt: '2026-03-10T10:00:00.000Z',
          },
        ],
        null,
        2,
      ),
      'utf8',
    );

    writeFileSync(
      join(seedDir, 'leads.seed.json'),
      JSON.stringify(
        [
          {
            id: 'lead_001',
            customerId: 'cust_001',
            funnelId: 'funnel_bob_credit_card',
            stageId: 'stage_mobile_verification',
            status: 'scheduled',
            callAttempts: 0,
            metadata: {},
            scheduledCallAt: '2026-03-10T10:00:00.000Z',
          },
        ],
        null,
        2,
      ),
      'utf8',
    );

    writeFileSync(
      join(seedDir, 'funnels.seed.json'),
      JSON.stringify(
        [
          {
            id: 'funnel_bob_credit_card',
            productId: 'product_bob_credit_card',
            title: 'Bank of Baroda Credit Card Funnel',
            description: 'Lead recovery workflow',
            isActive: true,
            policies: [],
            stages: [
              {
                id: 'stage_mobile_verification',
                funnelId: 'funnel_bob_credit_card',
                title: 'Mobile Verification',
                goal: 'Verify OTP',
                description: 'OTP stage',
                order: 1,
                isParallel: false,
                policies: [],
                systemObjections: [],
                customerObjections: [],
              },
            ],
          },
        ],
        null,
        2,
      ),
      'utf8',
    );

    writeFileSync(
      join(seedDir, 'funnel-contexts.seed.json'),
      JSON.stringify(
        [
          {
            customerId: 'cust_001',
            funnelId: 'funnel_bob_credit_card',
            currentStageId: 'stage_mobile_verification',
            completedStageIds: [],
            progressionHistory: [
              {
                stageId: 'stage_mobile_verification',
                enteredAt: '2026-03-10T10:00:00.000Z',
                outcome: 'dropped',
              },
            ],
            anticipatedObjections: [],
          },
        ],
        null,
        2,
      ),
      'utf8',
    );

    process.chdir(tempRoot);
    process.env.CRM_DB_PATH = dbFile;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    delete process.env.CRM_DB_PATH;
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('loads from seeds and creates dev db file', () => {
    const store = new CrmDataStoreService();

    const customers = store.listCustomers();
    const leads = store.listLeads();

    expect(customers).toHaveLength(1);
    expect(leads).toHaveLength(1);
    expect(customers[0].id).toBe('cust_001');
    expect(leads[0].id).toBe('lead_001');
    expect(existsSync(dbFile)).toBe(true);
  });

  it('persists lead status updates', () => {
    const store = new CrmDataStoreService();
    store.updateLeadStatus('lead_001', 'recovered');

    const reloaded = new CrmDataStoreService();
    const lead = reloaded.getLeadById('lead_001');

    expect(lead?.status).toBe('recovered');
  });
});
