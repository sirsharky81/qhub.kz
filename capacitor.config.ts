import type { CapacitorConfig } from "@capacitor/cli";

/** Production UI origin for Capacitor shell (Turnstile, same-origin API). Override for LAN dev. */
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || "https://www.qhub.kz";

const config: CapacitorConfig = {
  appId: "kz.qhub.app",
  appName: "QHub",
  /** Fallback when server.url is unreachable; see capacitor-shell/ */
  webDir: "out",
  server: {
    url: serverUrl,
    androidScheme: "https",
    cleartext: serverUrl.startsWith("http://"),
    allowNavigation: [
      "qhub.kz",
      "www.qhub.kz",
      "challenges.cloudflare.com",
      "*.cloudflare.com",
    ],
  },
};

export default config;
