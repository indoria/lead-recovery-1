import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from 'src/app.module';

describe('Workflow Phase 3 Inspection API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists workflow configs', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/workflows')
      .expect(200);

    expect(response.body.workflows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workflowId: 'lead-recovery-call',
        }),
      ]),
    );
  });

  it('returns a dry-run execution plan', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/workflows/lead-recovery-call/plan')
      .expect(200);

    expect(response.body.plan.workflowId).toBe('lead-recovery-call');
    expect(response.body.plan.steps.map((step: { id: string }) => step.id)).toEqual([
      'customer-data-retrieval',
      'customer-context-acquisition',
      'call-preparation',
      'call-initiation',
      'welcome-message',
      'conversation-loop',
      'exception-handling',
      'conversation-logging',
    ]);
  });

  it('lists fused adapters and active fusion state', async () => {
    const adaptersResponse = await request(app.getHttpServer())
      .get('/api/adapters')
      .expect(200);
    const fusionsResponse = await request(app.getHttpServer())
      .get('/api/fusions')
      .expect(200);

    expect(adaptersResponse.body.fusedAdapters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'crm-context-fused-adapter' }),
        expect.objectContaining({ id: 'telephony-welcome-fused-adapter' }),
        expect.objectContaining({ id: 'full-conversational-ai-adapter' }),
      ]),
    );
    expect(fusionsResponse.body.workflows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workflowId: 'lead-recovery-call',
          activeFusionRuleIds: [],
        }),
      ]),
    );
  });
});