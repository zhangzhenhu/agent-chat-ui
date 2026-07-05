import test from "node:test";
import assert from "node:assert/strict";

const { getMessageBoundUiMessages, hasMessageBoundUi } = await import(
  new URL("../message-bound-ui.ts", import.meta.url).href
);
import type { Message } from "@langchain/langgraph-sdk";

function aiMessage(id: string, text = ""): Message {
  return {
    id,
    type: "ai",
    content: text,
  };
}

test("getMessageBoundUiMessages keeps unknown UI names bound to the message", () => {
  const message = aiMessage("anchor-1");
  const ui = [
    {
      type: "ui",
      id: "ui-unknown",
      name: "payment_summary",
      props: { amount: 128, due_date: "2026-07-05" },
      metadata: { message_id: "anchor-1" },
    },
    {
      type: "ui",
      id: "ui-other",
      name: "card",
      props: { title: "Other" },
      metadata: { message_id: "anchor-2" },
    },
  ];

  const bound = getMessageBoundUiMessages(ui, message);

  assert.equal(bound.length, 1);
  assert.equal(bound[0].id, "ui-unknown");
  assert.equal(bound[0].name, "payment_summary");
});

test("getMessageBoundUiMessages excludes thinking_trace from generic message-bound rendering", () => {
  const message = aiMessage("anchor-thinking");
  const ui = [
    {
      type: "ui",
      id: "thinking:run-1",
      name: "thinking_trace",
      props: { status: "active", steps: [] },
      metadata: { message_id: "anchor-thinking", run_id: "run-1" },
    },
    {
      type: "ui",
      id: "ui-unknown",
      name: "payment_summary",
      props: { amount: 128 },
      metadata: { message_id: "anchor-thinking" },
    },
  ];

  const bound = getMessageBoundUiMessages(ui, message);

  assert.deepEqual(
    bound.map((item: { name?: string }) => item.name),
    ["payment_summary"],
  );
});

test("hasMessageBoundUi treats an empty AI anchor with bound UI as visible content", () => {
  const message = aiMessage("anchor-empty");

  assert.equal(
    hasMessageBoundUi(
      [
        {
          type: "ui",
          id: "ui-1",
          name: "card",
          props: { title: "Visible card" },
          metadata: { message_id: "anchor-empty" },
        },
      ],
      message,
    ),
    true,
  );
});
