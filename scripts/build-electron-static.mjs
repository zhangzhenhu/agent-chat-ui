import { cp, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const staging = await mkdtemp(path.join(os.tmpdir(), "agent-chat-ui-static-"));
const outputRoot = path.join(root, ".electron-build");
const outputDir = path.join(outputRoot, "ui");

const excluded = new Set([
  ".git",
  ".next",
  ".electron-build",
  "node_modules",
  "out",
]);

try {
  await cp(root, staging, {
    recursive: true,
    filter(source) {
      const relative = path.relative(root, source);
      const firstSegment = relative.split(path.sep)[0];
      return !excluded.has(firstSegment);
    },
  });

  // Keep dependencies available without copying node_modules into the staging tree.
  await symlink(
    path.join(root, "node_modules"),
    path.join(staging, "node_modules"),
    "junction",
  );

  // The Web deployment may keep this proxy route, but it is not valid input to a static export.
  await rm(path.join(staging, "src", "app", "api"), {
    recursive: true,
    force: true,
  });

  const nextBin = path.join(
    staging,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  await run(process.execPath, [nextBin, "build"], {
    cwd: staging,
    env: { ...process.env, ELECTRON_STATIC_BUILD: "1" },
  });

  const builtIndex = path.join(staging, "out", "index.html");
  await readFile(builtIndex);
  await rm(outputDir, { recursive: true, force: true });
  await cp(path.join(staging, "out"), outputDir, { recursive: true });
  await readFile(path.join(outputDir, "default-params.json"));
  process.stdout.write(`Electron static UI prepared at ${outputDir}\n`);
} finally {
  await rm(staging, { recursive: true, force: true });
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) return resolve();
      reject(
        new Error(
          `Static build failed (code=${code}, signal=${signal ?? "none"})`,
        ),
      );
    });
  });
}
