import { cache } from "react";
import { apiClient } from "@/lib/api/client";
import type { SettingsSection } from "./types";
import { logClientEvent } from "@/lib/telemetry/client";

export async function getSettingsSection(section: string): Promise<SettingsSection> {
  try {
    const response = await apiClient.get<SettingsSection>(`/settings/${encodeURIComponent(section)}`, { cache: "force-cache", next: { revalidate: 120 } });
    logClientEvent({ source: "settings-api", message: "Settings section loaded", type: "settings_fetch", section });
    return response;
  } catch (err) {
    logClientEvent({ source: "settings-api", message: "Failed loading settings section", type: "settings_fetch_error", section, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

export const getSettingsSectionCached = cache(async (section: string): Promise<SettingsSection> => {
  return getSettingsSection(section);
});
