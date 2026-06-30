type OnlineListener = (online: boolean) => void;

const listeners = new Set<OnlineListener>();

if (typeof window !== "undefined") {
  window.addEventListener("online", () => notify(true));
  window.addEventListener("offline", () => notify(false));
}

function notify(online: boolean): void {
  listeners.forEach((fn) => fn(online));
}

export const PlatformNetwork = {
  isOnline(): boolean {
    if (typeof navigator === "undefined") return true;
    return navigator.onLine;
  },

  onOnline(listener: OnlineListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
