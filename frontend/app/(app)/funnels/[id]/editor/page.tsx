"use client";

import { useEffect, useState } from "react";
import { getFunnelById } from "@/features/funnels/api";
import type { FunnelDetail } from "@/features/funnels/types";
import { PageLoading } from "@/components/ui/loading";
import { ErrorDisplay } from "@/components/ui/error-display";

type Params = {
  id: string;
};

export default function FunnelEditorPage({ params }: { params: Params }) {
  const { id } = params;
  const [funnel, setFunnel] = useState<FunnelDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getFunnelById(id)
      .then((data) => {
        if (mounted) setFunnel(data);
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
  }, [id]);

  if (isLoading) return <PageLoading />;
  if (error) return <ErrorDisplay message={error} />;

  if (!funnel) {
    return <ErrorDisplay message="Funnel not found." />;
  }

  return (
    <section>
      <h2>Funnel Editor</h2>
      <p>{funnel.name}</p>
      <p>Status: {funnel.active ? "Active" : "Paused"}</p>
      <p>Stages: {funnel.stageCount}</p>
      <p>Last updated: {new Date(funnel.updatedAt).toLocaleString()}</p>
    </section>
  );
}
