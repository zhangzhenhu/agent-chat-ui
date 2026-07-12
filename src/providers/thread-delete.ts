export function summarizeThreadDeleteSettledResults(
  threadIds: string[],
  results: PromiseSettledResult<void>[],
): {
  successIds: string[];
  failedIds: string[];
} {
  const successIds: string[] = [];
  const failedIds: string[] = [];

  results.forEach((result, index) => {
    const threadId = threadIds[index];
    if (!threadId) {
      return;
    }

    if (result.status === "fulfilled") {
      successIds.push(threadId);
    } else {
      failedIds.push(threadId);
    }
  });

  return { successIds, failedIds };
}

export function buildThreadDeleteErrorMessage(
  totalCount: number,
  failedCount: number,
): string {
  if (failedCount <= 0) {
    return "";
  }

  if (failedCount >= totalCount) {
    return "删除失败";
  }

  return `部分会话删除成功，仍有 ${failedCount} 条删除失败`;
}

const PROTECTED_THREAD_DELETE_HOST_SUFFIX = "demandintel.ecej.com";

export function getThreadDeletionDisabledReason(
  apiUrl: string | null | undefined,
): string | null {
  if (!apiUrl) {
    return null;
  }

  try {
    const hostname = new URL(apiUrl).hostname.toLowerCase();
    if (hostname.endsWith(PROTECTED_THREAD_DELETE_HOST_SUFFIX)) {
      return "已禁止对 demandintel.ecej.com 线上服务执行 thread 删除操作";
    }
  } catch {
    return null;
  }

  return null;
}
