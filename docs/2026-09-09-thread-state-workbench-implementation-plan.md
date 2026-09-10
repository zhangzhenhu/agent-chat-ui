# Thread State Workbench 实现方案

## 1. 目标

实现独立页面 `/state-workbench`，用于人工 case 追查：

- 支持 local、SI、ST、生产环境切换。
- 输入 `thread_id` 后并行获取 Root、Need specialist、Supply specialist state。
- Need/Supply 各自支持 `gas`、`food` Tab。
- 三个 JSON 面板共用一个搜索框，命中节点全部高亮并可跳转。
- Web 与 Electron 使用同一套页面和业务逻辑。
- 页面只读，不做自动轮询、权限系统或 state 修改。

## 2. 现状与复用边界

当前仓库已经具备：

- Next.js App Router。
- `RuntimeConfigProvider`，内置四个环境及 Electron 持久化配置。
- `thread-workbench-data.ts`，包含 runtime URL 拼接、认证 Header 和 specialist checkpoint POST。
- `thread-workbench-config.ts`，包含四个实际 specialist namespace。
- `react-json-view-lite` 的 JSON 样式和全展开能力。
- Electron 静态导出及内置 HTTP 静态文件服务器。

复用原则：

1. 不复制环境地址、认证逻辑和 namespace 常量。
2. 新页面不依赖聊天页面的 `ThreadProvider`、当前流状态或聊天生命周期。
3. 现有聊天中的 Thread Workbench 保持不变；新页面可复用其数据 helper 和共享配置。

## 3. 页面与组件结构

建议新增以下文件：

```text
src/app/state-workbench/page.tsx
src/components/state-workbench/state-workbench-page.tsx
src/components/state-workbench/state-workbench-data.ts
src/components/state-workbench/state-workbench-config.ts
src/components/state-workbench/searchable-json-view.tsx
src/components/state-workbench/state-workbench-types.ts
src/components/state-workbench/__tests__/...
```

职责划分：

- `page.tsx`：挂载 `RuntimeConfigProvider`，渲染独立页面。
- `state-workbench-page.tsx`：页面状态、URL 参数、查询编排、三列布局。
- `state-workbench-data.ts`：Root GET、specialist POST、请求取消及响应归一化。
- `state-workbench-config.ts`：环境 URL 参数、面板 Tab 和 namespace 映射。
- `searchable-json-view.tsx`：折叠树、语法着色、搜索命中高亮、命中跳转。
- `state-workbench-types.ts`：面板状态、请求状态、搜索命中等类型。

## 4. URL 状态设计

使用 `nuqs` 管理查询参数，至少包括：

```text
env=local|si|st|prod
thread_id=<thread id>
need=gas|food
supply=gas|food
```

行为：

- 首次加载从 URL 读取环境、thread 和 Tab；无效值回退到默认值。
- 点击查询后写入 `thread_id`，使用 replace，避免每次查询污染浏览器历史。
- 切换环境写入 `env`，并清空当前三列数据和过期请求。
- 切换 Need/Supply Tab 只更新对应参数，首次切换时懒加载。
- 每个 Tab 页面状态只保存在当前页面实例中，不使用跨 Tab 的全局缓存。

## 5. 请求编排

### 5.1 Root

调用：

```text
GET {apiUrl}/threads/{threadId}/state/
```

### 5.2 Specialist

调用：

```text
POST {apiUrl}/threads/{threadId}/state/checkpoint
```

请求体固定为：

```json
{
  "checkpoint": {
    "thread_id": "<threadId>",
    "checkpoint_ns": "<physical namespace>",
    "checkpoint_id": "",
    "checkpoint_map": {}
  },
  "subgraphs": true
}
```

### 5.3 生命周期

1. 用户提交有效 thread ID 后，Root、默认 Need Tab、默认 Supply Tab 使用 `Promise.allSettled` 并行请求。
2. specialist Tab 首次激活时请求对应 namespace；已成功数据缓存到当前页面实例。
3. 每个面板独立维护 `idle/loading/success/empty/error` 状态、数据、错误和更新时间。
4. 手动刷新只增加对应资源的 request token，不影响其他面板。
5. 请求使用 `AbortController`；thread、环境或 Tab 改变时取消旧请求。
6. 通过 request generation 丢弃过期响应，避免快速切换环境后旧数据回写。
7. 判断空状态时区分 HTTP 成功但 `checkpoint: null`、空 values 和真正的请求错误。

## 6. 三列 UI

页面从上到下分为：

1. 工具栏：页面标题、环境选择、thread ID 输入、查询按钮、统一搜索框、命中计数和上/下一个按钮。
2. 三列内容区：Root、Need specialist、Supply specialist。

每列包含：

- 标题和当前环境/thread 摘要。
- 独立刷新按钮。
- Need/Supply 的 `gas`、`food` Tab。
- 独立滚动的 JSON viewer。
- loading、empty、error、success 状态。

桌面端使用 `grid-template-columns: repeat(3, minmax(0, 1fr))`；小屏幕采用单列纵向布局，保留每列内部滚动和稳定的最小高度。

## 7. JSON 查看器与搜索实现

### 7.1 组件选择

