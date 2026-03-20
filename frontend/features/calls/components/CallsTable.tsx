"use client";

import { Table } from "@/components/ui/table";
import type { CallSession } from "../types";

export function CallsTable({ calls }: { calls: CallSession[] }) {
  const columns = [
    { key: "lead", header: "Lead", render: (row: CallSession) => row.leadName },
    { key: "phone", header: "Phone", render: (row: CallSession) => row.phone },
    { key: "agent", header: "Agent", render: (row: CallSession) => row.agent ?? "-" },
    { key: "status", header: "Status", render: (row: CallSession) => row.status },
    { key: "startedAt", header: "Started", render: (row: CallSession) => new Date(row.startedAt).toLocaleString() },
    { key: "duration", header: "Duration", render: (row: CallSession) => (row.durationSeconds != null ? `${row.durationSeconds}s` : "n/a") },
  ];

  return <Table columns={columns} data={calls} getRowKey={(row) => row.id} emptyText="No active calls." />;
}
