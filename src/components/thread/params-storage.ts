import type { CustomParams } from "./params-panel";

export const PARAMS_STORAGE_KEY = "agent-chat-ui:custom-params-draft";
export const PARAMS_PROFILES_STORAGE_KEY = "agent-chat-ui:parameters-profiles";
export const LEGACY_PARAMS_STORAGE_KEY = PARAMS_STORAGE_KEY;

export type StoredParamsDraft = CustomParams & {
  configurableText: string;
  inputText: string;
};

export type ParamsProfile = {
  id: string;
  name: string;
  configurableText: string;
  inputText: string;
  updatedAt: string;
};

export type ParamsProfileStore = {
  version: 1;
  activeProfileId: string;
  profiles: ParamsProfile[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeJsonObjectParse(text: string): Record<string, unknown> | null {
  if (!text.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function buildStoredParamsDraft(args: {
  configurableText: string;
  inputText: string;
}): StoredParamsDraft {
  return {
    configurableText: args.configurableText,
    inputText: args.inputText,
    configurable: safeJsonObjectParse(args.configurableText),
    input: safeJsonObjectParse(args.inputText),
  };
}

export function parseStoredParamsDraft(
  text: string | null | undefined,
): StoredParamsDraft | null {
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    if (!isPlainObject(parsed)) {
      return null;
    }

    const configurableText =
      typeof parsed.configurableText === "string" ? parsed.configurableText : "";
    const inputText =
      typeof parsed.inputText === "string" ? parsed.inputText : "";

    return buildStoredParamsDraft({
      configurableText,
      inputText,
    });
  } catch {
    return null;
  }
}

export function getStoredParamsDraftText(args: {
  configurableText: string;
  inputText: string;
}): string {
  return JSON.stringify({
    configurableText: args.configurableText,
    inputText: args.inputText,
  });
}

function isParamsProfile(value: unknown): value is ParamsProfile {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    value.id.trim() !== "" &&
    typeof value.name === "string" &&
    value.name.trim() !== "" &&
    typeof value.configurableText === "string" &&
    typeof value.inputText === "string" &&
    typeof value.updatedAt === "string"
  );
}

export function parseParamsProfileStore(
  text: string | null | undefined,
): ParamsProfileStore | null {
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    if (
      !isPlainObject(parsed) ||
      parsed.version !== 1 ||
      typeof parsed.activeProfileId !== "string" ||
      !Array.isArray(parsed.profiles) ||
      parsed.profiles.length === 0 ||
      !parsed.profiles.every(isParamsProfile)
    ) {
      return null;
    }

    const profiles = parsed.profiles;
    if (!profiles.some((profile) => profile.id === parsed.activeProfileId)) {
      return null;
    }

    return {
      version: 1,
      activeProfileId: parsed.activeProfileId,
      profiles,
    };
  } catch {
    return null;
  }
}

export function serializeParamsProfileStore(
  store: ParamsProfileStore,
): string {
  return JSON.stringify(store);
}

export function migrateStoredParamsDraft(args: {
  legacyDraft: StoredParamsDraft;
  id: string;
  updatedAt: string;
}): ParamsProfileStore {
  return {
    version: 1,
    activeProfileId: args.id,
    profiles: [
      {
        id: args.id,
        name: "Untitled profile",
        configurableText: args.legacyDraft.configurableText,
        inputText: args.legacyDraft.inputText,
        updatedAt: args.updatedAt,
      },
    ],
  };
}

function normalizeProfileName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new Error("Profile name is required");
  }
  return normalized;
}

export function createParamsProfile(args: {
  id: string;
  name: string;
  configurableText?: string;
  inputText?: string;
  updatedAt: string;
}): ParamsProfile {
  return {
    id: args.id,
    name: normalizeProfileName(args.name),
    configurableText: args.configurableText ?? "",
    inputText: args.inputText ?? "",
    updatedAt: args.updatedAt,
  };
}

export function createParamsProfileStore(
  profile: ParamsProfile,
): ParamsProfileStore {
  return {
    version: 1,
    activeProfileId: profile.id,
    profiles: [profile],
  };
}

export function createInitialParamsProfileStore(args: {
  defaults: CustomParams | null;
  id: string;
  updatedAt: string;
}): ParamsProfileStore {
  return createParamsProfileStore(
    createParamsProfile({
      id: args.id,
      name: "Untitled profile",
      configurableText: args.defaults?.configurable
        ? JSON.stringify(args.defaults.configurable, null, 2)
        : "",
      inputText: args.defaults?.input
        ? JSON.stringify(args.defaults.input, null, 2)
        : "",
      updatedAt: args.updatedAt,
    }),
  );
}

export function getActiveParamsProfile(
  store: ParamsProfileStore,
): ParamsProfile {
  const profile = store.profiles.find(
    (candidate) => candidate.id === store.activeProfileId,
  );
  if (!profile) {
    throw new Error("Active parameter profile is missing");
  }
  return profile;
}

export function appendAndSelectParamsProfile(
  store: ParamsProfileStore,
  profile: ParamsProfile,
): ParamsProfileStore {
  if (store.profiles.some((candidate) => candidate.id === profile.id)) {
    throw new Error("Parameter profile ID already exists");
  }
  return {
    ...store,
    activeProfileId: profile.id,
    profiles: [...store.profiles, profile],
  };
}

export function selectParamsProfile(
  store: ParamsProfileStore,
  profileId: string,
): ParamsProfileStore {
  if (!store.profiles.some((profile) => profile.id === profileId)) {
    throw new Error("Parameter profile does not exist");
  }
  return {
    ...store,
    activeProfileId: profileId,
  };
}

export function updateActiveParamsProfile(
  store: ParamsProfileStore,
  texts: Pick<ParamsProfile, "configurableText" | "inputText">,
  updatedAt: string,
): ParamsProfileStore {
  return {
    ...store,
    profiles: store.profiles.map((profile) =>
      profile.id === store.activeProfileId
        ? { ...profile, ...texts, updatedAt }
        : profile,
    ),
  };
}

export function renameActiveParamsProfile(
  store: ParamsProfileStore,
  name: string,
  updatedAt: string,
): ParamsProfileStore {
  const normalizedName = normalizeProfileName(name);
  return {
    ...store,
    profiles: store.profiles.map((profile) =>
      profile.id === store.activeProfileId
        ? { ...profile, name: normalizedName, updatedAt }
        : profile,
    ),
  };
}

export function deleteActiveParamsProfile(
  store: ParamsProfileStore,
): ParamsProfileStore | null {
  const activeIndex = store.profiles.findIndex(
    (profile) => profile.id === store.activeProfileId,
  );
  if (activeIndex === -1) {
    throw new Error("Active parameter profile is missing");
  }

  const profiles = store.profiles.filter(
    (profile) => profile.id !== store.activeProfileId,
  );
  if (profiles.length === 0) {
    return null;
  }

  return {
    ...store,
    activeProfileId: profiles[Math.min(activeIndex, profiles.length - 1)].id,
    profiles,
  };
}
