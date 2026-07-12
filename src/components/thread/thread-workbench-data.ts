function buildDebugUrl(apiUrl: string, pathname: string): URL {
  const baseUrl = new URL(apiUrl);
  const basePath = baseUrl.pathname.replace(/\/$/, "");
  const debugBasePath = basePath.endsWith("/api")
    ? basePath || "/api"
    : `${basePath || ""}/api`;

  return new URL(
    `${debugBasePath}/${pathname}`.replace(/\/{2,}/g, "/"),
    baseUrl.origin,
  );
}

function buildDebugHeaders(args: {
  apiKey?: string | null;
  authScheme?: string | null;
}): Headers {
  const headers = new Headers();
  if (args.apiKey) {
    headers.set("X-Api-Key", args.apiKey);
  }
  if (args.authScheme) {
    headers.set("X-Auth-Scheme", args.authScheme);
  }
  return headers;
}

async function fetchJson<T>(args: {
  url: string;
  apiKey?: string | null;
  authScheme?: string | null;
  signal?: AbortSignal;
}): Promise<T> {
  const response = await fetch(args.url, {
    method: "GET",
    headers: buildDebugHeaders({
      apiKey: args.apiKey,
      authScheme: args.authScheme,
    }),
    signal: args.signal,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export type ChildThreadStateResponse = {
  thread_id: string;
  specialist: string;
  resolved?: {
    domain?: string;
    role?: string;
    agent_name?: string;
    child_namespace?: string;
    checkpoint_ns?: string;
  };
  snapshot?: unknown;
};

export type SkillListItem = {
  name?: string | null;
  description?: string | null;
  path: string;
  storage_key?: string | null;
  source?: string | null;
  owner_agent_name?: string | null;
  scene_names?: string[] | null;
  allowed_agent_names?: string[] | null;
  is_prompt_entry?: boolean | null;
  parent_path?: string | null;
  bundle_file_paths?: string[] | null;
  detail_file_paths?: string[] | null;
};

export type SkillsListResponse = {
  count: number;
  skills: SkillListItem[];
};

export type SkillFileResponse = {
  path: string;
  namespace?: string[] | null;
  storage_key?: string | null;
  exists: boolean;
  content?: string | null;
};

export type UserMemoryResponse = {
  current_user_id: string;
  exists?: boolean;
  source?: string | null;
  redis_key?: string | null;
  legacy_redis_key?: string | null;
  last_updated_at?: string | null;
  memory_md?: string | null;
};

export function buildChildStateUrl(args: {
  apiUrl: string;
  specialist: string;
  threadId: string;
}): string {
  const url = buildDebugUrl(args.apiUrl, "debug/child-state");
  url.searchParams.set("specialist", args.specialist);
  url.searchParams.set("thread_id", args.threadId);
  return url.toString();
}

export function buildSkillsListUrl(args: {
  apiUrl: string;
  agentName: string | null;
}): string {
  const url = buildDebugUrl(args.apiUrl, "debug/skills");
  if (args.agentName) {
    url.searchParams.set("agent_name", args.agentName);
  }
  return url.toString();
}

export function buildSkillFileUrl(args: {
  apiUrl: string;
  path: string;
}): string {
  const url = buildDebugUrl(args.apiUrl, "debug/skills/file");
  url.searchParams.set("path", args.path);
  return url.toString();
}

export function buildUserMemoryUrl(args: {
  apiUrl: string;
  currentUserId: string;
}): string {
  const url = buildDebugUrl(args.apiUrl, "debug/user-memory");
  url.searchParams.set("current_user_id", args.currentUserId);
  return url.toString();
}

export async function fetchChildThreadState(args: {
  apiUrl: string;
  specialist: string;
  threadId: string;
  apiKey?: string | null;
  authScheme?: string | null;
  signal?: AbortSignal;
}): Promise<ChildThreadStateResponse> {
  return fetchJson<ChildThreadStateResponse>({
    url: buildChildStateUrl({
      apiUrl: args.apiUrl,
      specialist: args.specialist,
      threadId: args.threadId,
    }),
    apiKey: args.apiKey,
    authScheme: args.authScheme,
    signal: args.signal,
  });
}

export async function fetchSkillsList(args: {
  apiUrl: string;
  agentName: string | null;
  apiKey?: string | null;
  authScheme?: string | null;
  signal?: AbortSignal;
}): Promise<SkillsListResponse> {
  return fetchJson<SkillsListResponse>({
    url: buildSkillsListUrl({
      apiUrl: args.apiUrl,
      agentName: args.agentName,
    }),
    apiKey: args.apiKey,
    authScheme: args.authScheme,
    signal: args.signal,
  });
}

export async function fetchSkillFile(args: {
  apiUrl: string;
  path: string;
  apiKey?: string | null;
  authScheme?: string | null;
  signal?: AbortSignal;
}): Promise<SkillFileResponse> {
  return fetchJson<SkillFileResponse>({
    url: buildSkillFileUrl({
      apiUrl: args.apiUrl,
      path: args.path,
    }),
    apiKey: args.apiKey,
    authScheme: args.authScheme,
    signal: args.signal,
  });
}

export async function fetchUserMemory(args: {
  apiUrl: string;
  currentUserId: string;
  apiKey?: string | null;
  authScheme?: string | null;
  signal?: AbortSignal;
}): Promise<UserMemoryResponse> {
  return fetchJson<UserMemoryResponse>({
    url: buildUserMemoryUrl({
      apiUrl: args.apiUrl,
      currentUserId: args.currentUserId,
    }),
    apiKey: args.apiKey,
    authScheme: args.authScheme,
    signal: args.signal,
  });
}
