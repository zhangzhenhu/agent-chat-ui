# Thinking Dual-Channel Alignment Design

## 背景

`../familyagent` 的 thinking 机制在 2026-07-01 之后已经调整为“双通道”：

1. `values.ui` 中的 `thinking_trace` 是 durable 真相
2. `custom kind="thinking"` 事件是高频临时增量

本设计文档替代旧方案 [docs/2026-07-01-thinking-ui-only-and-analytics-dialog-implementation-plan.md](/Users/test/Documents/projects/home_agent/agent-chat-ui/docs/2026-07-01-thinking-ui-only-and-analytics-dialog-implementation-plan.md)。

旧方案已废弃，原因是：

1. 它把 thinking 视为 UI-only，已与后端当前双通道机制冲突
2. 它把 thinking 视为 transcript 内联卡，已与后端当前线程级过程卡机制冲突

这与当前 `agent-chat-ui` 工作区里已经落下去的临时实现存在明确偏差：

1. 前端当前已停止消费 `kind="thinking"` custom event
2. 前端当前把 `thinking_trace` 插入 transcript，按消息前置渲染
3. `ThinkingTraceCard` 当前只渲染 UI snapshot，不再支持 durable UI 与 transient custom 增量合成

这些偏差会直接导致：

1. 运行中看不到最新 raw reasoning 增量
2. 前端展示语义与 `familyagent` 最新线程级过程卡机制不一致
3. 后端新增的 `thinking.phase_flushed` 无法被前端消费，custom bucket 无法正确清桶

## 实地核查结论

### 已验证的后端事实

1. `familyagent` 当前工作区的 `thinking_events.py` 明确会发 `kind="thinking"` 的 envelope，`schema_version` 为 `thinking_event/v1`，并携带 `context / subject / business / payload`。
2. `familyagent` 当前工作区的 `ThinkingMiddleware` 会：
   - 在模型流期间发 `thinking.reasoning_delta`
   - 在 flush 某个 phase 时发 `thinking.phase_flushed`
   - 在 `aafter_agent()` 阶段对 thinking 卡做 late bind
3. `thinking_trace` 的卡片 id 规则为 `thinking:<run_id>`，且会优先复用同 run 已存在的 card id。
4. `thinking_trace` 在主链路中是线程级过程卡，而不是 transcript 消息的一部分。

### 已验证的前端现状

1. [src/providers/Stream.tsx](/Users/test/Documents/projects/home_agent/agent-chat-ui/src/providers/Stream.tsx) 当前只消费 UI event 和 `kind="analytics"`，已经不消费 `kind="thinking"`。
2. [src/components/thread/index.tsx](/Users/test/Documents/projects/home_agent/agent-chat-ui/src/components/thread/index.tsx) 当前通过 `buildTranscriptBlocks()` 把 `thinking_trace` 插入 transcript。
3. [src/components/thread/process-trace-helpers.ts](/Users/test/Documents/projects/home_agent/agent-chat-ui/src/components/thread/process-trace-helpers.ts) 当前仍承担 thinking 的消息级插入逻辑。
4. [src/components/thread/thinking-trace-card.tsx](/Users/test/Documents/projects/home_agent/agent-chat-ui/src/components/thread/thinking-trace-card.tsx) 当前只展示 snapshot.steps/details，不支持 custom 增量 overlay。
5. analytics 当前已按用户最新要求收窄为 run 级聚合，并挂到当前 run 最后一条 AIMessage 下；这条可保留。

## 目标

产出一套长期稳定、与 `familyagent` 最新机制严格对齐的前端 thinking 实现：

1. thinking 正式恢复双通道消费
2. `thinking_trace` 恢复为线程级过程卡
3. 前端临时 thinking bucket 明确建模为 `run -> phase -> group`
4. `ThinkingTraceCard` 渲染逻辑改为 durable UI + transient custom overlay
5. `thinking.phase_flushed` 到达后，前端能立即清除对应未 durable 的 custom 增量
6. analytics 与 thinking 继续彻底解耦

## 冻结约束

### 1. thinking 不按消息渲染

前端不能再把 `thinking_trace` 当成 transcript block 或 AIMessage 前置卡处理。

原因：

1. `familyagent` 最新文档已经明确把它定义为线程级过程卡
2. `metadata.message_id` 只是 thread 内归属，不是 transcript 可见性承诺
3. 当前后端 late bind 发生在 `aafter_agent()`，并不支持“全过程始终稳定前置到某条 AIMessage”

### 2. UI 是 durable 真相，custom 是 transient 增量

前端必须遵守以下消费顺序：

1. 先读 `values.ui` 中的 `thinking_trace`
2. 再叠加本地尚未 flush 的 custom delta
3. 一旦后端 flush 并 durable 化，对应 custom bucket 必须清空

### 3. group 维度不可省略

前端不能只按 `run_id` 或 `phase_id` 存 thinking delta。

