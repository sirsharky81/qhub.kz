import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "out");
const shellDir = path.join(root, "capacitor-shell");
const lockFile = path.join(root, ".capacitor-build.lock");

function run(cmd, args, env = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** Minimal offline fallback — runtime UI loads from server.url (www.qhub.kz). */
function ensureCapacitorWebDir() {
  if (!fs.existsSync(shellDir)) {
    throw new Error("[build-capacitor] capacitor-shell/ is missing.");
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.cpSync(shellDir, outDir, { recursive: true });
}

if (fs.existsSync(lockFile)) {
  console.error("[build-capacitor] Another build is in progress (lock file exists). Aborting.");
  process.exit(1);
}

try {
  fs.writeFileSync(lockFile, String(process.pid));
  ensureCapacitorWebDir();
  run("npx", ["cap", "sync"]);
} finally {
  if (fs.existsSync(lockFile)) fs.rmSync(lockFile, { force: true });
}
