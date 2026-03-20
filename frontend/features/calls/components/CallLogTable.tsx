"use client";

import { Table } from "@/components/ui/table";
import type { CallLogEntry } from "../types";

export function CallLogTable({ logs }: { logs: CallLogEntry[] }) {
  const columns = [
    { key: "lead", header: "Lead", render: (row: CallLogEntry) => row.leadName },
    { key: "phone", header: "Phone", render: (row: CallLogEntry) => row.phone },
    { key: "agent", header: "Agent", render: (row: CallLogEntry) => row.agent },
    { key: "status", header: "Status", render: (row: CallLogEntry) => row.status },
    { key: "startedAt", header: "Started", render: (row: CallLogEntry) => new Date(row.startedAt).toLocaleString() },
    { key: "endedAt", header: "Ended", render: (row: CallLogEntry) => new Date(row.endedAt).toLocaleString() },
    { key: "duration", header: "Duration", render: (row: CallLogEntry) => `${row.durationSeconds}s` },
  ];

  return <Table columns={columns} data={logs} getRowKey={(row) => row.id} emptyText="No call history found." />;
}
