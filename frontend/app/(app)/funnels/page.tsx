import dynamic from "next/dynamic";
import { getFunnelsCached } from "@/features/funnels/api";
import type { FunnelSummary } from "@/features/funnels/types";
import { ErrorDisplay } from "@/components/ui/error-display";

const FunnelsTable = dynamic(
  () => import("@/features/funnels/components/FunnelsTable").then((mod) => mod.FunnelsTable),
  { ssr: true, loading: () => <p>Loading funnel table…</p> }
);

export const revalidate = 60;

export const metadata = {
  title: "Funnels - Lead Recovery",
  description: "Funnel list and management for lead recovery workflows",
};

export default async function FunnelsPage() {
  let funnels: FunnelSummary[];

  try {
    funnels = await getFunnelsCached();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load funnels";
    return <ErrorDisplay message={message} />;
  }

  if (!funnels || funnels.length === 0) {
    return <ErrorDisplay message="No funnels found" />;
  }

  return (
    <section>
      <h1>Funnels</h1>
      <p>Visualize and manage workflow funnels.</p>
      <FunnelsTable funnels={funnels} />
    </section>
  );
}
