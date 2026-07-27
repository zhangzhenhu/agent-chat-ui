import test from "node:test";
import assert from "node:assert/strict";

const { isUserVisibleAiMessage, isUserVisibleUiMessage } = await import(
  new URL("../message-visibility.ts", import.meta.url).href
);

test("only explicitly marked AI messages are user-visible", () => {
  assert.equal(
    isUserVisibleAiMessage({
      id: "delivery-1",
      type: "ai",
      content: "给用户的文本",
      additional_kwargs: { user_visible: true },
    }),
    true,
  );
  assert.equal(
    isUserVisibleAiMessage({
      id: "internal-1",
      type: "ai",
      content: "内部工具调用说明",
      additional_kwargs: { user_visible: false },
    }),
    false,
  );
  assert.equal(
    isUserVisibleAiMessage({
      id: "legacy-delivery-1",
      type: "ai",
      content: "旧投影文本",
      additional_kwargs: { familyagent_user_visible: true },
    }),
    true,
  );
  assert.equal(
    isUserVisibleAiMessage({
      id: "unmarked-1",
      type: "ai",
      content: "未授权内容",
    }),
    false,
  );
});

test("only explicitly marked UI messages are user-visible", () => {
  assert.equal(
    isUserVisibleUiMessage({
      type: "ui",
      metadata: { user_visible: true },
    }),
    true,
  );
  assert.equal(
    isUserVisibleUiMessage({
      type: "ui",
      metadata: { user_visible: false },
    }),
    false,
  );
  assert.equal(
    isUserVisibleUiMessage({
      type: "ui",
      metadata: { familyagent_user_visible: true },
    }),
    true,
  );
  assert.equal(isUserVisibleUiMessage({ type: "ui", metadata: {} }), false);
});
