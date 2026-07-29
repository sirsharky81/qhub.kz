import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getVpnServerConfig } from "./env";

const execFileAsync = promisify(execFile);

export type VpnSyncResult =
  | { ok: true }
  | { ok: false; error: string };

export async function triggerVpnSync(): Promise<VpnSyncResult> {
  const { syncCommand } = getVpnServerConfig();
  if (!syncCommand) {
    return { ok: false, error: "VPN_SYNC_COMMAND не задан" };
  }

  try {
    await execFileAsync("bash", ["-lc", syncCommand], {
      timeout: 15_000,
      env: process.env,
      cwd: process.env.APP_DIR || process.cwd(),
    });
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr.trim() || error.message
        : error instanceof Error
          ? error.message
          : String(error);
    console.error("[vpn] sync failed:", error);
    return { ok: false, error: message };
  }
}
