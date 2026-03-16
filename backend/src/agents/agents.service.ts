import { Injectable } from '@nestjs/common';

export interface AgentPersona {
  id: string;
  name: string;
  language: string;
  voiceId: string;
  calls: number;
  avgScore: number;
  escalationRate: number;
}

export interface CreateAgentPayload {
  name?: string;
  language?: string;
  voiceId?: string;
}

@Injectable()
export class AgentsService {
  private readonly agents: AgentPersona[] = [
    {
      id: 'ag-1',
      name: 'Maya Hindi',
      language: 'hi-IN',
      voiceId: 'eleven-45',
      calls: 102,
      avgScore: 0.74,
      escalationRate: 0.16,
    },
    {
      id: 'ag-2',
      name: 'Arjun English',
      language: 'en-IN',
      voiceId: 'eleven-09',
      calls: 88,
      avgScore: 0.69,
      escalationRate: 0.2,
    },
  ];

  list(): AgentPersona[] {
    return this.agents.map((agent) => ({ ...agent }));
  }

  create(payload: CreateAgentPayload): AgentPersona {
    const name = payload.name?.trim();
    if (!name) {
      throw new Error('name is required');
    }

    const created: AgentPersona = {
      id: `ag-${Date.now()}`,
      name,
      language: payload.language?.trim() || 'en-IN',
      voiceId: payload.voiceId?.trim() || 'default-voice',
      calls: 0,
      avgScore: 0,
      escalationRate: 0,
    };

    this.agents.unshift(created);
    return { ...created };
  }
}
