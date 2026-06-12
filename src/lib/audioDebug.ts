const MAX_EVENTS = 50;

type AudioLogEntry = {
  time: string;
  event: string;
  state: {
    paused: boolean;
    currentTime: number;
    readyState: number;
    networkState: number;
  };
};

const eventLog: AudioLogEntry[] = [];

export function logAudioEvent(event: string, audio: HTMLAudioElement): void {
  if (typeof window === "undefined") return;

  eventLog.unshift({
    time: new Date().toLocaleTimeString(),
    event,
    state: {
      paused: audio.paused,
      currentTime: Math.round(audio.currentTime),
      readyState: audio.readyState,
      networkState: audio.networkState,
    },
  });

  if (eventLog.length > MAX_EVENTS) eventLog.pop();
}

export function getAudioLog(): AudioLogEntry[] {
  return [...eventLog];
}

export function clearAudioLog(): void {
  eventLog.length = 0;
}

export function isAudioDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "development") return true;
  return new URLSearchParams(window.location.search).get("debug") === "1";
}
