"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type RuntimeEnvironment = {
  id: string;
  name: string;
  apiUrl: string;
  builtIn: boolean;
};

export const BUILTIN_ENVIRONMENTS: RuntimeEnvironment[] = [
  {
    id: "local",
    name: "Local",
    apiUrl: "http://localhost:8000",
    builtIn: true,
  },
  {
    id: "si",
    name: "SI",
    apiUrl: "https://sidemandintel.ecej.com",
    builtIn: true,
  },
  {
    id: "st",
    name: "ST",
    apiUrl: "https://stdemandintel.ecej.com",
    builtIn: true,
  },
  {
    id: "prod",
    name: "Production",
    apiUrl: "https://demandintel.ecej.com",
    builtIn: true,
  },
];

const SETTINGS_VERSION = 1;
const DEFAULT_ENVIRONMENT_ID = "st";

type RuntimeConfigValue = {
  isElectron: boolean;
  ready: boolean;
  error: string | null;
  environmentId: string;
  environments: RuntimeEnvironment[];
  apiUrl: string;
  assistantId: string;
  apiKey: string;
  authScheme: string;
  setApiUrl: (url: string) => void;
  setAssistantId: (id: string) => void;
  setApiKey: (key: string) => void;
  setAuthScheme: (scheme: string) => void;
  selectEnvironment: (id: string, apiUrl?: string) => void;
  saveEnvironment: (environment: RuntimeEnvironment) => void;
  deleteEnvironment: (id: string) => void;
  retry: () => void;
};

const RuntimeConfigContext = createContext<RuntimeConfigValue | undefined>(
  undefined,
);

function normalizeApiUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Only http and https URLs are supported");
  if (url.username || url.password || url.hash)
    throw new Error("URL credentials and fragments are not supported");
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function settingsToState(settings: Partial<DesktopSettings>) {
  const overrides = settings.builtInOverrides ?? {};
  const builtIns = BUILTIN_ENVIRONMENTS.map((environment) => ({
    ...environment,
    apiUrl: overrides[environment.id]?.apiUrl
      ? normalizeApiUrl(overrides[environment.id].apiUrl)
      : environment.apiUrl,
  }));
  const customs = Array.isArray(settings.customEnvironments)
    ? settings.customEnvironments
        .filter(
          (item) =>
            item &&
            typeof item.id === "string" &&
            typeof item.name === "string" &&
            typeof item.apiUrl === "string",
        )
        .map((item) => ({
          ...item,
          builtIn: false,
          apiUrl: normalizeApiUrl(item.apiUrl),
        }))
    : [];
  const environments = [...builtIns, ...customs];
  const selected = environments.some(
    (item) => item.id === settings.selectedEnvironmentId,
  )
    ? (settings.selectedEnvironmentId ?? DEFAULT_ENVIRONMENT_ID)
    : DEFAULT_ENVIRONMENT_ID;
  return {
    environments,
    selected,
    assistantIds: settings.assistantIdsByEnvironment ?? {},
    apiKey: settings.apiKey ?? "",
  };
}

