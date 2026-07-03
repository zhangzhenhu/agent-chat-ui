# 2026-06-28 Interrupt / Card 问题排查结论

本文档记录 `agent-chat-ui` 对接本地 `familyagent` / LangGraph 服务时，围绕 `interrupt -> resume -> 最终结果卡片` 链路的实际排查结论。

排查环境：

- 前端：`agent-chat-ui` 本地代码
- 后端：`http://127.0.0.1:55773`
- assistant：`family_main`
- 排查方式：
  - 直接调用后端接口：`/assistants/search`、`/threads`、`/threads/{thread_id}/runs/stream`、`/threads/{thread_id}/state`、`/threads/{thread_id}/history`、`/threads/search`
  - 对比前端当前渲染逻辑

## 总结

当前至少存在 4 个独立问题：

1. 首轮追问链路不稳定：同样的问题，有时走 `interrupt`，有时不走
2. 非 interrupt 追问路径里，真正的问题被前端藏进 `Runtime Trace`
3. interrupt 场景下，服务端最终 state 不保留 AI 提问文本
4. 最终推荐卡的数据结构与前端 `CardUI` 预期不匹配，导致原始 JSON 渲染

其中：

- 问题 1：`后端问题`
- 问题 2：`前端问题`
- 问题 3：`后端问题`
- 问题 4：`前后端协议对齐问题`

---

## 问题 1：首轮追问链路不稳定

归属：`后端`

### 现象

对同样的输入 `今晚吃点啥`，后端并不总是走阻塞式 `ask_user_choice -> interrupt`。

有时结果是：

- thread 最终 `status=interrupted`
- `interrupts` 非空
- 需要前端走 `command.resume`

但也有时结果是：

- thread 最终 `status=idle`
- `interrupts` 为空
- 子代理把真实追问写进 `ToolMessage`
- 主代理再补一条普通 AI 桥接文案

### 证据

实际重放后端接口时拿到的线程状态：

- `thread_id=019f0b35-cf2b-7200-97f1-915aab959615`
  - `status=interrupted`
  - `values.messages` 只有 human
  - `interrupts` 非空
- `thread_id=019f0b35-7cff-7ad0-a38d-af96cc51f605`
  - `status=idle`
  - `interrupts` 为空
  - `values.messages` 中包含：
    - AI 发起 `ask_food_expert`
    - `tool` 结果里包含真实追问
    - 主代理再补一条“你告诉专家这些，它就能推荐”的桥接文案

### 结论

当前后端没有稳定遵守统一的首轮追问协议。

这会直接导致前端无法只按一种交互模型实现：

- 如果是 `interrupt`，前端要渲染阻塞卡片并走 `command.resume`
- 如果不是 `interrupt`，前端只能把它当普通对话继续

---

## 问题 2：非 interrupt 追问路径里，真正的问题被前端藏进 Runtime Trace

归属：`前端`

### 现象

当后端没有走 `interrupt`，而是把追问写进 `ToolMessage.content` 时，用户在正文区看不到真正的问题。

用户只能看到：

- 主代理一句泛化说明
- 真正的追问被藏在 `Runtime Trace` 的 `Tool Result` 中

### 证据

当前前端 transcript 过滤逻辑在：

- [src/components/thread/index.tsx](/Users/test/Documents/projects/home_agent/agent-chat-ui/src/components/thread/index.tsx:162)

逻辑是：

- 保留 `human`
- 保留“有文本内容的 `ai`”
- 不把 `tool` 消息放进正式 transcript

而当前 `Runtime Trace` 会显示 `tool_call` / `tool_result`：

- [src/components/thread/process-trace-helpers.ts](/Users/test/Documents/projects/home_agent/agent-chat-ui/src/components/thread/process-trace-helpers.ts:17)

### 结论

只要后端把“真实追问”放在 `ToolMessage` 而不是 `interrupt` 或正式 AI 消息里，前端当前实现就会把它放进过程卡，而不是正文区。

