import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function getWireGuardLiveStatus(
  iface = process.env.VPN_INTERFACE || "wg0",
): Promise<{ listenPort: number | null; peerCount: number }> {
  try {
    const { stdout } = await execFileAsync("wg", ["show", iface], { timeout: 5000 });
    const portMatch = stdout.match(/listening port:\s*(\d+)/);
    const peerCount = stdout.split("\n").filter((line) => line.trim().startsWith("peer:")).length;
    return {
      listenPort: portMatch ? Number.parseInt(portMatch[1]!, 10) : null,
      peerCount,
    };
  } catch {
    return { listenPort: null, peerCount: 0 };
  }
}
