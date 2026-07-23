import test from "node:test";
import assert from "node:assert/strict";

const { composeStreamContextValue } = await import(
  new URL("../stream-context-value.ts", import.meta.url).href
);

test("composeStreamContextValue preserves the v3 stream contract and branch compatibility", () => {
  const messages = [{ id: "message-1", type: "human", content: "hello" }];
  const submit = async () => undefined;
  const respond = async () => undefined;
  const respondAll = async () => undefined;
  const stop = async () => undefined;
  const getMessagesMetadata = () => ({
    parentCheckpointId: "checkpoint-1",
  });
  const setBranch = () => undefined;
  const streamValue = {
    values: { messages, ui: [] },
    messages,
    isLoading: false,
    isThreadLoading: false,
    error: undefined,
    interrupt: undefined,
    interrupts: [],
    analyticsState: { timeline: [] },
    thinkingState: { byRunId: {}, latestRunId: null },
    threadId: "thread-1",
    submit,
    respond,
    respondAll,
    stop,
  };

  const contextValue = composeStreamContextValue(streamValue, {
    getMessagesMetadata,
    setBranch,
  });

  assert.equal(contextValue.values.messages, contextValue.messages);
  assert.equal(contextValue.submit, submit);
  assert.equal(contextValue.respond, respond);
  assert.equal(contextValue.respondAll, respondAll);
  assert.equal(contextValue.stop, stop);
  assert.equal(contextValue.getMessagesMetadata, getMessagesMetadata);
  assert.equal(contextValue.setBranch, setBranch);
  assert.equal("streamMode" in contextValue, false);
  assert.equal("streamSubgraphs" in contextValue, false);
  assert.equal("streamResumable" in contextValue, false);
});
