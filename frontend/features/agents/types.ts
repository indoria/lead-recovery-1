export type AgentStatus = "online" | "offline" | "busy";

export interface AgentProfile {
  id: string;
  name: string;
  role: "admin" | "sales" | "support" | "bot";
  status: AgentStatus;
  callsHandled: number;
  successRate: number;
  lastActive: string;
}
