export interface RoomTransportOptions {
  roomCode: string;
  onMessage: (payload: unknown) => void;
  onError?: (message: string) => void;
}

export class HeartsRoomTransport {
  private socket: WebSocket | null = null;
  private timerId: number | null = null;
  private active = false;

  constructor(private readonly options: RoomTransportOptions) {}

  public start(): void {
    if (this.active) return;
    this.active = true;
    this.tryWebSocket();
  }

  public stop(): void {
    this.active = false;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private tryWebSocket(): void {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/api/games/hearts/ws?room=${encodeURIComponent(this.options.roomCode)}`;
    try {
      this.socket = new WebSocket(wsUrl);
      this.socket.onmessage = (event) => {
        try {
          this.options.onMessage(JSON.parse(event.data));
        } catch {
          this.options.onMessage(event.data);
        }
      };
      this.socket.onopen = () => {
        if (this.timerId !== null) {
          window.clearInterval(this.timerId);
          this.timerId = null;
        }
      };
      this.socket.onerror = () => {
        this.options.onError?.("WebSocket transport failed. Falling back to polling.");
        this.startPolling();
      };
      this.socket.onclose = () => {
        if (!this.active) return;
        this.startPolling();
      };
    } catch {
      this.startPolling();
    }
  }

  private startPolling(): void {
    if (this.timerId !== null || !this.active) return;
    this.timerId = window.setInterval(() => {
      void fetch(`/api/games/hearts/rooms/${encodeURIComponent(this.options.roomCode)}`)
        .then((res) => res.json())
        .then((payload) => this.options.onMessage(payload))
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Polling failed";
          this.options.onError?.(message);
        });
    }, 1500);
  }
}
