import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getAmneziaServerConfig } from "./env";

const execFileAsync = promisify(execFile);

export interface AmneziaClientFiles {
  ok: boolean;
  name: string;
  config: string | null;
  vpnUri: string | null;
  address: string | null;
  error?: string;
}

export interface AmneziaLiveStatus {
  running: boolean;
  listenPort: number | null;
  peerCount: number;
}

function parseJson<T>(stdout: string): T {
  return JSON.parse(stdout.trim()) as T;
}

async function runAmneziaCommand(args: string[], timeoutMs = 30_000): Promise<string> {
  const { command } = getAmneziaServerConfig();
  if (!command) {
    throw new Error("AMNEZIAWG_COMMAND не задан");
  }
  const { stdout } = await execFileAsync("bash", [command, ...args], {
    timeout: timeoutMs,
    cwd: process.env.APP_DIR || process.cwd(),
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout;
}

/** Safe client name for manage_amneziawg.sh (a-z0-9, max 32) */
export function buildAmneziaClientName(peerId: string): string {
  const hex = peerId.replace(/-/g, "").slice(0, 16);
  return `qh${hex}`.toLowerCase();
}

export async function getAmneziaLiveStatus(): Promise<AmneziaLiveStatus> {
  if (!getAmneziaServerConfig().enabled) {
    return { running: false, listenPort: null, peerCount: 0 };
  }
  try {
    const stdout = await runAmneziaCommand(["status-json"], 8000);
    const data = parseJson<{
      ok?: boolean;
      running?: boolean;
      listenPort?: number | null;
      peerCount?: number;
    }>(stdout);
    return {
      running: Boolean(data.running),
      listenPort: data.listenPort ?? null,
      peerCount: data.peerCount ?? 0,
    };
  } catch {
    return { running: false, listenPort: null, peerCount: 0 };
  }
}

export async function amneziaAddClient(name: string): Promise<AmneziaClientFiles> {
  const stdout = await runAmneziaCommand(["add-json", name]);
  const data = parseJson<AmneziaClientFiles>(stdout);
  if (!data.ok || !data.config) {
    throw new Error(data.error ?? "Не удалось создать клиент AmneziaWG");
  }
  return data;
}

export async function amneziaExportClient(name: string): Promise<AmneziaClientFiles> {
  const stdout = await runAmneziaCommand(["export-json", name]);
  const data = parseJson<AmneziaClientFiles>(stdout);
  if (!data.ok || !data.config) {
    throw new Error("Конфиг AmneziaWG не найден на сервере");
  }
  return data;
}

export async function amneziaRemoveClient(name: string): Promise<void> {
  await runAmneziaCommand(["remove", name]);
}
