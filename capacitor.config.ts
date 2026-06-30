import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Production: set CAPACITOR_SERVER_URL to your HTTPS deploy (e.g. https://qhub.example.com).
 * Local dev on device: use https tunnel (ngrok) or `npx cap run android` with bundled static files.
 * Plain http://192.168.x.x is NOT a secure context — getUserMedia (camera) will fail.
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: "kz.qhub.app",
  appName: "QHub",
  webDir: "out",
  server: serverUrl
    ? {
        url: serverUrl,
        cleartext: false,
        androidScheme: "https",
      }
    : {
        androidScheme: "https",
      },
  android: {
    allowMixedContent: false,
  },
};

export default config;
