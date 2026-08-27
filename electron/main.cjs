const { app, BrowserWindow, shell, ipcMain } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

let mainWindow;
let staticServer;
const staticConnections = new Set();
let uiOrigin;
let settingsWrite = Promise.resolve();
let quitting = false;

const SETTINGS_FILE_NAME = "settings.json";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function getUiRoot() {
  if (app.isPackaged) return path.join(process.resourcesPath, "ui");
  return path.join(__dirname, "..", ".electron-build", "ui");
}

function contentSecurityPolicy() {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' http: https: ws: wss:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

async function resolveStaticFile(root, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  if (!relative || relative.includes("\0")) return null;

  const rootReal = await fsp.realpath(root);
  const candidate = path.resolve(rootReal, relative);
  if (
    candidate !== rootReal &&
    !candidate.startsWith(`${rootReal}${path.sep}`)
  ) {
    return null;
  }

  const stats = await fsp.stat(candidate).catch(() => null);
  if (!stats?.isFile()) return null;
  const candidateReal = await fsp.realpath(candidate);
  if (
    candidateReal !== rootReal &&
    !candidateReal.startsWith(`${rootReal}${path.sep}`)
  ) {
    return null;
  }
  return candidateReal;
}

async function startStaticServer() {
  const root = getUiRoot();
  await fsp.access(path.join(root, "index.html"));
  staticServer = http.createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }

    let pathname;
    try {
      pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }

    let filePath;
    try {
      filePath = await resolveStaticFile(root, pathname);
    } catch {
      filePath = null;
    }
    if (!filePath) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const contentType =
      MIME_TYPES[path.extname(filePath).toLowerCase()] ??
      "application/octet-stream";
    response.writeHead(200, {
      "Cache-Control": pathname.startsWith("/_next/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
      "Content-Security-Policy": contentSecurityPolicy(),
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    fs.createReadStream(filePath)
      .on("error", () => response.destroy())
      .pipe(response);
  });
  staticServer.on("connection", (socket) => {
    staticConnections.add(socket);
    socket.once("close", () => staticConnections.delete(socket));
  });

  await new Promise((resolve, reject) => {
    staticServer.once("error", reject);
    staticServer.listen(0, "127.0.0.1", resolve);
  });
  const address = staticServer.address();
  if (!address || typeof address === "string")
    throw new Error("Static server did not expose a TCP port");
  return `http://127.0.0.1:${address.port}`;
}

function isAllowedUiUrl(url) {
  try {
    return new URL(url).origin === uiOrigin;
  } catch {
    return false;
  }
}

function isExternalHttpUrl(url) {
  try {
    const protocol = new URL(url).protocol.toLowerCase();
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function isTrustedSender(event) {
  return Boolean(
    uiOrigin && event.senderFrame && isAllowedUiUrl(event.senderFrame.url),
  );
}

async function readSettings() {
  const filePath = path.join(app.getPath("userData"), SETTINGS_FILE_NAME);
  try {
    const parsed = JSON.parse(await fsp.readFile(filePath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (error) {
    if (error?.code !== "ENOENT")
      console.error("Failed to read settings:", error);
    return {};
  }
}

function registerSettingsIpc() {
  ipcMain.handle("desktop:get-settings", async (event) => {
    if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
    return readSettings();
  });
  ipcMain.handle("desktop:save-settings", async (event, settings) => {
    if (!isTrustedSender(event)) throw new Error("Untrusted IPC sender");
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      throw new Error("Invalid settings payload");
    }
    const serialized = JSON.stringify(settings);
    if (serialized.length > 256 * 1024)
      throw new Error("Settings payload too large");
    const filePath = path.join(app.getPath("userData"), SETTINGS_FILE_NAME);
    const tempPath = `${filePath}.tmp`;
    settingsWrite = settingsWrite
      .catch(() => undefined)
      .then(async () => {
        await fsp.mkdir(path.dirname(filePath), { recursive: true });
        await fsp.writeFile(tempPath, serialized, "utf8");
        await fsp.rename(tempPath, filePath);
      });
    return settingsWrite;
  });
}

function installNavigationGuards() {
  const webContents = mainWindow.webContents;
  webContents.on("will-navigate", (event, url) => {
    if (!isAllowedUiUrl(url)) {
      event.preventDefault();
      if (isExternalHttpUrl(url)) void shell.openExternal(url);
    }
  });
  webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
}

async function createMainWindow() {
  const rendererUrl =
    process.env.ELECTRON_RENDERER_URL || (await startStaticServer());
  uiOrigin = new URL(rendererUrl).origin;
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
      webSecurity: true,
    },
  });
  registerSettingsIpc();
  installNavigationGuards();
  await mainWindow.loadURL(rendererUrl);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function closeStaticServer() {
  if (!staticServer) return;
  const server = staticServer;
  staticServer = null;
  await new Promise((resolve) => {
    server.close(() => resolve());
    for (const socket of staticConnections) socket.destroy();
  });
  staticConnections.clear();
}

function requestQuit() {
  if (quitting) return;
  quitting = true;
  void closeStaticServer().finally(() => {
    app.exit(0);
    // Electron can keep the macOS application process alive after app.exit().
    process.exit(0);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  process.on("SIGINT", requestQuit);
  process.on("SIGTERM", requestQuit);
  app
    .whenReady()
    .then(createMainWindow)
    .catch((error) => {
      console.error("Failed to start Electron UI:", error);
      app.quit();
    });
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on("before-quit", (event) => {
    if (!staticServer) return;
    event.preventDefault();
    closeStaticServer().finally(() => {
      app.exit(0);
      process.exit(0);
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
