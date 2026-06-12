const MAX_EVENTS = 50;

type AudioLogEntry = {
  time: string;
  event: string;
  state: {
    paused: boolean;
    currentTime: number;
    readyState: number;
    networkState: number;
    volume: number;
    muted: boolean;
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
      volume: Math.round(audio.volume * 100) / 100,
      muted: audio.muted,
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
