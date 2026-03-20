"use client";

import { Table } from "@/components/ui/table";
import type { FunnelSummary } from "../types";

export function FunnelsTable({ funnels }: { funnels: FunnelSummary[] }) {
  const columns = [
    { key: "name", header: "Funnel", render: (row: FunnelSummary) => row.name },
    { key: "status", header: "Status", render: (row: FunnelSummary) => row.status },
    { key: "leads", header: "Leads", render: (row: FunnelSummary) => row.leads },
    { key: "conversionRate", header: "Conversion", render: (row: FunnelSummary) => `${(row.conversionRate * 100).toFixed(1)}%` },
  ];

  return <Table columns={columns} data={funnels} getRowKey={(row) => row.id} emptyText="No funnels available." />;
}
