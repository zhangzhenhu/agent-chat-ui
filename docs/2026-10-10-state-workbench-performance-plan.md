# State Workbench 性能优化方案（v2，架构评审后）

日期：2026-10-10（v2 同日修订）
范围：`src/components/state-workbench/`

> v2 变更：按架构评审修正了事实错误（复制 JSON 并不在渲染路径上）、调整了
> 优先级（P1 为主体，P0 仅保留止血项）、补充了截断与搜索冲突、命中数上限
> 语义、惰性行生成、Worker 双构建验证等遗漏的设计问题。已确认可引入新依赖，
> 选型为 `@tanstack/react-virtual`。

## 1. 问题描述

当 state JSON 较大时，在低配电脑上 state-workbench 页面出现明显卡顿，主要表现为：
- 首次展开/渲染慢；
- 搜索框每输入一个字符都有明显延迟；
- 展开、折叠节点时响应慢。

## 2. 现状分析

以下结论均已对照代码核实。

### 2.1 全量 DOM 渲染（首屏卡顿的主因之一）

- `searchable-json-view.tsx:137`：深度 ≤ 4 的节点默认展开，大 JSON 首屏会产生数万个 DOM 节点。**数据到达那一刻的单次巨量渲染是首屏卡顿的主因，这靠虚拟化天然解决。**
- `searchable-json-view.tsx:120-275`：每个节点是独立的递归组件，持有自己的 `useState` 和 `useEffect`，并渲染一个 lucide SVG 图标。节点越多，React fiber 与 DOM 的开销越大。
- `searchable-json-view.tsx:149`：每个展开节点都会执行 `Object.entries(value)`，即使子节点数量很大。

### 2.2 搜索输入触发整树重渲染

- `state-workbench-page.tsx:289`：`query` 是页面级 state。每次击键都会重渲染三个 `Panel`，进而重渲染全部 `SearchableJsonView` 和 `Node`。
- 注意：`React.memo` 对这条路径**几乎无效**——`query` 作为 prop 传给每个 `Node`，每次击键必然变化，所有节点照样重渲染。memo 只对"刷新数据、折叠面板"等其它重渲染路径有辅助价值。
- `searchable-json-view.tsx:16-48`：`Highlight` 对每个叶子节点、每次渲染都新建 `RegExp` 并执行 `split`，然后对每个 part 做 `toLowerCase()`。

### 2.3 搜索索引每次击键都重建

- `state-workbench-page.tsx:66-90`：`collectMatches` 在 query 变化时遍历三棵完整的树，逐个拼接路径字符串并做大小写转换。匹配项可能有数万条，而页面只使用数量和当前项。
- `state-workbench-page.tsx:72,76`：匹配项中的 `path` 字段始终为 `"root"`，没有被使用（`JsonMatch.path` 类型定义见 `state-workbench-types.ts:14`）。

### 2.4 长字符串整段渲染

- prompt、message content 等几十 KB 的字符串会被整段 `split` 成大量 `<span>`，每次渲染都要重新计算。

### 2.5 数据层与正确性问题

- `thread-workbench-data.ts` 的 `fetchJson` 使用 `response.json()`，解析发生在主线程（一次性、几百 ms 量级），不是最主要瓶颈，P2 再考虑。
- 复制功能（`searchable-json-view.tsx:288`）的 `JSON.stringify` **只在点击回调里执行，不在渲染路径上**，大对象点击时有一次几百 ms 的阻塞，可接受，不改。
- `searchable-json-view.tsx:137` 通过 `path.split(".")` 计算深度，key 中包含 `.` 时深度会算错。
- 同类隐患：`activeNodeId.startsWith(`${idPrefix}:${path}.`)`（`searchable-json-view.tsx:142`）这类**字符串路径前缀匹配在 key 含 `.` 时会错配**（`root["a.b"]` 与 `root.a.b` 无法区分）。行模型改用数组索引做主键后，这一整类 bug 自然消失——这是 P1 的一个隐性收益。

### 2.6 死代码（重构时顺手清理）

- `searchable-json-view.tsx:150-151`：`fieldMatched` / `valueMatched` 计算了但从未使用。
- `collectMatches` 产出的 `path` 恒为 `"root"`，`JsonMatch.path` 实际无消费方。

### 2.7 项目内现状

- `thread-workbench.tsx`、`thread-state-sheet.tsx`、`analytics-sheet.tsx`、`message-metadata-sheet.tsx` 使用的 `react-json-view-lite` 同样不做虚拟化。替换该库不能解决本问题。

## 3. 业内经验

- **虚拟化（virtualization）**：大树渲染的标准解法，VS Code 树视图、Chrome DevTools 的大列表都采用类似思路。只渲染视口内的行，DOM 数量与 JSON 大小解耦。
- **惰性行生成 + 扁平行模型**：将"当前展开状态"映射为可见行序列，每次渲染只从已展开节点集合出发遍历树，产出视口附近需要的行，复杂度为 **O(可见行数)** 而非 O(总节点数)。展开状态集中存放在一个 `Set` 中。⚠️ 不能一次性把整棵树全量拍平成 `Row[]`——几十万行的全量构建本身就是大开销（与现在的 `collectMatches` 同病）。
- **惰性展开与预览摘要**：折叠节点只显示 `{…} 12 项`，展开时才计算子项。大数组默认只显示前 N 项，并提供"加载更多"。
- **搜索索引化**：数据加载时一次性构建扁平索引，之后每次查询仅做线性 `includes`。
- **降低输入优先级**：使用 `useDeferredValue` 或 `startTransition`，保证输入框始终流畅，搜索结果延迟渲染。
- **长字符串截断**：超过阈值（如 2KB）只渲染前 N 个字符，并提供"展开全部"。
- **Web Worker**：若测量后确认解析或搜索耗时明显，再迁移。本项目为 Next.js + Electron 双形态打包，Worker 引入需在两种构建下都验证打包正确性。

