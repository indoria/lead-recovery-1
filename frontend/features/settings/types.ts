export interface SettingsSection {
  key: string;
  title: string;
  description: string;
  data: Record<string, unknown>;
}
