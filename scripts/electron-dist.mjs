import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const staticBuildScript = fileURLToPath(
  new URL("build-electron-static.mjs", import.meta.url),
);
const electronBuilderCli = require.resolve("electron-builder/cli.js");
const rootPackage = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);

const explicitTarget = process.argv[2];
const targetArgSets = getTargetArgSets(explicitTarget);

await run(process.execPath, [staticBuildScript]);
for (const targetArgs of targetArgSets) {
  await buildElectronApp(targetArgs);
}

async function buildElectronApp(targetArgs) {
  const staging = await mkdtemp(
    path.join(os.tmpdir(), "agent-chat-ui-electron-"),
  );
  try {
    const stagingElectron = path.join(staging, "electron");
    await mkdir(stagingElectron, { recursive: true });
    await cp(
      path.join(root, "electron", "main.cjs"),
      path.join(stagingElectron, "main.cjs"),
    );
    await cp(
      path.join(root, "electron", "preload.cjs"),
      path.join(stagingElectron, "preload.cjs"),
    );

    const electronVersion = String(
      rootPackage.devDependencies?.electron ?? "",
    ).replace(/^[^0-9]*/, "");
    if (!electronVersion) {
      throw new Error("Unable to determine the Electron version");
    }

    await writeFile(
      path.join(staging, "package.json"),
      JSON.stringify(
        {
          name: "agent-chat-electron",
          version: rootPackage.version,
          description: rootPackage.description,
          author: rootPackage.author,
          private: true,
          main: "electron/main.cjs",
          build: {
            appId: "com.ecej.agentchatui",
            productName: "Agent Chat UI",
            electronVersion,
            electronLanguages: ["en", "zh_CN"],
            directories: {
              output: path.join(root, "dist-electron"),
            },
            files: ["electron/*.cjs", "package.json"],
            extraResources: [
              {
                from: path.join(root, ".electron-build", "ui"),
                to: "ui",
              },
            ],
            mac: {
              identity: null,
            },
          },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    await run(process.execPath, [electronBuilderCli, ...targetArgs], {
      cwd: staging,
    });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

function getTargetArgSets(target) {
  if (target === "--dmg") {
    if (process.platform !== "darwin") {
      throw new Error("The DMG target can only be built on macOS");
    }
    return [["--mac", "dmg"]];
  }

  if (target === "--all") {
    return [
      ["--mac", "zip"],
      ["--win", "nsis", "--x64"],
    ];
  }

  if (target === "--win") {
    return [["--win", "nsis", "--x64"]];
  }

  if (target) throw new Error(`Unknown Electron target: ${target}`);
  if (process.platform === "darwin") return [["--mac", "zip"]];
  if (process.platform === "win32") return [["--win", "nsis", "--x64"]];
  return [["--linux", "AppImage", "deb"]];
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      ...options,
      stdio: "inherit",
      env: process.env,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) return resolve();
      reject(
        new Error(
          `Electron packaging failed (code=${code}, signal=${signal ?? "none"})`,
        ),
      );
    });
  });
}
