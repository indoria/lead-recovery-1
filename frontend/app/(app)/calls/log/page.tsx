"use client";

import { useEffect, useState } from "react";
import { CallLogTable } from "@/features/calls/components/CallLogTable";
import { getCallHistory } from "@/features/calls/api";
import type { CallLogEntry } from "@/features/calls/types";
import { PageLoading } from "@/components/ui/loading";
import { ErrorDisplay } from "@/components/ui/error-display";

export default function CallLogPage() {
  const [logs, setLogs] = useState<CallLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getCallHistory()
      .then((data) => {
        if (mounted) setLogs(data);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <PageLoading />;
  if (error) return <ErrorDisplay message={error} />;

  return (
    <section>
      <h2>Call History</h2>
      <p>Historical call log records.</p>
      <CallLogTable logs={logs} />
    </section>
  );
}
