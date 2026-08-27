import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electronCli = require.resolve("electron/cli.js");
const nextBin = require.resolve("next/dist/bin/next");
const port = Number(process.env.ELECTRON_DEV_PORT || 3000);
const rendererUrl = `http://127.0.0.1:${port}`;

const next = spawn(
  process.execPath,
  [nextBin, "dev", "-H", "127.0.0.1", "-p", String(port)],
  {
    stdio: "inherit",
    env: process.env,
  },
);

let electron;
let shuttingDown = false;
let shutdownPromise;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void shutdown(130);
  });
}

try {
  await waitForHttp(rendererUrl, 30_000);
  electron = spawn(process.execPath, [electronCli, "."], {
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RENDERER_URL: rendererUrl },
  });
  const code = await new Promise((resolve, reject) => {
    electron.once("error", reject);
    electron.once("exit", (exitCode, signal) =>
      resolve(exitCode ?? (signal ? 1 : 0)),
    );
  });
  process.exitCode = code;
} finally {
  await shutdown(process.exitCode ?? 0);
}

next.once("exit", (code) => {
  if (!shuttingDown && code !== 0) process.exitCode = code ?? 1;
});

async function shutdown(code) {
  if (shutdownPromise) return shutdownPromise;
  shuttingDown = true;
  shutdownPromise = Promise.all([stopChild(electron), stopChild(next)]).then(
    () => {
      process.exitCode = code;
    },
  );
  return shutdownPromise;
}

function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Timed out waiting for ${url}: ${lastError?.message ?? "unknown error"}`,
  );
}
