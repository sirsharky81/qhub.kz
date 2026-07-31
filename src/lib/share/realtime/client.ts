import { shareWsUrl } from "./config";
import type { SharePollResponse, ShareSession, ShareSignal } from "../types";

export type ShareRealtimeEvent =
  | { type: "share_signal"; roomId: string; signal: ShareSignal }
  | { type: "member_joined"; roomId: string; memberId: string; displayName: string; role: string }
  | { type: "member_left"; roomId: string; memberId: string }
  | { type: "connected"; participantId: string }
  | { type: "error"; message: string };

export type ShareRealtimeCallbacks = {
  onSignal?: (signal: ShareSignal) => void;
  onRoomEvent?: (event: ShareRealtimeEvent) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (err: Error) => void;
};

export class ShareRealtimeClient {
  private ws: WebSocket | null = null;
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private session: ShareSession,
    private callbacks: ShareRealtimeCallbacks,
  ) {}

  start(): boolean {
    const url = shareWsUrl();
    if (!url) return false;

    try {
      const params = new URLSearchParams({
        participantId: this.session.participantId,
        accessToken: this.session.accessToken,
      });
      this.ws = new WebSocket(`${url}?${params}`);
    } catch (err) {
      this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
      return false;
    }

    this.ws.onopen = () => {
      this.callbacks.onConnected?.();
    };

    this.ws.onmessage = (ev) => {
      try {
        const event = JSON.parse(String(ev.data)) as ShareRealtimeEvent;
        if (event.type === "share_signal" && event.signal) {
          this.callbacks.onSignal?.(event.signal);
        }
        this.callbacks.onRoomEvent?.(event);
      } catch {
        /* ignore */
      }
    };

    this.ws.onerror = () => {
      this.callbacks.onError?.(new Error("WebSocket error"));
    };

    this.ws.onclose = () => {
      this.callbacks.onDisconnected?.();
      if (!this.closed) this.scheduleReconnect();
    };

    return true;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closed) this.start();
    }, 2500);
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}

export type { SharePollResponse };
