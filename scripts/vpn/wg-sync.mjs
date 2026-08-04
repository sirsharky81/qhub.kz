#!/usr/bin/env node
/**
 * Sync active VPN peers from Redis into WireGuard interface.
 * Run on VPS as root (or via sudo): node --env-file=.env.production scripts/vpn/wg-sync.mjs
 */
import { readFileSync, writeFileSync, existsSync, chmodSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Redis from "ioredis";

const REDIS_VPN_PEERS_KEY = "qhub:vpn:peers";
const WG_INTERFACE = process.env.VPN_INTERFACE || "wg0";
const WG_CONF = process.env.VPN_WG_CONF || `/etc/wireguard/${WG_INTERFACE}.conf`;
const SERVER_PRIVATE_KEY_FILE =
  process.env.VPN_SERVER_PRIVATE_KEY_FILE || `/etc/wireguard/${WG_INTERFACE}.server.key`;

function loadEnvFile(relativePath) {
  const path = resolve(process.cwd(), relativePath);
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

if (!process.env.REDIS_URL) {
  loadEnvFile(".env.production");
  loadEnvFile(".env.local");
  loadEnvFile(".env");
}

function detectPublicInterface() {
  if (process.env.VPN_PUBLIC_INTERFACE) return process.env.VPN_PUBLIC_INTERFACE;
  try {
    const out = execFileSync("ip", ["route", "get", "1.1.1.1"], { encoding: "utf8" });
    const match = out.match(/\bdev\s+(\S+)/);
    return match?.[1] ?? "eth0";
  } catch {
    return "eth0";
  }
}

function readServerPrivateKey() {
  if (process.env.VPN_SERVER_PRIVATE_KEY) return process.env.VPN_SERVER_PRIVATE_KEY.trim();
  if (existsSync(SERVER_PRIVATE_KEY_FILE)) {
    return readFileSync(SERVER_PRIVATE_KEY_FILE, "utf8").trim();
  }
  throw new Error(`Server private key not found (${SERVER_PRIVATE_KEY_FILE})`);
}

function buildServerConfig(activePeers, serverPrivateKey, publicInterface) {
  const listenPort = process.env.VPN_LISTEN_PORT || "443";
  const lines = [
    "[Interface]",
    `Address = ${process.env.VPN_SERVER_ADDRESS || "10.8.0.1/24"}`,
    `ListenPort = ${listenPort}`,
    `PrivateKey = ${serverPrivateKey}`,
    `PostUp = iptables -A FORWARD -i %i -j ACCEPT; iptables -t nat -A POSTROUTING -o ${publicInterface} -j MASQUERADE`,
    `PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -t nat -D POSTROUTING -o ${publicInterface} -j MASQUERADE`,
    "",
  ];

  for (const peer of activePeers) {
    lines.push("[Peer]");
    lines.push(`PublicKey = ${peer.publicKey}`);
    lines.push(`AllowedIPs = ${peer.address}/32`);
    lines.push("");
  }

  return lines.join("\n");
}

function isInterfaceUp(name) {
  try {
    execFileSync("wg", ["show", name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function getLiveListenPort(name) {
  try {
    const out = execFileSync("wg", ["show", name], { encoding: "utf8" });
    const match = out.match(/listening port:\s*(\d+)/);
    return match ? Number.parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

function parseListenPortFromConfig(config) {
  const match = config.match(/^ListenPort\s*=\s*(\d+)/m);
  return match ? Number.parseInt(match[1], 10) : null;
}

function tryHotListenPortChange(iface, newPort) {
  const livePort = getLiveListenPort(iface);
  if (livePort === newPort) return true;
  if (livePort === null) return false;
  try {
    execFileSync("wg", ["set", iface, "listen-port", String(newPort)], { stdio: "pipe" });
    return getLiveListenPort(iface) === newPort;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[vpn-sync] hot listen-port change failed (${detail})`);
    return false;
  }
}

function forceDownInterface(iface) {
  try {
    execFileSync("systemctl", ["stop", `wg-quick@${iface}`], { stdio: "ignore" });
  } catch {
    // not managed by systemd
  }
  try {
    execFileSync("wg-quick", ["down", iface], { stdio: "ignore" });
  } catch {
    // already down
  }
  try {
    execFileSync("ip", ["link", "del", iface], { stdio: "ignore" });
  } catch {
    try {
      execFileSync("ip", ["link", "delete", iface], { stdio: "ignore" });
    } catch {
      // gone
    }
  }
}

function reloadWireGuardInterface(configPath, iface) {
  if (trySystemctlRestart(iface)) return;

  forceDownInterface(iface);
  execFileSync("wg-quick", ["up", configPath], { stdio: "inherit" });
}

function trySystemctlRestart(iface) {
  try {
    execFileSync("systemctl", ["restart", `wg-quick@${iface}`], { stdio: "inherit" });
    execFileSync("wg", ["show", iface], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function applyWireGuardConfig(configPath, iface, config) {
  writeFileSync(configPath, config, { mode: 0o600 });
  chmodSync(configPath, 0o600);

  const targetPort = parseListenPortFromConfig(config);

  if (isInterfaceUp(iface)) {
    let peersSynced = false;
    try {
      const stripped = execFileSync("wg-quick", ["strip", configPath], { encoding: "utf8" });
      const tmpDir = mkdtempSync(join(tmpdir(), "qhub-wg-"));
      const strippedPath = join(tmpDir, `${iface}.conf`);
      try {
        writeFileSync(strippedPath, stripped, { mode: 0o600 });
        execFileSync("wg", ["syncconf", iface, strippedPath], { stdio: "pipe" });
        peersSynced = true;
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(`[vpn-sync] syncconf failed (${detail})`);
    }

    if (targetPort != null) {
      if (tryHotListenPortChange(iface, targetPort)) {
        if (peersSynced) return;
      }
    } else if (peersSynced) {
      return;
    }

    console.warn(`[vpn-sync] restarting ${iface} via wg-quick`);
  }

  reloadWireGuardInterface(configPath, iface);

  if (targetPort != null && getLiveListenPort(iface) !== targetPort) {
    if (tryHotListenPortChange(iface, targetPort)) return;
    throw new Error(`WireGuard listen port is ${getLiveListenPort(iface)}, expected ${targetPort}`);
  }
}

async function main() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error("[vpn-sync] REDIS_URL is required");
    process.exit(1);
  }

  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 2, lazyConnect: true });
  await redis.connect();

  let index = {};
  try {
    const raw = await redis.get(REDIS_VPN_PEERS_KEY);
    index = raw ? JSON.parse(raw) : {};
  } finally {
    await redis.quit();
  }

  const activePeers = Object.values(index).filter((peer) => peer?.status === "active");
  const serverPrivateKey = readServerPrivateKey();
  const publicInterface = detectPublicInterface();
  const config = buildServerConfig(activePeers, serverPrivateKey, publicInterface);

  applyWireGuardConfig(WG_CONF, WG_INTERFACE, config);

  console.log(`[vpn-sync] ${activePeers.length} active peer(s) synced to ${WG_INTERFACE}`);
}

main().catch((error) => {
  console.error("[vpn-sync] failed:", error);
  process.exit(1);
});