当前 `react-json-view-lite` 提供折叠、默认展开和颜色样式，但没有字段/值自定义渲染能力，不能可靠实现命中节点高亮。因此新增 `SearchableJsonView`，采用本地递归树渲染：

- 复用 `react-json-view-lite` 的颜色语义和 CSS 变量风格，保持现有 UI 一致。
- 对象/数组节点提供折叠按钮和稳定的节点 ID。
- 标量字段和值按类型着色。
- 大对象默认展开到配置深度；搜索命中路径强制展开。
- 保留复制完整 JSON 能力。

如实现前验证发现目标 JSON 组件已提供稳定的自定义节点渲染 API，可替换底层 renderer，但不改变页面数据契约。

### 7.2 搜索索引

对三个当前可见 JSON 做一次 `useMemo` 索引：

- 遍历对象字段名和值，生成 `panelId + tabId + jsonPath + nodeId`。
- 搜索使用大小写不敏感的 `includes`。
- 字段名和值分别记录命中范围。
- 使用统一 query 对 Root、当前 Need、当前 Supply 同时计算。
- query 为空时清除高亮、计数和跳转游标。

### 7.3 高亮与跳转

- 命中的字段名和值用 `<mark>` 或等价的高亮样式渲染。
- 所有命中节点同时保持高亮，不只显示当前命中项。
- 当前命中项使用更高对比度样式。
- 上/下一个按钮按 Root、Need、Supply 的固定顺序循环。
- 跳转时展开祖先节点，并通过节点 ref 滚动到对应面板。
- Tab 切换或数据更新后重新计算索引并重置游标。

## 8. 环境配置复用

- 页面通过 `RuntimeConfigProvider` 获取 `environments`、`environmentId`、`selectEnvironment`、`apiUrl`、`apiKey`、`authScheme`。
- Web 端使用现有运行时行为；Electron 端使用 `settings.json` 中的环境和认证配置。
- 不新增第二份环境常量；只将 `local` 地址统一确认为 `http://localhost:8000`。
- 页面显示环境名称，API URL 只作为辅助信息，不放入 URL 参数。

## 9. Electron 静态导出适配

静态导出可能生成 `out/state-workbench.html`（当前 Next 配置的默认行为），也可能在后续启用 trailing slash 后生成 `out/state-workbench/index.html`。当前 Electron 静态服务器只按请求路径查找文件，需同时支持两种产物：

1. 请求 `/state-workbench` 或 `/state-workbench/` 时依次尝试无扩展名文件、目录 `index.html` 和 `.html` 文件。
2. 保留现有路径穿越、符号链接和 CSP 校验。
3. 增加静态服务器测试，验证 `/`、`/state-workbench`、`/state-workbench/` 均返回 HTML，未知路径仍返回 404。

Electron 继续加载同一静态页面，不增加独立 Electron 页面或业务 API 代理。

## 10. 测试方案

### 单元测试

- 环境参数和 Tab 参数解析、非法值回退。
- Root URL 和 specialist URL/body 构造。
- 四个 namespace 映射完整且无别名错误。
- 搜索索引能命中字段名和值，大小写不敏感。
- 命中路径、祖先展开和上/下一个游标顺序。
- `checkpoint: null`、空数据、错误响应的状态归一化。
- request generation 能丢弃过期响应。

### 组件测试

- 三列标题、Need/Supply Tab 和统一搜索框存在。
- 查询后显示 loading/success/empty/error 状态。
- 搜索命中在多个面板同时高亮。
- Tab 切换触发懒加载且复用缓存。
- 刷新一个面板不改变另外两个面板。

### 构建与静态检查

```bash
pnpm exec prettier --check src/app/state-workbench src/components/state-workbench electron/main.cjs
pnpm exec tsc --noEmit
pnpm build
pnpm electron:build:static
pnpm exec git diff --check
```

如浏览器测试工具可用，再验证桌面和移动视口、URL 恢复、搜索跳转及 Electron 静态路由；否则明确区分构建通过与浏览器交互未验证。

## 11. 实施顺序

1. 抽取/补齐共享数据 helper 和类型，先覆盖 URL、body、namespace 测试。
2. 新增独立 App Router 页面和 RuntimeConfigProvider 挂载。
3. 完成三列布局、环境切换、thread 查询和独立请求状态。
4. 实现 gas/food Tab、懒加载、缓存、手动刷新和取消过期请求。
5. 实现 `SearchableJsonView`、全局索引、高亮和命中跳转。
6. 补充 Electron 静态目录索引解析。
7. 执行单元/组件测试、TypeScript、生产构建和静态 Electron 构建。
8. 做 Web/Electron 浏览器验证并记录未覆盖项。

## 12. 风险与取舍

- JSON 规模可能很大：默认限制展开深度，索引和渲染使用 `useMemo`，必要时对节点列表做增量化。
- `react-json-view-lite` 无高亮扩展点：本方案用本地 renderer 保证功能，避免引入未经验证的新依赖。
- 远端环境 CORS/证书问题属于运行环境前置条件；页面只复用现有直连请求方式，不新增代理架构。
- Root state 与 specialist state 的返回结构可能不同：viewer 接受任意 JSON，状态判断只依赖最小通用字段，不假设业务字段存在。