## 4. 方案（v2 优先级）

### 立刻止血（一行改动）

- 默认展开深度 4 → 2（`searchable-json-view.tsx:137`），可独立先上线。

### P1：核心重构（主体工作，约 2–4 天）

原 P0 的多数条目收益有限或互相耦合，全部并入 P1 一次做完，不单独发版。

1. **扁平行模型（惰性生成）**：以"已展开节点集合（`Set<rowKey>`，rowKey 用数组索引序列而非字符串路径）"为唯一状态源，每次渲染惰性生成可见行序列。
2. **虚拟列表渲染**：引入 **`@tanstack/react-virtual`**（约 2.5KB、无 UI 绑定、虚拟逻辑完全自控）。不选 `react-arborist`：run 分组、字段/值双高亮、跨面板导航等定制需求会与其 API 冲突，改造成本不低于自写。行高通过字符串截断固定后，tanstack 的能力完全够用。
3. **搜索索引**：数据加载时一次性构建（`{ rowKey, lowerText, kind }`），之后击键只做线性扫描。命中数上限建议设为 10000（而非 1000），避免用户被静默截断。
4. **搜索输入降级**：`useDeferredValue` 包裹 query，输入框即时响应。
5. **高亮预编译**：正则/大小写归一在 `useMemo` 中按 query 做一次。
6. **截断与搜索的冲突处理（必须实现）**：搜索命中落在被截断的长字符串或"仅显示前 50 项"的数组之外时，导航到该命中必须先解除该处截断 / 自动"加载更多"，否则用户会看到"第 37/200 命中"但页面上什么都看不到。
7. **命中数上限语义**：超过上限时 UI 明示"N+ 命中，已限制导航范围"，不做静默截断。
8. **导航方式**：展开祖先节点（按 rowKey）→ `scrollToIndex`，取代 `document.getElementById` + `scrollIntoView`。
9. **RunGroup 分组**：作为扁平行的一种类型（group header 行）实现，保留折叠能力。
10. **数据到达过渡态**：索引构建 + 首次行生成可能需要几十到几百 ms，用骨架行占位，避免白屏后突然弹出。
11. **顺手清理**：删除 `fieldMatched`/`valueMatched` 死代码与无用的 `JsonMatch.path` 字段；`React.memo` 保留在行组件上（对刷新/折叠路径仍有辅助价值）。

### P2：视测量结果决定

1. JSON 解析与搜索迁移到 Web Worker（注意 Next.js 与 Electron 两种构建都要验证 Worker 打包）。
2. 若后端支持按路径或深度查询子树，按需加载，避免一次性拉取巨大 JSON（需后端配合）。

## 5. 测量与验收

改代码前先建立基准，避免凭感觉优化。

- 准备三份真实 state 样本：约 1MB、5MB、20MB，分别覆盖宽数组和深嵌套两种形态。
- 记录的指标：
  - JSON 字节数与节点总数；
  - `document.querySelectorAll('*').length`；
  - 首屏渲染时间（`performance.mark` 包裹渲染）；
  - 单字符输入延迟（Chrome Performance 面板，CPU 限速 4x 模拟低配机）；
  - 堆内存占用。
- 验收标准（建议）：
  - CPU 4x 限速下，单字符输入延迟 < 100ms；
  - DOM 节点数在任何数据规模下保持在约 2000 以内（P1 完成后）。
- UI 改动需在浏览器中实际验证：golden path（查询、展开折叠、搜索、导航匹配、复制）以及边界情况（空数据、超大数组、超长字符串、**命中落在截断区**、key 含 `.`）。

## 6. 风险与取舍

- **浏览器原生搜索失效**：虚拟化后视口外的内容不在 DOM 中，Cmd+F 搜不到，跨行选择变难。搜索完全依赖面板内搜索功能。
- **动态行高**：多行、高度不固定的行会增加虚拟化复杂度。通过截断长字符串固定行高；`content-visibility` 作为保底手段（不依赖 JS，但对嵌套树的收益不如虚拟化确定）。
- **搜索语义变化**：扁平索引需保留"字段名命中"与"值命中"两种类型，及对应的行定位信息（rowKey）。
- **行为变化点**：默认展开深度降为 2；数组截断 + 命中数上限都会带来可感知的交互变化，需要用户确认可接受。
- **现有代码改动较大**：P1 会重写 `searchable-json-view.tsx`，并改动 `state-workbench-page.tsx` 的匹配与滚动逻辑，需配套测试覆盖。

## 7. 已确认事项

1. ~~是否接受新增虚拟列表依赖~~ → **已确认接受**，选型 `@tanstack/react-virtual`。
2. 待提供：可直接使用的大 JSON 样本（用于测量与回归）。
