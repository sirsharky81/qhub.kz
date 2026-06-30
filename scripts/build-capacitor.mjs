import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const apiDir = path.join(root, "src", "app", "api");
const apiBackup = path.join(root, "src", "app", "_api_capacitor_backup");
const middlewareFile = path.join(root, "src", "middleware.ts");
const middlewareBackup = path.join(root, "src", "middleware.capacitor.bak.ts");
const lockFile = path.join(root, ".capacitor-build.lock");

function run(cmd, args, env = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function hideApiRoutes() {
  if (fs.existsSync(apiBackup)) {
    console.error(
      "[build-capacitor] Backup already exists — restoring first (previous build may have failed).",
    );
    restoreApiRoutes();
  }
  if (!fs.existsSync(apiDir)) {
    throw new Error("[build-capacitor] src/app/api is missing and cannot be backed up.");
  }
  fs.cpSync(apiDir, apiBackup, { recursive: true });
  fs.rmSync(apiDir, { recursive: true, force: true });

  if (fs.existsSync(middlewareFile)) {
    if (fs.existsSync(middlewareBackup)) fs.rmSync(middlewareBackup);
    fs.cpSync(middlewareFile, middlewareBackup);
    fs.rmSync(middlewareFile, { force: true });
  }
}

function restoreApiRoutes() {
  if (fs.existsSync(apiBackup)) {
    if (fs.existsSync(apiDir)) fs.rmSync(apiDir, { recursive: true, force: true });
    fs.cpSync(apiBackup, apiDir, { recursive: true });
    fs.rmSync(apiBackup, { recursive: true, force: true });
  }
  if (fs.existsSync(middlewareBackup)) {
    if (fs.existsSync(middlewareFile)) fs.rmSync(middlewareFile, { force: true });
    fs.cpSync(middlewareBackup, middlewareFile);
    fs.rmSync(middlewareBackup, { force: true });
  }
  if (!fs.existsSync(apiDir)) {
    throw new Error("[build-capacitor] Failed to restore src/app/api — run: git checkout -- src/app/api");
  }
}

if (fs.existsSync(lockFile)) {
  console.error("[build-capacitor] Another build is in progress (lock file exists). Aborting.");
  process.exit(1);
}

try {
  fs.writeFileSync(lockFile, String(process.pid));
  hideApiRoutes();
  run("node", ["scripts/build-pitch-worklet.mjs"]);
  run("npx", ["cross-env", "CAPACITOR_BUILD=1", "next", "build"]);
  run("npx", ["cap", "sync"]);
} finally {
  restoreApiRoutes();
  if (fs.existsSync(lockFile)) fs.rmSync(lockFile, { force: true });
}
