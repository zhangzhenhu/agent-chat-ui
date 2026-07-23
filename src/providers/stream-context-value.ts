export function composeStreamContextValue<
  T extends {
    values: { messages: unknown[] };
    messages: unknown[];
  },
  TBranch extends object,
>(streamValue: T, branch: TBranch): T & TBranch {
  return {
    ...streamValue,
    ...branch,
  };
}
