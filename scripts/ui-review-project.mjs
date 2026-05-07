#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectName = process.argv[2] ?? "landing-page";
const projectConfigPath = resolve(
  repoRoot,
  "tests",
  "ui-review",
  "projects",
  projectName,
  "ui-review.project.mjs",
);
const projectModule = await import(pathToFileURL(projectConfigPath).href).catch(
  (error) => {
    console.error(
      `Could not load UI review project adapter: ${projectConfigPath}`,
    );
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);

const config =
  typeof projectModule.default === "function"
    ? projectModule.default({ repoRoot })
    : projectModule.default;

if (!config?.baseURL) {
  console.error(
    `UI review adapter "${projectName}" did not provide a baseURL.`,
  );
  process.exit(1);
}

const serverProcesses = [];

process.on("SIGINT", () => {
  stopServers();
  process.exit(130);
});
process.on("SIGTERM", () => {
  stopServers();
  process.exit(143);
});
process.on("exit", stopServers);

try {
  for (const command of config.buildCommands ?? []) {
    await runCommand(command, { label: "build" });
  }

  for (const command of config.startCommands ?? []) {
    serverProcesses.push(startServer(command));
  }

  await waitForUrl(config.baseURL, config.waitTimeoutMs ?? 60_000);

  await runCommand(
    {
      command: "npm",
      args: [
        "exec",
        "--",
        "playwright",
        "test",
        "-c",
        "tests/ui-review/playwright.config.ts",
      ],
      cwd: repoRoot,
      env: {
        UI_REVIEW_BASE_URL: config.baseURL,
        UI_REVIEW_OUTPUT:
          config.output ?? `layout-review-summary-${projectName}.md`,
        UI_REVIEW_PAGES: JSON.stringify(
          config.pages ?? [{ name: "home", path: "/" }],
        ),
        UI_REVIEW_STATES: (config.states ?? ["default"]).join(","),
      },
    },
    { label: "ui-review" },
  );
} finally {
  for (const command of config.stopCommands ?? []) {
    await runCommand(command, { label: "stop", rejectOnFailure: false });
  }
  stopServers();
}

function startServer(command) {
  const child = spawn(command.command, command.args ?? [], {
    cwd: resolveCwd(command.cwd),
    env: { ...process.env, ...(command.env ?? {}) },
    shell: command.shell ?? false,
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(`Server command exited with ${code}: ${command.command}`);
    }
    if (signal) {
      console.error(
        `Server command exited with signal ${signal}: ${command.command}`,
      );
    }
  });
  return child;
}

function stopServers() {
  for (const child of serverProcesses.splice(0)) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

function runCommand(command, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command.command, command.args ?? [], {
      cwd: resolveCwd(command.cwd),
      env: { ...process.env, ...(command.env ?? {}) },
      shell: command.shell ?? false,
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0 || options.rejectOnFailure === false) {
        resolvePromise();
        return;
      }
      reject(
        new Error(
          `${options.label ?? "command"} failed with exit code ${code}`,
        ),
      );
    });
  });
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }

  throw new Error(
    `Timed out waiting for ${url}${lastError instanceof Error ? `: ${lastError.message}` : ""}`,
  );
}

function resolveCwd(cwd) {
  return cwd ? resolve(repoRoot, cwd) : repoRoot;
}
