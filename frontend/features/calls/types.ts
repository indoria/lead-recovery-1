export type CallStatus = "active" | "completed" | "failed" | "queued";

export interface CallSession {
  id: string;
  leadName: string;
  phone: string;
  status: CallStatus;
  startedAt: string;
  durationSeconds?: number;
  agent?: string;
}

export interface CallLogEntry {
  id: string;
  callSessionId: string;
  leadName: string;
  phone: string;
  status: CallStatus;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  agent: string;
  notes?: string;
}
