export interface VpnServerConfig {
  enabled: boolean;
  serverPublicKey: string;
  endpoint: string;
  dns: string;
  syncCommand: string | null;
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

export function isVpnServerConfigured(): boolean {
  const cfg = getVpnServerConfig();
  return cfg.enabled && Boolean(cfg.serverPublicKey && cfg.endpoint);
}
