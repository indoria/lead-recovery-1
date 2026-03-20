"use client";

import { useEffect, useState } from "react";
import { getSettingsSection } from "@/features/settings/api";
import type { SettingsSection } from "@/features/settings/types";
import { PageLoading } from "@/components/ui/loading";
import { ErrorDisplay } from "@/components/ui/error-display";

type Params = {
  section: string;
};

export default function SettingsSectionPage({ params }: { params: Params }) {
  const { section } = params;
  const [settings, setSettings] = useState<SettingsSection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    getSettingsSection(section)
      .then((data) => {
        if (mounted) setSettings(data);
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
  }, [section]);

  if (loading) return <PageLoading />;
  if (error) return <ErrorDisplay message={error} />;

  return (
    <section>
      <h2>Settings · {section}</h2>
      {settings ? (
        <pre>{JSON.stringify(settings.data, null, 2)}</pre>
      ) : (
        <ErrorDisplay message="No settings found for this section" />
      )}
    </section>
  );
}
