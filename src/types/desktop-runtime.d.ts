export {};

declare global {
  interface DesktopSettings {
    schemaVersion: number;
    selectedEnvironmentId: string;
    customEnvironments: Array<{
      id: string;
      name: string;
      apiUrl: string;
      builtIn: false;
    }>;
    builtInOverrides?: Record<string, { apiUrl: string }>;
    assistantIdsByEnvironment?: Record<string, string>;
    apiKey?: string;
    authScheme?: string;
  }

  interface Window {
    desktopRuntime?: {
      readonly isElectron: true;
      readonly platform: NodeJS.Platform;
      getSettings(): Promise<Partial<DesktopSettings>>;
      saveSettings(settings: DesktopSettings): Promise<void>;
    };
  }
}
