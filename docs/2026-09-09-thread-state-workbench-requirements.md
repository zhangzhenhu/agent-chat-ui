# Thread State Workbench 需求文档

## 1. 文档信息

- 日期：2026-09-09
- 状态：需求已确认，待开发
- 页面 URL：`/state-workbench`
- 目标：为人工 case 追查提供 Root state 和 specialist state 的只读查看页面。

## 2. 已确认范围

1. 页面使用独立 URL `/state-workbench`，可在多个浏览器 Tab 中同时打开不同 case。
2. 不做自动轮询，只提供进入页面时的查询和手动刷新。
3. Need、Supply 领域统一使用两个 Tab：`gas`、`food`；界面可显示为“用气”“美食”。
4. 搜索覆盖 Root、Need、Supply 三个面板，所有命中位置均高亮。
5. 不需要额外的登录、权限控制、原始响应诊断、HTTP 耗时展示。
6. 页面需要同时支持 Web 和 Electron 应用。
7. 本地环境地址为 `http://localhost:8000`。

## 3. 环境配置

页面提供环境切换控件，内置以下环境：

| 环境 | API Base URL |
| --- | --- |
| 本地 | `http://localhost:8000` |
| SI | `https://sidemandintel.ecej.com` |
| ST | `https://stdemandintel.ecej.com` |
| 生产 | `https://demandintel.ecej.com` |

环境和查询条件需要同步到 URL，建议格式：

```text
/state-workbench?env=prod&thread_id=01a0794b-d979-7bd0-939a-657924e40a59
```

页面加载时如果 URL 已包含 `thread_id`，自动查询；否则等待用户输入。切换环境后清除旧数据，防止不同环境状态混淆。

## 4. Thread ID 查询

- 页面顶部提供 `thread_id` 输入框和查询按钮。
- 支持 Enter 查询，自动去除首尾空格。
- 空值时禁止查询并提示。
- 不强制 UUID 格式，但格式异常时给出非阻断警告。
- 查询成功或失败后均保留当前输入和 URL 参数。
- 不提供自动刷新；每个面板提供独立的手动刷新按钮。

## 5. 数据接口

### 5.1 Root state

```http
GET {API_BASE}/threads/{thread_id}/state/
```

### 5.2 Specialist state

```http
POST {API_BASE}/threads/{thread_id}/state/checkpoint
Content-Type: application/json
```

请求体：

```json
{
  "checkpoint": {
    "thread_id": "01a0794b-d979-7bd0-939a-657924e40a59",
    "checkpoint_ns": "specialist__gas_need_specialist",
    "checkpoint_id": "",
    "checkpoint_map": {}
  },
  "subgraphs": true
}
```

领域与后端 namespace 映射：

| 面板 | Tab | `checkpoint_ns` |
| --- | --- | --- |
| Need | gas / 用气 | `specialist__gas_need_specialist` |
| Need | food / 美食 | `specialist__food_need_specialist` |
| Supply | gas / 用气 | `specialist__gas_supply_specialist` |
| Supply | food / 美食 | `specialist__food_supply_specialist` |

Root state、Need state、Supply state 的请求状态相互独立。默认加载 Root、Need/gas、Supply/gas；其他 Tab 首次切换时懒加载，已加载内容可缓存。

## 6. 页面布局

桌面端固定为三列：

```text
┌────────────────┬────────────────┬────────────────┐
│ Root state     │ Need specialist│ Supply specialist│
│                │ [gas] [food]    │ [gas] [food]      │
│ JSON viewer    │ JSON viewer     │ JSON viewer      │
└────────────────┴────────────────┴────────────────┘
```

- 第一列展示 Root state。
- 第二列展示 Need specialist state，并提供 gas/food Tab。
- 第三列展示 Supply specialist state，并提供 gas/food Tab。
- 小屏幕下改为上下排列或可横向滚动，三个面板仍在同一页面。
- 每个面板有独立滚动区域，避免一个大 JSON 影响整页布局。

## 7. JSON 展示

复用项目已有的 `react-json-view-lite`：

- 对象和数组支持折叠、展开。
- 默认展开合理层级，避免超大 state 造成页面卡顿。
- 字段名、字符串、数字、布尔值、空值使用不同颜色。
- 支持深层 JSON 滚动查看。
- 支持复制当前面板 JSON。
- `checkpoint: null`、空对象、接口错误分别展示清晰的空状态或错误状态。
- 不修改、不裁剪接口返回字段。

## 8. 全局 JSON 搜索

页面提供一个统一搜索框，搜索范围覆盖三个面板当前展示的 JSON：

- 同时搜索字段名和值。
- 大小写不敏感。
- 所有面板中的命中位置均高亮。
- 自动展开包含命中项的父节点。
- 显示总命中数量。
- 支持上一个/下一个命中项，并自动滚动到对应面板和节点。
- 切换 specialist Tab 后，搜索结果重新计算。

## 9. 状态反馈

每个面板需要支持以下状态：

- 未查询：提示输入 `thread_id`。
- 加载中：显示加载指示。
- 成功：显示 JSON 和最近更新时间。
- 空结果：明确说明当前 namespace 没有 checkpoint/state。
- 失败：显示简洁错误信息和重试按钮。

刷新失败时保留上一次成功数据，同时标记本次刷新失败。

## 10. URL 与多 Tab

URL 至少保存：

- 当前环境 `env`
- 当前 `thread_id`

建议同时保存当前 Need、Supply Tab。浏览器复制 URL 或新开 Tab 后，应恢复相同环境、线程和 Tab，不共享其他 Tab 的临时状态。

## 11. Web 与 Electron

- Web 端通过 Next.js 独立路由提供 `/state-workbench`。
- Electron 端加载同一页面路由，不另建一套页面逻辑。
- 复用现有运行时环境配置和 API 请求封装。
- API 地址不写死在页面组件中，环境切换只改变当前请求 Base URL。
- 如果后端要求认证，复用现有配置，但不把密钥放入 URL。

## 12. 非目标

- 不支持修改 state、checkpoint 或执行任务。
- 不支持自动轮询。
- 不增加权限管理系统。
- 不展示请求耗时、完整原始 HTTP 响应或调试日志面板。

## 13. 验收标准

- `/state-workbench` 可直接访问，并可通过 URL 打开多个不同 case。
- 四个环境可切换，且本地地址为 `http://localhost:8000`。
- 输入 thread ID 后能分别请求 Root、Need、Supply state。
- Need 和 Supply 均可切换 gas/food，并使用正确 namespace。
- 三列 JSON 均可折叠、展开、滚动、复制。
- 一个搜索框可以跨三列搜索，命中节点全部高亮，并支持跳转。
- 页面刷新策略为手动刷新，无自动轮询。
- Web 和 Electron 展示与交互一致。
- 空结果、加载中、请求失败均有明确反馈。
- 不影响现有聊天功能。
