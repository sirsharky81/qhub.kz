import { getApiBaseUrl } from "@/lib/platform/api-client";

export function isMessengerWsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MESSENGER_WS === "1";
}

export function getMessengerWsUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_MESSENGER_WS_URL?.trim();
  if (explicit) return explicit;

  const base = getApiBaseUrl();
  if (base) {
    const url = new URL(base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws/messenger";
    url.search = "";
    url.hash = "";
    return url.toString();
  }

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws/messenger`;
  }

  return "ws://127.0.0.1:3001/ws/messenger";
}
