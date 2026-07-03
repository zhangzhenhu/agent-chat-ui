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
