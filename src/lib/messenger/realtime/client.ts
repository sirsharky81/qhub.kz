import { getCachedMessengerSessionToken, loadMessengerSessionToken } from "../session-token";
import { getMessengerWsUrl, isMessengerWsEnabled } from "./config";
import type { RealtimeClientOp, RealtimeServerEvent } from "./protocol";

export type RealtimeConnectionMode = "websocket" | "polling" | "disabled";

type EventHandler = (event: RealtimeServerEvent) => void;
type ModeHandler = (mode: RealtimeConnectionMode) => void;

const RECONNECT_BASE_MS = 800;
const RECONNECT_MAX_MS = 15_000;
const FALLBACK_IDLE_MS = 5_000;

export class MessengerRealtimeClient {
  private socket: WebSocket | null = null;
  private phone: string | null = null;
  private channels = new Set<string>();
  private handlers = new Set<EventHandler>();
  private modeHandlers = new Set<ModeHandler>();
  private mode: RealtimeConnectionMode = "disabled";
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private fallbackTimer: number | null = null;
  private disposed = false;
  private connecting = false;
  private lastEventAt = 0;

  public isEnabled(): boolean {
    return isMessengerWsEnabled();
  }

  public getMode(): RealtimeConnectionMode {
    return this.mode;
  }

  public getPhone(): string | null {
    return this.phone;
  }

  public subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  public onModeChange(handler: ModeHandler): () => void {
    this.modeHandlers.add(handler);
    handler(this.mode);
    return () => this.modeHandlers.delete(handler);
  }

  public subscribeChannels(channels: string[]): void {
    for (const ch of channels) {
      if (ch) this.channels.add(ch);
    }
    if (this.mode === "websocket") {
      this.sendOp({ op: "subscribe", channels });
    }
  }

  public unsubscribeChannels(channels: string[]): void {
    for (const ch of channels) this.channels.delete(ch);
    if (this.mode === "websocket") {
      this.sendOp({ op: "unsubscribe", channels });
    }
  }

  public sendTyping(channel: string, active: boolean): void {
    if (this.mode !== "websocket") return;
    this.sendOp({ op: "typing", channel, active });
  }

  public sendPresence(channel: string): void {
    if (this.mode !== "websocket") return;
    this.sendOp({ op: "presence", channel });
  }

  public start(): void {
    this.disposed = false;
    if (!this.isEnabled()) {
      this.setMode("polling");
      return;
    }
    void this.connect();
  }

  public stop(): void {
    this.clearTimers();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connecting = false;
    this.setMode("disabled");
  }

  public dispose(): void {
    this.disposed = true;
    this.stop();
  }

  public shouldUsePollingFallback(): boolean {
    return !this.isEnabled() || this.mode !== "websocket";
  }

  public markEventReceived(): void {
    this.lastEventAt = Date.now();
    this.clearFallbackTimer();
  }

  private setMode(next: RealtimeConnectionMode): void {
    if (this.mode === next) return;
    this.mode = next;
    for (const handler of this.modeHandlers) handler(next);
  }

  private emit(event: RealtimeServerEvent): void {
    this.markEventReceived();
    for (const handler of this.handlers) handler(event);
  }

  private clearTimers(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearFallbackTimer();
  }

  private clearFallbackTimer(): void {
    if (this.fallbackTimer !== null) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || !this.isEnabled()) {
      this.setMode("polling");
      return;
    }
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS);
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private armFallbackTimer(): void {
    this.clearFallbackTimer();
    this.fallbackTimer = window.setTimeout(() => {
      if (this.mode !== "websocket") {
        this.setMode("polling");
      }
    }, FALLBACK_IDLE_MS);
  }

  private async resolveAuthToken(): Promise<string | null> {
    const cached = getCachedMessengerSessionToken();
    if (cached) return cached;
    return loadMessengerSessionToken();
  }

  private buildWsUrl(token: string | null): string {
    const base = getMessengerWsUrl();
    if (!token) return base;
    const url = new URL(base);
    url.searchParams.set("token", token);
    return url.toString();
  }

  private sendOp(op: RealtimeClientOp): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(op));
  }

  private async connect(): Promise<void> {
    if (this.disposed || this.connecting || !this.isEnabled()) return;
    this.connecting = true;
    this.armFallbackTimer();

    try {
      const token = await this.resolveAuthToken();
      const ws = new WebSocket(this.buildWsUrl(token));
      this.socket = ws;

      ws.onopen = () => {
        this.connecting = false;
        this.reconnectAttempt = 0;
        if (!token) {
          void this.resolveAuthToken().then((resolved) => {
            if (resolved) this.sendOp({ op: "auth", token: resolved });
          });
        }
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as RealtimeServerEvent;
          if (payload.type === "connected" && "phone" in payload) {
            this.phone = payload.phone;
            this.setMode("websocket");
            if (this.channels.size > 0) {
              this.sendOp({ op: "subscribe", channels: [...this.channels] });
            }
          } else if (payload.type === "error") {
            this.setMode("polling");
          } else {
            this.emit(payload);
          }
        } catch {
          /* ignore malformed */
        }
      };

      ws.onerror = () => {
        this.setMode("polling");
      };

      ws.onclose = () => {
        this.connecting = false;
        this.socket = null;
        if (this.disposed) return;
        this.setMode("polling");
        this.scheduleReconnect();
      };
    } catch {
      this.connecting = false;
      this.setMode("polling");
      this.scheduleReconnect();
    }
  }
}

let singleton: MessengerRealtimeClient | null = null;

export function getMessengerRealtimeClient(): MessengerRealtimeClient {
  if (!singleton) {
    singleton = new MessengerRealtimeClient();
  }
  return singleton;
}
