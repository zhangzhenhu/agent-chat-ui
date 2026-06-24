import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
} from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import { type Message } from "@langchain/langgraph-sdk";
import {
  uiMessageReducer,
  isUIMessage,
  isRemoveUIMessage,
  type UIMessage,
  type RemoveUIMessage,
} from "@langchain/langgraph-sdk/react-ui";
import { useQueryState } from "nuqs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LangGraphLogoSVG } from "@/components/icons/langgraph";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowRight, Loader2 } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { getApiKey } from "@/lib/api-key";
import { createClient } from "@/providers/client";
import { useThreads } from "./Thread";
import { toast } from "sonner";

export type StateType = { messages: Message[]; ui?: UIMessage[] };

const useTypedStream = useStream<
  StateType,
  {
    UpdateType: {
      messages?: Message[] | Message | string;
      ui?: (UIMessage | RemoveUIMessage)[] | UIMessage | RemoveUIMessage;
      context?: Record<string, unknown>;
    };
    CustomEventType: UIMessage | RemoveUIMessage;
  }
>;

type StreamContextType = ReturnType<typeof useTypedStream>;
const StreamContext = createContext<StreamContextType | undefined>(undefined);

type ConfigContextType = {
  apiUrl: string;
  setApiUrl: (url: string) => void;
  assistantId: string;
  setAssistantId: (id: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  authScheme: string;
  setAuthScheme: (scheme: string) => void;
  showConfig: boolean;
  setShowConfig: (show: boolean) => void;
};
const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

async function sleep(ms = 4000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkGraphStatus(
  apiUrl: string,
  apiKey: string | null,
  authScheme?: string,
): Promise<boolean> {
  try {
    const headers = new Headers();
    if (apiKey) headers.set("X-Api-Key", apiKey);
    if (authScheme) headers.set("X-Auth-Scheme", authScheme);

    const res = await fetch(`${apiUrl}/info`, {
      headers,
    });

    return res.ok;
  } catch (e) {
    console.error(e);
    return false;
  }
}

const StreamSession = ({
  children,
  apiKey,
  apiUrl,
  assistantId,
  authScheme,
}: {
  children: ReactNode;
  apiKey: string | null;
  apiUrl: string;
  assistantId: string;
  authScheme?: string;
}) => {
  const [threadId, setThreadId] = useQueryState("threadId");
  const { getThreads, setThreads } = useThreads();
  const streamValue = useTypedStream({
    apiUrl,
    apiKey: apiKey ?? undefined,
    assistantId,
    ...(authScheme && {
      defaultHeaders: {
        "X-Auth-Scheme": authScheme,
      },
    }),
    threadId: threadId ?? null,
    fetchStateHistory: true,
    onCustomEvent: (event, options) => {
      if (isUIMessage(event) || isRemoveUIMessage(event)) {
        options.mutate((prev) => {
          const ui = uiMessageReducer(prev.ui ?? [], event);
          return { ...prev, ui };
        });
      }
    },
    onThreadId: (id) => {
      setThreadId(id);
      sleep().then(() => getThreads().then(setThreads).catch(console.error));
    },
  });

  useEffect(() => {
    checkGraphStatus(apiUrl, apiKey, authScheme).then((ok) => {
      if (!ok) {
        toast.error("Failed to connect to LangGraph server", {
          description: () => (
            <p>
              Please ensure your graph is running at <code>{apiUrl}</code> and
              your API key is correctly set (if connecting to a deployed graph).
            </p>
          ),
          duration: 10000,
          richColors: true,
          closeButton: true,
        });
      }
    });
  }, [apiKey, apiUrl, authScheme]);

  return (
    <StreamContext.Provider value={streamValue}>
      {children}
    </StreamContext.Provider>
  );
};

/**
 * When assistantId is not yet set, fetch assistants from the server
 * and auto-select the first one. Shows a loading state while fetching.
 */
function AssistantGate({
  children,
  apiKey,
  apiUrl,
  assistantId,
  setAssistantId,
  authScheme,
}: {
  children: ReactNode;
  apiKey: string;
  apiUrl: string;
  assistantId: string | undefined;
  setAssistantId: (id: string) => void;
  authScheme: string;
}) {
  const [loading, setLoading] = useState(!assistantId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (assistantId) {
      setLoading(false);
      return;
    }
    if (!apiUrl) return;

    setLoading(true);
    setError(null);
    const client = createClient(apiUrl, apiKey || undefined, authScheme || undefined);
    client.assistants
      .search({ limit: 100 })
      .then((result) => {
        const list = Array.isArray(result) ? result : [];
        if (list.length > 0) {
          setAssistantId(list[0].assistant_id);
        } else {
          setError("No assistants found on this server. Please create one first.");
        }
      })
      .catch((err) => {
        console.error("Failed to fetch assistants:", err);
        setError("Failed to fetch assistants. Check your deployment URL.");
      })
      .finally(() => setLoading(false));
  }, [apiUrl, assistantId]);

  if (loading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-8 animate-spin text-blue-500" />
          <p className="text-muted-foreground">Fetching assistants...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-red-500">{error}</p>
          <Button variant="outline" onClick={() => setAssistantId("")}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  if (!assistantId) return null;

  return (
    <StreamSession
      apiKey={apiKey}
      apiUrl={apiUrl}
      assistantId={assistantId}
      authScheme={authScheme || undefined}
    >
      {children}
    </StreamSession>
  );
}

// Default values for the form
const DEFAULT_API_URL = "http://localhost:2024";
const AGENT_BUILDER_AUTH_SCHEME = "langsmith-api-key";

export const StreamProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const envApiUrl: string | undefined = process.env.NEXT_PUBLIC_API_URL;
  const envAssistantId: string | undefined =
    process.env.NEXT_PUBLIC_ASSISTANT_ID;
  const envAuthScheme: string | undefined = process.env.NEXT_PUBLIC_AUTH_SCHEME;

  const [apiUrl, setApiUrl] = useQueryState("apiUrl", {
    defaultValue: envApiUrl || "",
  });
  const [assistantId, setAssistantId] = useQueryState("assistantId", {
    defaultValue: envAssistantId || "",
  });
  const [authScheme, setAuthScheme] = useQueryState("authScheme", {
    defaultValue: envAuthScheme || "",
  });
  const [showConfig, setShowConfig] = useQueryState("showConfig", {
    defaultValue: "",
  });
  const [isAgentBuilder, setIsAgentBuilder] = useState(
    () =>
      (authScheme || envAuthScheme || "").toLowerCase() ===
      AGENT_BUILDER_AUTH_SCHEME,
  );

  const [apiKey, _setApiKey] = useState(() => {
    const storedKey = getApiKey();
    return storedKey || "";
  });

  const setApiKey = (key: string) => {
    window.localStorage.setItem("lg:chat:apiKey", key);
    _setApiKey(key);
  };

  const finalApiUrl = apiUrl || envApiUrl;
  const finalAssistantId = assistantId || envAssistantId;
  const finalAuthScheme = authScheme || envAuthScheme || "";

  // Only require URL; assistantId is auto-selected from server
  const showConfigForm = showConfig === "true" || !finalApiUrl;
  const isConfigOverlay = showConfig === "true" && !!finalApiUrl;

  if (showConfigForm) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-4">
        <div className="animate-in fade-in-0 zoom-in-95 bg-background flex max-w-3xl flex-col rounded-lg border shadow-lg">
          <div className="mt-14 flex flex-col gap-2 border-b p-6">
            <div className="flex flex-col items-start gap-2">
              <LangGraphLogoSVG className="h-7" />
              <h1 className="text-xl font-semibold tracking-tight">
                Agent Chat
              </h1>
            </div>
            <p className="text-muted-foreground">
              {isConfigOverlay
                ? "Update your deployment configuration below."
                : "Welcome to Agent Chat! Enter your LangGraph deployment URL to get started."}
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();

              const form = e.target as HTMLFormElement;
              const formData = new FormData(form);
              const newApiUrl = formData.get("apiUrl") as string;
              const newApiKey = formData.get("apiKey") as string;

              setApiUrl(newApiUrl);
              setApiKey(newApiKey);
              setAuthScheme(isAgentBuilder ? AGENT_BUILDER_AUTH_SCHEME : "");
              setShowConfig("");

              form.reset();
            }}
            className="bg-muted/50 flex flex-col gap-6 p-6"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="apiUrl">
                Deployment URL<span className="text-rose-500">*</span>
              </Label>
              <p className="text-muted-foreground text-sm">
                This is the URL of your LangGraph deployment. Can be a local, or
                production deployment.
              </p>
              <Input
                id="apiUrl"
                name="apiUrl"
                className="bg-background"
                defaultValue={apiUrl || DEFAULT_API_URL}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="apiKey">LangSmith API Key</Label>
              <p className="text-muted-foreground text-sm">
                This is <strong>NOT</strong> required if using a local LangGraph
                server. This value is stored in your browser's local storage and
                is only used to authenticate requests sent to your LangGraph
                server.
              </p>
              <PasswordInput
                id="apiKey"
                name="apiKey"
                defaultValue={apiKey ?? ""}
                className="bg-background"
                placeholder="lsv2_pt_..."
              />
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="agentBuilderEnabled">
                    Built with Agent Builder
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    Enable this for Agent Builder deployments.
                  </p>
                </div>
                <Switch
                  id="agentBuilderEnabled"
                  checked={isAgentBuilder}
                  onCheckedChange={setIsAgentBuilder}
                />
              </div>
            </div>

            <div className="mt-2 flex justify-end gap-3">
              {isConfigOverlay && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => setShowConfig("")}
                >
                  Cancel
                </Button>
              )}
              <Button type="submit" size="lg">
                {isConfigOverlay ? "Update" : "Continue"}
                <ArrowRight className="size-5" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const configContextValue: ConfigContextType = {
    apiUrl: apiUrl || "",
    setApiUrl,
    assistantId: assistantId || "",
    setAssistantId,
    apiKey,
    setApiKey,
    authScheme: authScheme || "",
    setAuthScheme,
    showConfig: showConfig === "true",
    setShowConfig: (show: boolean) => setShowConfig(show ? "true" : ""),
  };

  return (
    <ConfigContext.Provider value={configContextValue}>
      <AssistantGate
        apiKey={apiKey}
        apiUrl={finalApiUrl}
        assistantId={finalAssistantId}
        setAssistantId={setAssistantId}
        authScheme={finalAuthScheme}
      >
        {children}
      </AssistantGate>
    </ConfigContext.Provider>
  );
};

export const useStreamContext = (): StreamContextType => {
  const context = useContext(StreamContext);
  if (context === undefined) {
    throw new Error("useStreamContext must be used within a StreamProvider");
  }
  return context;
};

export const useConfigContext = (): ConfigContextType => {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error("useConfigContext must be used within a StreamProvider");
  }
  return context;
};

export default StreamContext;