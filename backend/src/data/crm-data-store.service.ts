import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { join } from 'path';
import { Customer } from '../common/models/customer.model';
import { Funnel, FunnelContext, ProgressionEvent } from '../common/models/funnel.model';
import { Lead, LeadStatus } from '../common/models/lead.model';

interface CrmDbShape {
  customers: Customer[];
  leads: Lead[];
  funnels: Funnel[];
  funnelContexts: FunnelContext[];
}

@Injectable()
export class CrmDataStoreService {
  private readonly dbPath: string;
  private loaded = false;
  private state: CrmDbShape = {
    customers: [],
    leads: [],
    funnels: [],
    funnelContexts: [],
  };

  constructor() {
    this.dbPath = process.env.CRM_DB_PATH ?? join(process.cwd(), '.data', 'crm-dev.json');
    this.ensureLoaded();
  }

  listCustomers(): Customer[] {
    this.ensureLoaded();
    return structuredClone(this.state.customers);
  }

  listLeads(): Lead[] {
    this.ensureLoaded();
    return structuredClone(this.state.leads);
  }

  listFunnels(): Funnel[] {
    this.ensureLoaded();
    return structuredClone(this.state.funnels);
  }

  listFunnelContexts(): FunnelContext[] {
    this.ensureLoaded();
    return structuredClone(this.state.funnelContexts);
  }

  getCustomerById(id: string): Customer | undefined {
    this.ensureLoaded();
    return structuredClone(this.state.customers.find((entry) => entry.id === id));
  }

  getLeadById(id: string): Lead | undefined {
    this.ensureLoaded();
    return structuredClone(this.state.leads.find((entry) => entry.id === id));
  }

  getLeadsByFunnelStage(funnelId: string, stageId: string): Lead[] {
    this.ensureLoaded();
    return structuredClone(this.state.leads.filter((entry) => entry.funnelId === funnelId && entry.stageId === stageId));
  }

  updateLeadStatus(leadId: string, status: LeadStatus): void {
    this.ensureLoaded();
    const lead = this.state.leads.find((entry) => entry.id === leadId);
    if (!lead) {
      return;
    }
    lead.status = status;
    this.persist();
  }

  getFunnelById(id: string): Funnel | undefined {
    this.ensureLoaded();
    return structuredClone(this.state.funnels.find((entry) => entry.id === id));
  }

  updateFunnel(id: string, next: Funnel): Funnel | undefined {
    this.ensureLoaded();
    const index = this.state.funnels.findIndex((entry) => entry.id === id);
    if (index < 0) {
      return undefined;
    }
    this.state.funnels[index] = structuredClone(next);
    this.persist();
    return structuredClone(this.state.funnels[index]);
  }

  getFunnelContext(customerId: string, funnelId: string): FunnelContext | undefined {
    this.ensureLoaded();
    return structuredClone(
      this.state.funnelContexts.find((entry) => entry.customerId === customerId && entry.funnelId === funnelId),
    );
  }

  private ensureLoaded(): void {
    if (this.loaded) {
      return;
    }

    if (existsSync(this.dbPath)) {
      const parsed = JSON.parse(readFileSync(this.dbPath, 'utf8')) as Partial<CrmDbShape> & {
        ['funnel-contexts']?: FunnelContext[];
      };
      this.state = this.hydrate(parsed);
      this.loaded = true;
      return;
    }

    this.state = this.loadFromSeeds();
    this.persist();
    this.loaded = true;
  }

  private loadFromSeeds(): CrmDbShape {
    const seedDir = join(process.cwd(), 'seed');
    const readSeed = <T>(fileName: string): T[] => {
      const filePath = join(seedDir, fileName);
      if (!existsSync(filePath)) {
        return [];
      }
      return JSON.parse(readFileSync(filePath, 'utf8')) as T[];
    };

    return this.hydrate({
      customers: readSeed<Customer>('customers.seed.json'),
      leads: readSeed<Lead>('leads.seed.json'),
      funnels: readSeed<Funnel>('funnels.seed.json'),
      funnelContexts: readSeed<FunnelContext>('funnel-contexts.seed.json'),
    });
  }

  private hydrate(raw: Partial<CrmDbShape> & { ['funnel-contexts']?: FunnelContext[] }): CrmDbShape {
    const now = new Date();
    return {
      customers: (raw.customers ?? []).map((entry) => ({
        ...entry,
        createdAt: entry.createdAt ? new Date(entry.createdAt) : now,
        updatedAt: entry.updatedAt ? new Date(entry.updatedAt) : now,
      })),
      leads: (raw.leads ?? []).map((entry) => ({
        ...entry,
        scheduledCallAt: entry.scheduledCallAt ? new Date(entry.scheduledCallAt) : undefined,
        lastContactedAt: entry.lastContactedAt ? new Date(entry.lastContactedAt) : undefined,
      })),
      funnels: raw.funnels ?? [],
      funnelContexts: ((raw.funnelContexts ?? raw['funnel-contexts']) ?? []).map((entry) => ({
        ...entry,
        progressionHistory: (entry.progressionHistory ?? []).map((event: ProgressionEvent) => ({
          ...event,
          enteredAt: new Date(event.enteredAt),
          exitedAt: event.exitedAt ? new Date(event.exitedAt) : undefined,
        })),
      })),
    };
  }

  private persist(): void {
    const targetDir = dirname(this.dbPath);
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(this.dbPath, JSON.stringify(this.state, null, 2), 'utf8');
  }
}
