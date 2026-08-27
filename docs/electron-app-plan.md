# Electron 应用方案与当前实现状态

本文记录当前仓库的 Electron 接入方案、已经落地的内容和发布前仍需补齐的事项。结论基于 2026-08-26 的代码和构建验证。

## 1. 先说结论

当前代码已经具备“静态构建并启动 Electron”的验证条件，但还没有达到完整生产发布条件。

本期采用的唯一运行架构是：

```text
Next.js（只在构建阶段）
        │ 生成 out/
        ▼
Electron Main（运行时启动只读静态文件服务器）
        │  http://127.0.0.1:<动态端口>/
        ▼
Renderer（现有 React 页面） ──HTTP 直连──> LangGraph 环境
```

生产 Electron 进程不启动 Next server，也不使用本项目的 `/api/[..._path]` 代理。Next server 只在 `pnpm electron:dev` 的开发模式中运行，用于热更新。

## 2. 两种方案到底有什么区别

这里的“两种方案”指的是 Electron 如何加载静态页面，不是两套业务架构：

| 方案                      | 页面来源                                             | 生产是否启动 Next server | 说明                                                                         | 本期选择         |
| ------------------------- | ---------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------- | ---------------- |
| 静态文件 + 内置 HTTP 服务 | Electron Main 读取 `out/`，通过 `127.0.0.1` 提供文件 | 否                       | 兼容普通 HTTP 资源和 CORS，安全边界容易检查                                  | **是**           |
| `app://` 自定义协议       | Electron 注册协议，直接把请求映射到 `out/`           | 否                       | 可以不监听本地端口，但后端必须额外允许 `app://` Origin，协议和路径处理更复杂 | 否，作为后续优化 |

因此，用户实际只需要记住一句话：**生产包里没有 Next server，Electron 自己提供已经构建好的 HTML、JS、CSS 和 JSON 文件。**

`file://`/`loadFile()` 没有作为本期方案。它会带来额外的 Origin/CORS 和本地文件访问边界问题，不如当前 localhost 方案可控。

## 3. 已实现内容

### 构建和打包

- `next.config.mjs` 在 `ELECTRON_STATIC_BUILD=1` 时启用 `output: "export"`。
- 静态构建将 Web API Passthrough route 从 staging tree 中排除；Web 部署仍保留该 route。
- 静态构建开启 `next/image` 的 `unoptimized`，适配静态导出。
- `scripts/build-electron-static.mjs` 生成并校验 `.electron-build/ui/index.html`、`_next/` 和 `default-params.json`。
- `electron-builder` 使用 `extraResources` 将静态文件放到打包应用的 `resources/ui`。

### Electron 运行时

- `electron/main.cjs` 启动只读静态文件服务器，监听 `127.0.0.1` 的动态空闲端口。
- 只允许 `GET`/`HEAD`，检查路径穿越和符号链接逃逸，响应带 CSP 和 `nosniff`。
- BrowserWindow 使用 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true` 和 `webSecurity: true`。
- 已有单实例锁、窗口导航限制、外部 HTTP(S) 链接转交系统浏览器、IPC sender 校验和退出时关闭静态服务。
- `electron/preload.cjs` 只暴露 `desktopRuntime`、`getSettings()`、`saveSettings()`，不暴露完整 `ipcRenderer`。

### 运行时配置

- 内置环境：`local` (`http://localhost:8000`)、`si`、`st`、`prod`。
- Electron 的环境、API Key、认证 scheme 和 assistant ID 写入 `app.getPath("userData")/settings.json`。
- Web 端继续兼容现有 `?apiUrl=` 和环境变量行为。
- Electron 分支的实际请求地址已经改为从 runtime config 取值，而不是依赖 query 中的地址。
- 配置加载完成前不会创建线程和流式 provider，避免首屏使用空地址发请求。

## 4. 如何运行

```bash
# 普通 Web 开发
pnpm dev

# Electron 开发：Next dev + Electron（需要 Next server，支持热更新）
pnpm electron:dev

# 只生成 Electron 静态 UI，不启动 Electron
pnpm electron:build:static

# 生成安装包：静态构建 + electron-builder
pnpm electron:dist

# Windows 独立构建：生成 x64 NSIS 安装包
pnpm electron:dist:win

# macOS 可选 DMG（需要 dmgbuild 下载/可用）
pnpm electron:dist:dmg
```

`electron:dist` 在 macOS 默认生成 ZIP；`electron:dist:dmg` 是显式的 DMG 构建入口。生产包启动时不需要目标机器安装 Node，也不需要运行 `next start`。Electron 使用自身内置的 Node API 读取打包资源并启动微型静态文件服务。

