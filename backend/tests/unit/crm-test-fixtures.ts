import { MockCRMAdapter } from 'src/adapters/crm/mock-crm-adapter';
import { Customer } from 'src/common/models/customer.model';
import { Funnel, FunnelContext } from 'src/common/models/funnel.model';
import { Lead } from 'src/common/models/lead.model';
import { CustomerRepository } from 'src/repositories/customer.repository';
import { LeadRepository } from 'src/repositories/lead.repository';
import { FunnelContextRepository } from 'src/repositories/funnel-context.repository';

const now = new Date('2026-03-10T10:00:00.000Z');

export const customersFixture: Customer[] = [
  {
    id: 'cust_001',
    name: 'Riya Sharma',
    phone: '+919900000001',
    email: 'riya.sharma@example.com',
    language: 'en-IN',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'cust_002',
    name: 'Arjun Verma',
    phone: '+919900000002',
    email: 'arjun.verma@example.com',
    language: 'hi-IN',
    createdAt: now,
    updatedAt: now,
  },
];

export const leadsFixture: Lead[] = [
  {
    id: 'lead_001',
    customerId: 'cust_001',
    funnelId: 'funnel_bob_credit_card',
    stageId: 'stage_mobile_verification',
    status: 'scheduled',
    callAttempts: 0,
    dropOffReason: 'OTP not completed',
    metadata: {},
    scheduledCallAt: now,
  },
  {
    id: 'lead_002',
    customerId: 'cust_002',
    funnelId: 'funnel_bob_credit_card',
    stageId: 'stage_personal_details',
    status: 'pending',
    callAttempts: 1,
    metadata: {},
  },
];

export const funnelsFixture: Funnel[] = [
  {
    id: 'funnel_bob_credit_card',
    productId: 'product_bob_credit_card',
    title: 'Bank of Baroda Credit Card Funnel',
    description: 'Lead recovery workflow for the Bank of Baroda credit card journey.',
    isActive: true,
    policies: [],
    stages: [
      {
        id: 'stage_mobile_verification',
        funnelId: 'funnel_bob_credit_card',
        title: 'Mobile Verification',
        goal: 'Verify the customer mobile number and OTP.',
        description: 'Customer should complete OTP verification.',
        order: 1,
        isParallel: false,
        policies: [],
        systemObjections: [],
        customerObjections: [
          {
            id: 'obj_mobile_001',
            type: 'customer',
            title: 'Did not receive OTP',
            description: 'Customer did not receive or could not access the OTP.',
            handlingScript: 'Guide the customer to request a fresh OTP.',
            escalate: false,
          },
        ],
      },
      {
        id: 'stage_personal_details',
        funnelId: 'funnel_bob_credit_card',
        title: 'Personal Details',
        goal: 'Collect name, age, gender, and related details.',
        description: 'Customer should complete the personal details form.',
        order: 2,
        isParallel: false,
        policies: [],
        systemObjections: [
          {
            id: 'obj_personal_001',
            type: 'system',
            title: 'PAN detail mismatch',
            description: 'System validation failed because PAN data does not match the entered details.',
            handlingScript: 'Help the customer verify PAN inputs and retry.',
            escalate: true,
          },
        ],
        customerObjections: [],
      },
    ],
  },
];

export const funnelContextsFixture: FunnelContext[] = [
  {
    customerId: 'cust_001',
    funnelId: 'funnel_bob_credit_card',
    currentStageId: 'stage_mobile_verification',
    completedStageIds: [],
    progressionHistory: [
      {
        stageId: 'stage_mobile_verification',
        enteredAt: now,
        outcome: 'dropped',
        notes: 'Customer abandoned OTP verification.',
      },
    ],
    anticipatedObjections: [
      {
        id: 'obj_mobile_001',
        type: 'customer',
        title: 'Did not receive OTP',
        description: 'Customer did not receive or could not access the OTP.',
        handlingScript: 'Guide the customer to request a fresh OTP.',
        escalate: false,
      },
    ],
  },
  {
    customerId: 'cust_002',
    funnelId: 'funnel_bob_credit_card',
    currentStageId: 'stage_personal_details',
    completedStageIds: ['stage_mobile_verification'],
    progressionHistory: [
      {
        stageId: 'stage_mobile_verification',
        enteredAt: now,
        exitedAt: now,
        outcome: 'completed',
      },
      {
        stageId: 'stage_personal_details',
        enteredAt: now,
        outcome: 'dropped',
        notes: 'Customer abandoned during form entry.',
      },
    ],
    anticipatedObjections: [
      {
        id: 'obj_personal_001',
        type: 'system',
        title: 'PAN detail mismatch',
        description: 'System validation failed because PAN data does not match the entered details.',
        handlingScript: 'Help the customer verify PAN inputs and retry.',
        escalate: true,
      },
    ],
  },
];

export function createMockCRMAdapter(): MockCRMAdapter {
  const leads = structuredClone(leadsFixture);

  const customerRepository: CustomerRepository = {
    findAll: async () => structuredClone(customersFixture),
    findById: async (id: string) => structuredClone(customersFixture.find((entry) => entry.id === id) ?? null),
  };

  const leadRepository: LeadRepository = {
    findAll: async () => structuredClone(leads),
    findById: async (id: string) => structuredClone(leads.find((entry) => entry.id === id) ?? null),
    findByFunnelStage: async (funnelId: string, stageId: string) =>
      structuredClone(leads.filter((entry) => entry.funnelId === funnelId && entry.stageId === stageId)),
    updateStatus: async (leadId, status) => {
      const target = leads.find((entry) => entry.id === leadId);
      if (target) {
        target.status = status;
      }
    },
  };

  const funnelContextRepository: FunnelContextRepository = {
    findByCustomerAndFunnel: async (customerId: string, funnelId: string) =>
      structuredClone(
        funnelContextsFixture.find((entry) => entry.customerId === customerId && entry.funnelId === funnelId) ?? null,
      ),
  };

  return new MockCRMAdapter(customerRepository, leadRepository, funnelContextRepository);
}
