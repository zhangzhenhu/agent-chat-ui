import {
  buildChildStateUrl,
  buildRootStateUrl,
  fetchChildThreadState,
  fetchRootThreadState,
  type ChildThreadStateResponse,
  type RootThreadStateResponse,
} from "@/components/thread/thread-workbench-data";

export {
  buildChildStateUrl,
  buildRootStateUrl,
  fetchChildThreadState,
  fetchRootThreadState,
};
export type { ChildThreadStateResponse, RootThreadStateResponse };

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildRootStateCurl(args: {
  apiUrl: string;
  threadId: string;
}): string {
  return [
    "curl --request GET \\",
    `  --url ${shellSingleQuote(buildRootStateUrl(args))}`,
  ].join("\n");
}

export function buildChildStateCurl(args: {
  apiUrl: string;
  threadId: string;
  checkpointNs: string;
}): string {
  const body = JSON.stringify(
    {
      checkpoint: {
        thread_id: args.threadId,
        checkpoint_ns: args.checkpointNs,
        checkpoint_id: "",
        checkpoint_map: {},
      },
      subgraphs: true,
    },
    null,
    2,
  );

  return [
    "curl --request POST \\",
    `  --url ${shellSingleQuote(buildChildStateUrl(args))} \\`,
    "  --header 'Content-Type: application/json' \\",
    `  --data ${shellSingleQuote(body)}`,
  ].join("\n");
}

export function hasStateData(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== "object") return true;
  if (Array.isArray(value)) return value.length > 0;
  if ("checkpoint" in value && value.checkpoint === null) return false;
  return Object.keys(value).length > 0;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "请求失败";
}
