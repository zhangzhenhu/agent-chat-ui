# Agent UI 对话窗口问题诊断报告

日期：2026-07-05

## 复验结论

复验后，原报告里把问题聚焦到“缴费卡片”不够准确。这里的本质问题是内容丢失：后端已经发出 UI 内容，但前端没有稳定保留和渲染出来，和具体是哪一张卡片无关。

1. 已证实：“对话过程中部分消息临时消失”和 child namespace 空 `ui` 快照有关。当前未提交代码已经在 `Thread` 里实现 `protectedUi`，专门防止 root UI 帧被 child values 快照挤掉。
2. 已证实：这不是 payment/缴费专属组件问题，而是通用 message-bound UI 渲染链路问题。当前前端仓库没有发现 payment/缴费专属组件或字段，正式业务 UI 只注册了 `card`。
3. 已证实的代码缺口：卡片渲染已经改为读取 `protectedUi`，但 transcript 是否保留空 AI anchor message 的判断仍读取原始 `stateValues.ui`。这会造成“卡片还在 protectedUi 里，但宿主 message 被过滤掉”的不一致。
4. 已补充的产品要求：后端反馈的 UI 名称如果前端没有对应组件，也不能丢弃；前端应该渲染默认卡片，直接展示 payload JSON 内容。

## 根因

### 1) UI 帧被 child 空快照挤掉

当前代码已经明确记录了复现背景：运行中会收到 child subgraph 的 `values` 快照，而这些快照里的 `ui` 可能为空；`stream.values` 在当前使用方式下表现为最新快照替换，所以会把 root 的 UI 帧挤掉。

相关位置：

- [src/components/thread/index.tsx](/Users/test/Documents/projects/home_agent/agent-chat-ui/src/components/thread/index.tsx:182)

这会直接造成：

- thinking 卡临时消失
- 正常卡片在流式过程中短暂不见
- 后续依赖同一份 `ui` 的卡片恢复不稳定

### 2) message-bound UI 的宿主 message 可能被 transcript 过滤掉

业务 UI 不是单独渲染的，它必须先绑定到某条 AI message 上。当前唯一正式业务 UI 注册是 `card`：

- [src/components/thread/generative-ui/component-map.tsx](/Users/test/Documents/projects/home_agent/agent-chat-ui/src/components/thread/generative-ui/component-map.tsx:1)

具体渲染条件是：

- `item.name === "card"`
- `item.metadata?.message_id === message.id`

相关位置：

- [src/components/thread/messages/ai.tsx](/Users/test/Documents/projects/home_agent/agent-chat-ui/src/components/thread/messages/ai.tsx:69)

问题在于，`Thread` 里决定 transcript 是否保留一条 AI message 的过滤逻辑，仍然基于原始 `stateValues.ui`，不是保活后的 UI 集合。这样一来，child 空快照到来时：

- 原始 `stateValues.ui` 可能暂时为空
- 绑定卡片的空文本 AI anchor message 会被过滤掉
- 卡片没有宿主 message，自然就“不显示”

相关位置：

- [src/components/thread/index.tsx](/Users/test/Documents/projects/home_agent/agent-chat-ui/src/components/thread/index.tsx:248)

### 3) 未知 UI 名称不能静默丢失

如果后端发出 `type: "ui"` 且带 `metadata.message_id`，但 `name` 不在前端组件注册表里，前端也应该显示默认 JSON 卡。否则问题会从“特定卡片不显示”扩散成“后端内容被静默丢弃”。

当前修复方向：

- message-bound UI 的过滤条件只看 `type === "ui"` 和 `metadata.message_id`，不再要求 `name === "card"`。
- 已注册组件继续走 `LoadExternalComponent`。
- 未注册组件走默认卡片，直接展示 `props` JSON。

### 4) 次级风险：tool-call AI message 仍会被 transcript block 跳过

`buildTranscriptBlocks` 会跳过带 `tool_calls` 的 AI message。如果后端把 card 绑到一条仍带 `tool_calls` 的 AI message 上，即使 transcript 前置过滤保留了它，后续 block 组装仍可能把它跳过。

相关位置：

- [src/components/thread/process-trace-helpers.ts](/Users/test/Documents/projects/home_agent/agent-chat-ui/src/components/thread/process-trace-helpers.ts:111)

这个风险需要实际 payload 或专门回归测试确认；本次复验没有在前端仓库里拿到具体缴费卡 payload。

## 证据

本次排查中，仓库里已经存在对应的未提交修改，说明问题已经定位到具体链路：

- [src/components/thread/index.tsx](/Users/test/Documents/projects/home_agent/agent-chat-ui/src/components/thread/index.tsx:182)
- [src/components/thread/messages/ai.tsx](/Users/test/Documents/projects/home_agent/agent-chat-ui/src/components/thread/messages/ai.tsx:69)

同时，相关回归测试已经覆盖了 thinking 侧的 namespace、display 和 view-model 逻辑，但没有覆盖“空 AI anchor + message-bound card + child 空 `ui` 快照”这一端到端场景。

复验中还确认：

- 当前仓库没有 payment/缴费专属组件；搜索 `payment`、`缴费`、`fee`、`bill` 没有找到业务组件命中。这进一步说明应按通用内容丢失问题处理。
- `src/providers/Stream.tsx:189` 是 thinking custom event 的 namespace 过滤，不是 UI 帧保活的直接证据。原报告把它列作 UI 帧证据不够精确，本版已移除该引用。

## 已验证项

- `node --experimental-strip-types --test src/providers/__tests__/stream-namespace.test.ts src/components/thread/__tests__/thinking-state.test.ts src/components/thread/__tests__/thinking-trace-display.test.ts src/components/thread/__tests__/thinking-trace-view-model.test.ts src/components/thread/__tests__/process-trace-helpers.test.ts`
- 上述测试全部通过。

## 额外说明

`tsc --noEmit` 当前会被 `.next/types/* 2.ts` 的重复类型文件打断，这个失败和本次 UI 问题无关。

## 结论一句话

根因不是“某张缴费卡坏了”。已证实的问题是 UI 状态保活、message 绑定宿主、未知 UI 兜底展示这三层没有统一，导致后端已返回的内容在前端链路中丢失或没有正确显示。
