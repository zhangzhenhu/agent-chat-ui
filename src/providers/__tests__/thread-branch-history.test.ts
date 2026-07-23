import test from "node:test";
import assert from "node:assert/strict";

const { buildThreadBranchView, buildForkSubmitOptions } = await import(
  new URL("../thread-branch-history.ts", import.meta.url).href
);

const message = (id: string, type: "human" | "ai", content: string) => ({
  id,
  type,
  content,
});

const history = [
  {
    checkpoint: { checkpoint_id: "branch-b" },
    parent_checkpoint: { checkpoint_id: "shared" },
    values: {
      messages: [
        message("human-1", "human", "question"),
        message("ai-1", "ai", "answer"),
        message("human-b", "human", "branch b"),
      ],
      marker: "branch-b",
    },
  },
  {
    checkpoint: { checkpoint_id: "branch-a" },
    parent_checkpoint: { checkpoint_id: "shared" },
    values: {
      messages: [
        message("human-1", "human", "question"),
        message("ai-1", "ai", "answer"),
        message("human-a", "human", "branch a"),
      ],
      marker: "branch-a",
    },
  },
  {
    checkpoint: { checkpoint_id: "shared" },
    parent_checkpoint: { checkpoint_id: "root" },
    values: {
      messages: [
        message("human-1", "human", "question"),
        message("ai-1", "ai", "answer"),
      ],
      marker: "shared",
    },
  },
  {
    checkpoint: { checkpoint_id: "root" },
    parent_checkpoint: null,
    values: {
      messages: [message("human-1", "human", "question")],
      marker: "root",
    },
  },
];

test("buildThreadBranchView defaults to the latest thread head", () => {
  const view = buildThreadBranchView({
    branch: "",
    history,
    liveValues: {
      messages: [
        ...history[0].values.messages,
        message("ai-live", "ai", "live answer"),
      ],
      marker: "live",
    },
  });

  assert.equal(view.isViewingHead, true);
  assert.equal(view.values.marker, "live");
  assert.deepEqual(
    view.messages.map((item: { id?: string }) => item.id),
    ["human-1", "ai-1", "human-b", "ai-live"],
  );
});

test("buildThreadBranchView displays a selected historical branch without moving head", () => {
  const view = buildThreadBranchView({
    branch: "branch-a",
    history,
    liveValues: {
      messages: history[0].values.messages,
      marker: "live",
    },
  });

  assert.equal(view.isViewingHead, false);
  assert.equal(view.values.marker, "branch-a");
  assert.deepEqual(
    view.messages.map((item: { id?: string }) => item.id),
    ["human-1", "ai-1", "human-a"],
  );
  assert.equal(view.headCheckpointId, "branch-b");
  assert.equal(view.displayedCheckpointId, "branch-a");
});

test("buildThreadBranchView maps branch options and parent checkpoints to messages", () => {
  const view = buildThreadBranchView({
    branch: "branch-a",
    history,
    liveValues: {
      messages: history[0].values.messages,
    },
  });
  const metadata = view.metadataByMessageId.get("human-a");

  assert.deepEqual(metadata, {
    parentCheckpointId: "shared",
    branch: "branch-a",
    branchOptions: ["branch-a", "branch-b"],
    firstSeenValues: history[1].values,
  });
});

test("buildForkSubmitOptions requires an explicit parent checkpoint", () => {
  assert.deepEqual(
    buildForkSubmitOptions("checkpoint-1", {
      configurable: { user_id: "u-1" },
    }),
    {
      config: {
        configurable: { user_id: "u-1" },
      },
      forkFrom: "checkpoint-1",
    },
  );
  assert.equal(buildForkSubmitOptions(undefined, undefined), undefined);
});
