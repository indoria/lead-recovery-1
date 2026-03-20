"use client";

import { useEffect, useState } from "react";
import { getAgents } from "@/features/agents/api";
import type { AgentProfile } from "@/features/agents/types";
import { AgentsTable } from "@/features/agents/components/AgentsTable";
import { PageLoading } from "@/components/ui/loading";
import { ErrorDisplay } from "@/components/ui/error-display";

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getAgents()
      .then((data) => {
        if (mounted) setAgents(data);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading) return <PageLoading />;
  if (error) return <ErrorDisplay message={error} />;

  return (
    <section>
      <h2>Agents</h2>
      <p>Manage sales and support agents.</p>
      <AgentsTable agents={agents} />
    </section>
  );
}