因此这不是 interrupt 专属问题，而是当前 transcript 策略与非 interrupt 追问路径不兼容。

---

## 问题 3：interrupt 场景下，服务端最终 state 不保留 AI 提问文本

归属：`后端`

### 现象

在真实 `interrupt` 场景里，前端最终拿到的 thread state 经常只包含：

- human message
- interrupts

但没有那条 AI 提问文本，也没有 `ui`

### 证据

实际重放得到的 thread state：

- `thread_id=019f0b35-cf2b-7200-97f1-915aab959615`
  - `status=interrupted`
  - `values.messages.length = 1`
  - 仅保留 human：`今晚吃点啥`
  - `values.ui = []`
  - `interrupts` 非空，内容是 `food_constraints`

对应的 history 也显示：

- interrupt 这个 checkpoint 上只有 human + interrupts
- 没有稳定保留 AI 提问文本

### 结论

“页面上只剩阻塞卡片、没有提问历史”并不只是前端渲染问题。

服务端当前 thread 最终快照本身就没有那条 AI 提问文本，所以前端如果只依赖 `state/messages` 恢复正文，是恢复不出来的。

---

## 问题 4：最终推荐卡的数据结构与前端 `CardUI` 预期不匹配

归属：`前后端协议对齐问题`

### 现象

恢复 interrupt 后，后端已经成功生成了最终推荐卡，且 thread state 里也有 `ui`。

但是前端会把卡片里的 `data` 作为原始 JSON 直接打印，而不是结构化推荐列表。

### 证据

实际重放 `thread_id=019f0b35-cf2b-7200-97f1-915aab959615` 并执行 `command.resume = "清淡"` 后：

- 最终 state：
  - `messages = 3`
  - `ui = 1`
  - `interrupts = 0`

后端产出的 `ui` 内容里，`props.data` 形状为：

```json
{
  "推荐方案": [
    { "方案1": { "菜品": "...", "亮点": "..." } },
    { "方案2": { "菜品": "...", "亮点": "..." } },
    { "方案3": { "菜品": "...", "亮点": "..." } }
  ],
  "烹饪建议": "..."
}
```

而前端 `CardUI` 的结构化识别逻辑在：

- [src/components/thread/generative-ui/card.tsx](/Users/test/Documents/projects/home_agent/agent-chat-ui/src/components/thread/generative-ui/card.tsx:22)

当前只对这些情况做专门渲染：

- `string`
- `{ summary, candidates }`
- `array`

普通对象会走 fallback，最终变成原始 JSON 展示。

### 结论

后端“有出卡”，前端“有收到卡”，但双方 `data` 协议没有对齐。

所以该问题不是单纯前端 bug，也不是单纯后端 bug，而是协议结构未统一。

---

## 当前可确认的责任归属

| 问题 | 归属 | 说明 |
| --- | --- | --- |
| 1. 首轮追问链路不稳定 | 后端 | 同样输入有时 interrupt，有时自然语言/ToolMessage 追问 |
| 2. 非 interrupt 追问被藏进 Runtime Trace | 前端 | transcript 不显示 `tool` 消息，真实问题进了过程卡 |
| 3. interrupt 场景最终 state 不保留 AI 提问文本 | 后端 | 最终 checkpoint 只有 human + interrupts |
| 4. 最终推荐卡原始 JSON 渲染 | 前后端协议对齐 | 后端 `data` shape 与前端 `CardUI` 结构化渲染预期不一致 |

---

## 建议的后续处理顺序

建议先不要混着修，按下面顺序拆开：

1. 先统一后端首轮追问协议
   - 明确同类场景到底必须走 `interrupt`，还是允许自然语言追问
2. 再决定前端正文区是否允许展示 `tool` 里的用户可见追问
3. 再明确 interrupt 场景下，是否要求服务端把 AI 提问文本稳定落入 `state.messages`
4. 最后统一最终推荐卡 `props.data` 的正式 schema

这样可以避免把“交互控制流问题”和“卡片渲染问题”混在一起处理。
