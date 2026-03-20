"use client";

import { Table } from "@/components/ui/table";
import type { AgentProfile } from "../types";

export function AgentsTable({ agents }: { agents: AgentProfile[] }) {
  const columns = [
    { key: "name", header: "Name", render: (row: AgentProfile) => row.name },
    { key: "role", header: "Role", render: (row: AgentProfile) => row.role },
    { key: "status", header: "Status", render: (row: AgentProfile) => row.status },
    { key: "calls", header: "Calls", render: (row: AgentProfile) => row.callsHandled },
    { key: "rate", header: "Success", render: (row: AgentProfile) => `${(row.successRate * 100).toFixed(1)}%` },
    { key: "lastActive", header: "Last Active", render: (row: AgentProfile) => new Date(row.lastActive).toLocaleString() },
  ];

  return <Table columns={columns} data={agents} getRowKey={(row) => row.id} emptyText="No agents found." />;
}