export function RuntimeConfigProvider({ children }: { children: ReactNode }) {
  const isElectron =
    typeof window !== "undefined" && Boolean(window.desktopRuntime?.isElectron);
  const [ready, setReady] = useState(!isElectron);
  const [error, setError] = useState<string | null>(null);
  const [environmentId, setEnvironmentId] = useState(DEFAULT_ENVIRONMENT_ID);
  const [environments, setEnvironments] = useState(BUILTIN_ENVIRONMENTS);
  const [assistantIds, setAssistantIds] = useState<Record<string, string>>({});
  const [apiKey, setApiKeyState] = useState("");
  const [authScheme, setAuthSchemeState] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  const persist = useCallback(
    async (next: {
      environmentId: string;
      environments: RuntimeEnvironment[];
      assistantIds: Record<string, string>;
      apiKey: string;
      authScheme: string;
    }) => {
      if (!isElectron || !window.desktopRuntime) return;
      const builtInOverrides = Object.fromEntries(
        next.environments
          .filter((item) => item.builtIn)
          .map((item) => [item.id, { apiUrl: item.apiUrl }]),
      );
      await window.desktopRuntime.saveSettings({
        schemaVersion: SETTINGS_VERSION,
        selectedEnvironmentId: next.environmentId,
        customEnvironments: next.environments.filter(
          (item) => !item.builtIn,
        ) as DesktopSettings["customEnvironments"],
        builtInOverrides,
        assistantIdsByEnvironment: next.assistantIds,
        apiKey: next.apiKey,
        authScheme: next.authScheme,
      });
    },
    [isElectron],
  );

  const update = useCallback(
    (
      changes: Partial<{
        environmentId: string;
        environments: RuntimeEnvironment[];
        assistantIds: Record<string, string>;
        apiKey: string;
        authScheme: string;
      }>,
    ) => {
      const next = {
        environmentId: changes.environmentId ?? environmentId,
        environments: changes.environments ?? environments,
        assistantIds: changes.assistantIds ?? assistantIds,
        apiKey: changes.apiKey ?? apiKey,
        authScheme: changes.authScheme ?? authScheme,
      };
      setEnvironmentId(next.environmentId);
      setEnvironments(next.environments);
      setAssistantIds(next.assistantIds);
      setApiKeyState(next.apiKey);
      setAuthSchemeState(next.authScheme);
      void persist(next).catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Failed to save settings",
        ),
      );
    },
    [apiKey, assistantIds, authScheme, environmentId, environments, persist],
  );

  const retry = useCallback(() => setLoadAttempt((attempt) => attempt + 1), []);
  useEffect(() => {
    if (!isElectron || !window.desktopRuntime) return;
    let cancelled = false;
    setReady(false);
    window.desktopRuntime
      .getSettings()
      .then((settings) => {
        if (cancelled) return;
        try {
          const state = settingsToState(settings);
          setEnvironments(state.environments);
          setEnvironmentId(state.selected);
          setAssistantIds(state.assistantIds);
          setApiKeyState(state.apiKey);
          setAuthSchemeState(settings.authScheme ?? "");
          setError(null);
          setReady(true);
        } catch (reason) {
          setError(
            reason instanceof Error ? reason.message : "Invalid settings",
          );
          setReady(true);
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Failed to load settings",
          );
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isElectron, loadAttempt]);

  const selected =
    environments.find((item) => item.id === environmentId) ?? environments[0];
  const value = useMemo<RuntimeConfigValue>(
    () => ({
      isElectron,
      ready,
      error,
      environmentId,
      environments,
      apiUrl: selected?.apiUrl ?? "",
      assistantId: assistantIds[environmentId] ?? "",
      apiKey,
      authScheme,
      setApiUrl: (url) => {
        try {
          const normalized = normalizeApiUrl(url);
          update({
            environments: environments.map((item) =>
              item.id === environmentId
                ? { ...item, apiUrl: normalized }
                : item,
            ),
          });
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Invalid URL");
        }
      },
      setAssistantId: (id) =>
        update({ assistantIds: { ...assistantIds, [environmentId]: id } }),
      setApiKey: (key) => update({ apiKey: key }),
      setAuthScheme: (scheme) => update({ authScheme: scheme }),
      selectEnvironment: (id, apiUrl) => {
        if (!environments.some((item) => item.id === id)) return;
        if (apiUrl === undefined) update({ environmentId: id });
        else {
          try {
            const normalized = normalizeApiUrl(apiUrl);
            const current = environments.find((item) => item.id === id);
            update({
              environmentId: id,
              environments: environments.map((item) =>
                item.id === id ? { ...item, apiUrl: normalized } : item,
              ),
              // A changed deployment can expose a different assistant set.
              // Clear only the target environment's cached assistant ID.
              assistantIds:
                current?.apiUrl === normalized
                  ? assistantIds
                  : { ...assistantIds, [id]: "" },
            });
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Invalid URL");
          }
        }
      },
      saveEnvironment: (environment) => {
        try {
          const normalized = {
            ...environment,
            apiUrl: normalizeApiUrl(environment.apiUrl),
          };
          update({
            environments: environments.some(
              (item) => item.id === environment.id,
            )
              ? environments.map((item) =>
                  item.id === environment.id ? normalized : item,
                )
              : [...environments, normalized],
          });
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Invalid URL");
        }
      },
      deleteEnvironment: (id) => {
        if (BUILTIN_ENVIRONMENTS.some((item) => item.id === id)) return;
        const next = environments.filter((item) => item.id !== id);
        update({
          environments: next,
          environmentId:
            id === environmentId ? DEFAULT_ENVIRONMENT_ID : environmentId,
        });
      },
      retry,
    }),
    [
      apiKey,
      assistantIds,
      authScheme,
      environmentId,
      environments,
      error,
      isElectron,
      ready,
      retry,
      selected,
      update,
    ],
  );

  return (
    <RuntimeConfigContext.Provider value={value}>
      {isElectron && !ready ? (
        <div className="text-muted-foreground flex min-h-screen w-full items-center justify-center text-sm">
          Loading desktop settings...
        </div>
      ) : (
        children
      )}
    </RuntimeConfigContext.Provider>
  );
}

export function useRuntimeConfig() {
  const context = useContext(RuntimeConfigContext);
  if (!context)
    throw new Error(
      "useRuntimeConfig must be used within RuntimeConfigProvider",
    );
  return context;
}