一次构建 macOS ZIP 和 Windows x64 NSIS 安装包：

```bash
pnpm electron:dist:all
```

该命令只构建一次静态 UI，然后依次执行两个平台的 Electron 打包。若从 macOS 或 Linux 交叉构建 Windows 安装包，需要预先安装 Wine；在 Windows 上运行时则直接生成 Windows x64 安装包。

在 Windows 电脑上只构建 Windows 安装包时，执行：

```bash
pnpm install
pnpm electron:dist:win
```

产物位于 `dist-electron/`，文件名类似 `Agent Chat UI Setup 0.0.0.exe`。该入口会自动完成静态 UI 构建，不需要先运行 `pnpm build` 或启动 Next server。

当前已验证：TypeScript、Node 语法、Prettier、静态构建、`electron-builder --dir`、macOS arm64 ZIP、ZIP 完整性、窗口首页、`default-params.json`、CSP 和 settings IPC。

## 5. Web 与 Electron 的边界

| 能力           | Web                                     | Electron                                               |
| -------------- | --------------------------------------- | ------------------------------------------------------ |
| 页面服务       | Next dev/部署平台                       | Electron 内置静态服务器                                |
| LangGraph 请求 | 现有 Web 行为，可经过 `/api/[..._path]` | Renderer 直接请求选中的 LangGraph URL                  |
| `apiUrl` 来源  | query/env 兼容逻辑                      | runtime config；目标是不读写 `?apiUrl=`                |
| 设置持久化     | 浏览器存储                              | `userData/settings.json`                               |
| API Key        | 当前 Web 存储方式                       | 当前明文写入 settings；Renderer 发送请求时仍可取得明文 |

Electron 直连要求远端允许动态端口的本地 Origin CORS，并允许 SDK 实际使用的请求方法和请求头。已对 `si`、`st`、`prod` 做过 `/info` 和 OPTIONS 预检验证；这属于当前环境快照，发布前仍需自动化复核。

## 6. 尚未完成的事项

这些是发布前的真实缺口，不是静态架构的前置条件：

1. **自定义环境 UI**：runtime context 已有 `saveEnvironment`/`deleteEnvironment`，但界面目前主要提供环境选择和地址输入，尚缺完整的新增、编辑、删除、恢复默认入口。
2. **切换环境的统一生命周期**：直接调用 `selectEnvironment()` 还不能保证所有线程、assistant、工作台缓存和进行中的请求都被集中清理；需要 generation 和过期响应丢弃机制。
3. **彻底移除 Electron 的 query 读取**：部分 provider 仍注册 `useQueryState("apiUrl")` 后再忽略其值，需要进一步隔离 Electron 分支，确保不读也不写该参数。
4. **测试补齐**：URL 校验、损坏 settings 迁移、环境 CRUD、切换时序、静态服务路径安全、IPC sender 校验和 Electron URL 不含 `apiUrl`。
5. **开发脚本退出清理**：`scripts/electron-dev.mjs` 还需完善 SIGINT/SIGTERM 下的子进程回收。
6. **发布物料**：当前使用默认 Electron 图标；还需正式图标、签名、公证和多平台 CI。
7. **凭证安全**：settings 中的 API Key 目前是明文。`safeStorage` 只能保护磁盘静态存储，不能让 Renderer 直连时看不到明文；若有此要求，需要改成 Main 代理请求，属于另一项架构变更。

## 7. 发布验收标准

进入正式发布前至少完成：

- 在干净 checkout 执行 `pnpm electron:dist` 并启动实际安装包。
- 确认生产 Electron 进程没有 Next 子进程，静态服务可正常关闭。
- 四个环境分别验证 `/info`、assistant 查询、创建 thread 和一次 stream；确认请求没有走本项目 `/api`。
- 验证新增/编辑/删除自定义环境以及重启后的 settings 持久化。
- 验证切换环境不会显示旧环境的 thread、assistant、思考缓存或工作台数据。
- 在目标平台补齐资源路径、安装/卸载、签名和升级验证。

## 8. 当前决策记录

- `local` 的 Electron 默认地址为 `http://localhost:8000`；Web 端旧默认值是否改为 8000，需要后端确认后单独决定。
- 默认选中环境为 `st`。
- 第一版 API Key 不按环境隔离；它会被发送到当前选中的 LangGraph 环境。
- 保留 Web API Passthrough route，直到 Web 部署完成独立迁移；删除该 route 不是 Electron 接入的必要步骤。
- `app://` 方案暂不实施，只有在“完全不监听本地 HTTP 端口”成为硬要求时再评估，并先验证后端 CORS。
