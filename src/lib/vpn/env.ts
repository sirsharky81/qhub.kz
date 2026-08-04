export interface VpnServerConfig {
  enabled: boolean;
  serverPublicKey: string;
  endpoint: string;
  dns: string;
  syncCommand: string | null;
}

export interface AmneziaServerConfig {
  enabled: boolean;
  endpoint: string;
  command: string | null;
}

export function getVpnServerConfig(): VpnServerConfig {
  const enabled = process.env.VPN_ENABLED === "1" || process.env.VPN_ENABLED === "true";
  return {
    enabled,
    serverPublicKey: process.env.VPN_SERVER_PUBLIC_KEY?.trim() ?? "",
    endpoint: process.env.VPN_SERVER_ENDPOINT?.trim() ?? "",
    dns: process.env.VPN_DNS?.trim() || "1.1.1.1, 8.8.8.8",
    syncCommand: process.env.VPN_SYNC_COMMAND?.trim() || null,
  };
}

export function getAmneziaServerConfig(): AmneziaServerConfig {
  const enabled =
    process.env.AMNEZIAWG_ENABLED === "1" || process.env.AMNEZIAWG_ENABLED === "true";
  const appDir = process.env.APP_DIR?.trim() || "/var/www/qhub.kz";
  return {
    enabled,
    endpoint: process.env.AMNEZIAWG_ENDPOINT?.trim() ?? "",
    command:
      process.env.AMNEZIAWG_COMMAND?.trim() ||
      `${appDir}/scripts/vpn/amnezia-client.sh`,
  };
}

export function isVpnServerConfigured(): boolean {
  const cfg = getVpnServerConfig();
  return cfg.enabled && Boolean(cfg.serverPublicKey && cfg.endpoint);
}

export function isAmneziaConfigured(): boolean {
  const cfg = getAmneziaServerConfig();
  return cfg.enabled && Boolean(cfg.command && cfg.endpoint);
}

export function isAnyVpnBackendConfigured(): boolean {
  return isVpnServerConfigured() || isAmneziaConfigured();
}
