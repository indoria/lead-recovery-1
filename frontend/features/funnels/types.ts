export interface FunnelSummary {
  id: string;
  name: string;
  status: "active" | "paused" | "draft";
  leads: number;
  conversionRate: number;
}

export interface FunnelDetail {
  id: string;
  name: string;
  stageCount: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}
