"use client";

import { useEffect, useState } from "react";
import { CallsTable } from "@/features/calls/components/CallsTable";
import { getActiveCalls } from "@/features/calls/api";
import type { CallSession } from "@/features/calls/types";
import { PageLoading } from "@/components/ui/loading";
import { ErrorDisplay } from "@/components/ui/error-display";

export default function ActiveCallsPage() {
  const [calls, setCalls] = useState<CallSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getActiveCalls()
      .then((data) => {
        if (mounted) setCalls(data);
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
      <h2>Active Calls</h2>
      <p>Live call activity for in-progress calls.</p>
      <CallsTable calls={calls} />
    </section>
  );
}
