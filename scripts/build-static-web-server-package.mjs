import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "static-web-server-binaries");
const outputRoot = path.join(root, "dist-static-web-server");
const packageName = "agent-chat-ui-static-web-server";
const packageDir = path.join(outputRoot, packageName);
const zipTimestamp = formatBuildTimestamp(new Date());
const zipPath = path.join(outputRoot, `${packageName}-${zipTimestamp}.zip`);
const legacyZipPath = path.join(outputRoot, `${packageName}.zip`);
const tempRoot = await mkdtemp(
  path.join(os.tmpdir(), "agent-chat-ui-static-export-"),
);
const tempUi = path.join(tempRoot, "ui");

const macStartScript = `#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
SERVER="$SCRIPT_DIR/static-web-server"
UI_ROOT="$SCRIPT_DIR/ui"

if [ ! -x "$SERVER" ]; then
  echo "static-web-server is missing or not executable: $SERVER"
  exit 1
fi
if [ ! -f "$UI_ROOT/index.html" ]; then
  echo "UI files are missing: $UI_ROOT"
  exit 1
fi

cd "$SCRIPT_DIR"
URL="http://127.0.0.1:4000/"
"$SERVER" --port=4000 --root="$UI_ROOT" --log-level=info &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

READY=0
for attempt in $(seq 1 50); do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    open "$URL"
    READY=1
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "static-web-server stopped before it became ready."
    exit 1
  fi
  sleep 0.2
done

if [ "$READY" -ne 1 ]; then
  echo "Timed out waiting for static-web-server at $URL"
  exit 1
fi

echo "Agent Chat UI is available at $URL"
echo "Press Ctrl+C to stop the server."
wait "$SERVER_PID"
`;

const windowsStartScript = `@echo off
setlocal
cd /d "%~dp0"

if not exist "%~dp0static-web-server.exe" (
  echo static-web-server.exe is missing.
  pause
  exit /b 1
)
if not exist "%~dp0ui\\index.html" (
  echo UI files are missing.
  pause
  exit /b 1
)

echo Starting Agent Chat UI server...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$server = Start-Process -FilePath '%~dp0static-web-server.exe' -ArgumentList '--port=4000','--root=%~dp0ui','--log-level=info' -NoNewWindow -PassThru; $ready = $false; for ($i = 0; $i -lt 50; $i++) { try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4000/' -TimeoutSec 1 | Out-Null; Start-Process 'http://127.0.0.1:4000/'; $ready = $true; break } catch { if ($server.HasExited) { break }; Start-Sleep -Milliseconds 200 } }; if (-not $ready) { if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force }; throw 'Timed out waiting for static-web-server at http://127.0.0.1:4000/' }; Wait-Process -Id $server.Id"
echo.
echo Server stopped.
pause
`;

const readmeText = `Agent Chat UI 静态分发包

macOS：
1. 双击 start-macos.command。
2. 脚本会自动打开默认浏览器，访问 http://127.0.0.1:4000/。

Windows：
1. 双击 start-windows.bat。
2. 脚本会自动打开默认浏览器，访问 http://127.0.0.1:4000/。

使用界面期间，请保持启动脚本打开的终端窗口运行。
`;

try {
  await run(
    process.execPath,
    [path.join(root, "scripts", "build-electron-static.mjs")],
    {
      cwd: root,
      env: { ...process.env, STATIC_EXPORT_OUTPUT: tempUi },
    },
  );

  const macBinary = path.join(sourceRoot, "static-web-server");
  const windowsBinary = path.join(sourceRoot, "static-web-server.exe");
  await assertFile(macBinary, "macOS static-web-server binary");
  await assertFile(windowsBinary, "Windows static-web-server binary");
  await assertFile(path.join(tempUi, "index.html"), "static UI entrypoint");

  await rm(packageDir, { recursive: true, force: true });
  await rm(zipPath, { force: true });
  await rm(legacyZipPath, { force: true });
  await mkdir(packageDir, { recursive: true });
  await cp(tempUi, path.join(packageDir, "ui"), { recursive: true });
  await cp(macBinary, path.join(packageDir, "static-web-server"));
  await cp(windowsBinary, path.join(packageDir, "static-web-server.exe"));
  await chmod(path.join(packageDir, "static-web-server"), 0o755);
  await writeFile(
    path.join(packageDir, "start-macos.command"),
    macStartScript,
    { mode: 0o755 },
  );
  await writeFile(
    path.join(packageDir, "start-windows.bat"),
    windowsStartScript,
  );
  await writeFile(path.join(packageDir, "README.txt"), readmeText);

  await run("zip", ["-qr", zipPath, packageName], { cwd: outputRoot });
  const files = await readdir(packageDir);
  process.stdout.write(
    `Static Web Server package ready:\n- ${zipPath}\n- ${files.length} top-level package entries\n`,
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

async function assertFile(filePath, description) {
  try {
    await readFile(filePath);
  } catch {
    throw new Error(
      `Missing ${description}: ${filePath}\n` +
        "Download the matching static-web-server binaries into static-web-server-binaries/.",
    );
  }
}

function formatBuildTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return (
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join(
      "",
    ) +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) return resolve();
      reject(
        new Error(
          `${command} failed (code=${code}, signal=${signal ?? "none"})`,
        ),
      );
    });
  });
}
