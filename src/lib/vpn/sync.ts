import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getVpnServerConfig } from "./env";

const execFileAsync = promisify(execFile);

export async function triggerVpnSync(): Promise<void> {
  const { syncCommand } = getVpnServerConfig();
  if (!syncCommand) return;

  try {
    await execFileAsync("bash", ["-lc", syncCommand], {
      timeout: 15_000,
      env: process.env,
    });
  } catch (error) {
    console.error("[vpn] sync failed:", error);
  }
}
