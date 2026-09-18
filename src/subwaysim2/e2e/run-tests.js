import { createServer } from "node:net";
import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";

const explicitBaseUrl = process.env.BASE_URL;
const preferredPort = Number(process.env.E2E_PORT ?? 5173);
const testFiles = readdirSync("e2e").filter((name) => name.endsWith(".test.js")).sort().map((name) => `e2e/${name}`);
let server;
let baseUrl = explicitBaseUrl;

function canBind(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

async function findPort() {
  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    if (await canBind(port)) return port;
  }
  throw new Error(`No free E2E port found from ${preferredPort} to ${preferredPort + 19}`);
}

async function waitForServer(url) {
  const deadline = Date.now() + 15000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? "unknown error"}`);
}

function stopServer() {
  if (server && !server.killed) server.kill("SIGTERM");
}

async function runTests() {
  if (!explicitBaseUrl) {
    const port = await findPort();
    baseUrl = `http://127.0.0.1:${port}/`;
    server = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "inherit", env: process.env });
    server.on("exit", (code) => {
      if (code && !process.exitCode) process.exitCode = code;
    });
    await waitForServer(baseUrl);
  }
  const testProcess = spawn(process.execPath, ["--test", "--test-concurrency=1", "--test-timeout=120000", ...process.argv.slice(2), ...testFiles], { stdio: "inherit", env: { ...process.env, BASE_URL: baseUrl } });
  const [code, signal] = await new Promise((resolve, reject) => {
    testProcess.on("error", reject);
    testProcess.on("exit", (exitCode, exitSignal) => resolve([exitCode, exitSignal]));
  });
  return signal ? 1 : code ?? 1;
}

process.on("SIGINT", () => { stopServer(); process.exit(130); });
process.on("SIGTERM", () => { stopServer(); process.exit(143); });

try {
  process.exitCode = await runTests();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  stopServer();
}
