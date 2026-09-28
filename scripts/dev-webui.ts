/**
 * Cross-platform WebUI dev launcher (Windows-friendly replacement for
 * `server:dev:webui`, which relies on bash-only `$PWD` env prefixes).
 *
 * What it does:
 *   1. Builds the subprocess bundles (session-mcp-server, pi-agent-server) if missing.
 *   2. Builds the web UI bundle if missing (needs ~8GB Node heap on this repo).
 *   3. Starts the headless server on :9100 with the WebUI served from the same port.
 *
 * Env overrides:
 *   CRAFT_SERVER_TOKEN    — client auth token   (default: visaflow-dev-token)
 *   CRAFT_WEBUI_PASSWORD  — web login password  (default: visaflow)
 *   CRAFT_RPC_PORT        — server port         (default: 9100)
 *
 * Then open http://localhost:9100 and log in with the password.
 */

import { spawn, type Subprocess } from "bun";
import { existsSync } from "fs";
import { join, resolve } from "path";

const ROOT_DIR = resolve(import.meta.dir, "..");
const SERVER_ENTRY = join(ROOT_DIR, "packages/server/src/index.ts");
const SUBPROCESS_MCP_DIST = join(ROOT_DIR, "packages/session-mcp-server/dist");
const SUBPROCESS_PI_DIST = join(ROOT_DIR, "packages/pi-agent-server/dist");
const WEBUI_DIST = join(ROOT_DIR, "apps/webui/dist");

const SERVER_TOKEN = process.env.CRAFT_SERVER_TOKEN || "visaflow-dev-token";
const WEBUI_PASSWORD = process.env.CRAFT_WEBUI_PASSWORD || "visaflow";
const RPC_PORT = process.env.CRAFT_RPC_PORT || "9100";

function run(cmd: string[], label: string, extraEnv: Record<string, string> = {}): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    console.log(`\n🔨 ${label}...`);
    const proc = spawn({
      cmd,
      cwd: ROOT_DIR,
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env, ...extraEnv },
    });
    proc.exited.then((code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${label} failed with exit code ${code}`));
    });
  });
}

async function main() {
  if (!existsSync(SUBPROCESS_MCP_DIST) || !existsSync(SUBPROCESS_PI_DIST)) {
    await run([process.execPath, "run", "server:build:subprocess"], "Building subprocess bundles");
  } else {
    console.log("✅ Subprocess bundles present");
  }

  if (!existsSync(join(WEBUI_DIST, "index.html"))) {
    await run([process.execPath, "run", "webui:build"], "Building Web UI", {
      NODE_OPTIONS: "--max-old-space-size=8192",
    });
  } else {
    console.log("✅ Web UI bundle present");
  }

  console.log(`\n🚀 Starting server on :${RPC_PORT} (WebUI served from the same port)...`);
  const server: Subprocess = spawn({
    cmd: [process.execPath, SERVER_ENTRY],
    cwd: ROOT_DIR,
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      CRAFT_SERVER_TOKEN: SERVER_TOKEN,
      CRAFT_WEBUI_PASSWORD: WEBUI_PASSWORD,
      CRAFT_WEBUI_DIR: WEBUI_DIST,
      CRAFT_RPC_PORT: RPC_PORT,
      CRAFT_BUNDLED_ASSETS_ROOT: join(ROOT_DIR, "apps/electron"),
    },
  });

  // Wait briefly so early crashes (port in use, bad env) surface before we print the URL.
  const exitedEarly = await Promise.race([
    server.exited.then(() => true),
    new Promise<boolean>((r) => setTimeout(() => r(false), 3000)),
  ]);
  if (exitedEarly) {
    console.error("\n❌ Server exited during startup — see the log above.");
    process.exit(1);
  }

  console.log("\n──────────────────────────────────────────────────────");
  console.log(`  Web UI:  http://localhost:${RPC_PORT}`);
  console.log(`  Password: ${WEBUI_PASSWORD}`);
  console.log(`  Auth token: ${SERVER_TOKEN}`);
  console.log("  (首次使用需在设置里添加 LLM 连接后才能对话)");
  console.log("──────────────────────────────────────────────────────\n");

  const shutdown = () => { server.kill(); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  await server.exited;
}

main().catch((error) => {
  console.error("\n❌ Startup failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
