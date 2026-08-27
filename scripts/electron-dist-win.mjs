import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagingScript = path.join(root, "scripts", "electron-dist.mjs");

const child = spawn(process.execPath, [packagingScript, "--win"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

child.once("error", (error) => {
  console.error("Windows Electron packaging could not start:", error);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