至少需要三层键：

1. `run_id`
2. `phase_id`
3. `group_id`

`group_id` 规则：

1. 优先使用 `payload.group_id`
2. 若缺失，回退 `${subject.agent_role}:${payload.agent_name}`

## 方案设计

### 1. Stream 层状态拆分

在 `StreamContext` 中维护两套完全独立的状态：

1. `analyticsState`
2. `thinkingState`

`thinkingState` 只服务 thinking UI，不参与 analytics、message-bound card、process trace。

建议形状：

```ts
type ThinkingDeltaItem = {
  text: string;
  agentName: string;
  agentRole: string;
};

type ThinkingGroupBucket = {
  items: ThinkingDeltaItem[];
};

type ThinkingPhaseBucket = {
  groups: Record<string, ThinkingGroupBucket>;
};

type ThinkingRunBucket = {
  phases: Record<string, ThinkingPhaseBucket>;
};

type ThinkingState = {
  byRunId: Record<string, ThinkingRunBucket>;
};
```

### 2. thinking custom event reducer

前端只识别下面四类事件：

1. `thinking.phase_started`
2. `thinking.reasoning_delta`
3. `thinking.phase_completed`
4. `thinking.phase_flushed`

处理原则：

1. `phase_started`
   - 确保 `run/phase/group` bucket 已存在
2. `reasoning_delta`
   - 追加到 `run/phase/group.items[]`
3. `phase_completed`
   - 只影响 UI 状态提示，不做 durable 清理
4. `phase_flushed`
   - 清空对应 `run/phase/group.items[]`

### 3. ThinkingTraceCard 合成渲染

`ThinkingTraceCard` 的输入不再是单一 snapshot，而是：

1. `snapshot`
2. `runBucket`
3. `isLoading`

渲染算法：

1. 遍历 `snapshot.steps`
2. 先渲染 step 的 `details`
3. 再渲染 step 的 `detail_groups`（如果存在）
4. 再读取同 `phase_id` 的 transient custom groups
5. 仅叠加“尚未 flush”的 items

这保证：

1. 刷新/回放时 durable 内容仍完整
2. 运行中可以看到增量 reasoning
3. flush 后不会重复显示

### 4. Thread 页面结构

`ThinkingTraceCard` 从 transcript 中彻底移除，改回线程级独立区域。

推荐顺序：

1. 历史 transcript
2. 当前 turn 的最后一条 human message
3. 当前 run thinking process 区
4. 当前 turn 的 assistant message
5. pending interrupt
6. process trace

这样做的理由：

1. transcript 继续只承载 human / assistant 正式消息
2. thinking 仍然是线程级过程卡，不按 message 绑定渲染
3. 用户可见顺序上，thinking 出现在当前 turn 的最终 AIMessage 之前，更符合“先思考、后回答”
4. process trace 仍是 debug 层，继续放在 thinking 后面

### 5. analytics 保持现方案

analytics 不跟随这次 thinking 改造回退。

保留当前已收窄规则：

1. 只按 `context.run_id` 聚合
2. 只挂到当前 run 最后一条 AIMessage

理由：

1. 这是用户最新明确指定的规则
2. 与 `familyagent` 当前 analytics 事件结构兼容
3. 与 thinking 的线程级过程卡设计没有冲突

## 非目标

这次不做以下事情：

1. 不改 `familyagent` 后端 thinking 结构
2. 不把 process trace 改造成 thinking UI
3. 不重新设计 analytics 展示形态
4. 不引入新的前端测试框架；优先沿用当前可验证路径

## 风险与应对

### 风险 1：后端 `detail_groups` 仍在推进中

应对：

1. 前端渲染对 `detail_groups` 做可选兼容
2. 没有 `detail_groups` 时，仍能渲染 `details + transient groups`

### 风险 2：同一 run 的多个 agent group 顺序

应对：

1. 前端不自行做复杂拓扑推理
2. 同一 phase 内按 durable group 顺序优先，其余 transient group 追加在后

### 风险 3：thread 切换时 thinking bucket 泄漏

应对：

1. `threadId / assistantId / apiUrl` 变化时清空 `thinkingState`
2. 保持与 analyticsState 相同的生命周期策略

## 验证口径

实施完成后必须至少验证：

1. thinking 运行中能看到 raw reasoning 增量
2. thinking flush 后，旧的 transient delta 不再重复显示
3. 页面刷新后，即使没有 custom 历史重放，也能从 `values.ui` 恢复 thinking 卡主体
4. analytics 仍只出现在当前 run 最后一条 AIMessage 下
5. process trace 仍只显示 debug/process 信息

## 结论

本次应当做的是“全局回正”而不是局部补丁：

1. 废弃 `thinking-ui-only` 方案
2. 恢复双通道
3. 恢复线程级过程卡
4. 建立 `run / phase / group` thinking bucket
5. 用 durable UI + transient custom overlay 的方式实现长期稳定前端
