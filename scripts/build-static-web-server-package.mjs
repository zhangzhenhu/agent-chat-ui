import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, ".electron-build");
const outputRoot = path.join(root, "dist-static-web-server");
const packageName = "agent-chat-ui-static-web-server";
const packageDir = path.join(outputRoot, packageName);
const zipPath = path.join(outputRoot, `${packageName}.zip`);
const tempRoot = await mkdtemp(
  path.join(os.tmpdir(), "agent-chat-ui-static-export-"),
);
const tempUi = path.join(tempRoot, "ui");
const legacyUi = path.join(sourceRoot, "ui");

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
echo "Agent Chat UI is available at http://127.0.0.1:4000/"
echo "Press Ctrl+C to stop the server."
exec "$SERVER" --port=4000 --root="$UI_ROOT" --log-level=info
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

echo Agent Chat UI is available at http://127.0.0.1:4000/
echo Close this window or press Ctrl+C to stop the server.
"%~dp0static-web-server.exe" --port=4000 --root="%~dp0ui" --log-level=info
echo.
echo Server stopped.
pause
`;

const readmeText = `Agent Chat UI static package

macOS:
1. Double-click start-macos.command.
2. Open http://127.0.0.1:4000/ in a browser.

Windows:
1. Double-click start-windows.bat.
2. Open http://127.0.0.1:4000/ in a browser.

The terminal window must remain open while using the UI.
`;

try {
  await run(process.execPath, [
    path.join(root, "scripts", "build-electron-static.mjs"),
  ], {
    cwd: root,
    env: { ...process.env, STATIC_EXPORT_OUTPUT: tempUi },
  });

  const macBinary = path.join(sourceRoot, "static-web-server");
  const windowsBinary = path.join(sourceRoot, "static-web-server.exe");
  await assertFile(macBinary, "macOS static-web-server binary");
  await assertFile(windowsBinary, "Windows static-web-server binary");
  await assertFile(path.join(tempUi, "index.html"), "static UI entrypoint");

  await rm(packageDir, { recursive: true, force: true });
  await rm(zipPath, { force: true });
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
  await writeFile(path.join(packageDir, "start-windows.bat"), windowsStartScript);
  await writeFile(
    path.join(packageDir, "README.txt"),
    readmeText,
  );

  await run("zip", ["-qr", zipPath, packageName], { cwd: outputRoot });
  await rm(legacyUi, { recursive: true, force: true });
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
        "Download the matching static-web-server binaries into .electron-build/.",
    );
  }
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
