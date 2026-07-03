# Thinking Dual-Channel Alignment Review

## 目的

这份文档用于对以下两份文档做二次审查：

1. [docs/2026-07-02-thinking-dual-channel-alignment-design.md](/Users/test/Documents/projects/home_agent/agent-chat-ui/docs/2026-07-02-thinking-dual-channel-alignment-design.md)
2. [docs/2026-07-02-thinking-dual-channel-alignment-implementation-plan.md](/Users/test/Documents/projects/home_agent/agent-chat-ui/docs/2026-07-02-thinking-dual-channel-alignment-implementation-plan.md)

检查范围只包括：

1. 是否把未实现目标方案误写成已实现事实
2. 是否仍保留占位符或不可执行步骤
3. 是否遗漏当前前端结构中的清理项
4. 是否有与现有代码不兼容的假设

## 二次审查结论

### 已确认成立的事实

1. `familyagent` 当前工作区确实已经恢复双通道 thinking：
   - durable `thinking_trace`
   - transient `kind="thinking"` custom events
2. `thinking.phase_flushed` 已经出现在后端当前代码里，不再只是未来目标
3. 当前 `agent-chat-ui` 工作区确实偏离了该机制：
   - 停止消费 `kind="thinking"`
   - 把 thinking 插入 transcript
   - `ThinkingTraceCard` 不再支持 transient overlay
4. analytics 当前 run 级挂载规则与这次 thinking 回正不冲突

### 本轮审查发现并已修正的问题

1. **遗漏 `transcript-types.ts` 清理**
   - 原问题：计划只写了移除 transcript-inline thinking，但没有显式收掉相关类型文件
   - 修正：计划已增加删除项

2. **计划中存在占位符**
   - 原问题：
     - `runBucket={...}`
     - flushed 测试示例没有写完整
     - group merge 示例是注释，不是可执行代码
   - 修正：都已展开成具体代码片段

3. **缺少旧方案判废说明**
   - 原问题：如果不明示废弃旧 `thinking-ui-only` 方案，执行时容易继续在旧方向打补丁
   - 修正：设计文档已显式写明替代关系

### 仍保留的谨慎项

以下点经过复核后，仍应作为兼容处理，而不能拍脑袋写死：

1. `detail_groups` 已在 helper 和测试中出现，但不能假设所有真实链路都稳定下发
   - 前端必须兼容只有 `details` 的 durable snapshot

2. `thinkingTraceMessage.metadata.run_id` 不能假设永远存在
   - 前端仍需允许从 `thinking:<run_id>` card id 回退解析

3. 多个 agent group 的显示顺序暂无更强后端合同
   - 前端只采用保守顺序：
     - durable groups 优先
     - transient-only groups 追加在后

4. thinking 的页面位置不能误写成“在所有 transcript 之后”
   - 线程级过程卡不等于必须出现在页面底部
   - 用户可见顺序应放在“当前 turn 的最后一条 human 之后、assistant 之前”

## 审查结论

当前设计文档和实施计划经过二次 review 后，已经达到可执行基线：

1. 设计结论都能指向后端或前端现有代码事实
2. 计划里不再保留明显占位符
3. 已覆盖旧错误方案的撤销与类型文件清理
4. 对未完全验证的部分保留了明确兼容策略，而不是瞎猜
