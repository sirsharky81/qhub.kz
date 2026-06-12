const MAX_EVENTS = 50;
const MAX_ALERTS = 10;

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

export type AudioDiagnostics = {
  ios: boolean;
  pwa: boolean;
  iosMode: string;
  installedHandlers: string[];
  mediaSessionPlaybackState: string;
  updatedAt: string;
};

const eventLog: AudioLogEntry[] = [];
const alertLog: string[] = [];
let diagnostics: AudioDiagnostics = {
  ios: false,
  pwa: false,
  iosMode: "unknown",
  installedHandlers: [],
  mediaSessionPlaybackState: "none",
  updatedAt: "",
};

export function logAudioEvent(event: string, audio: HTMLAudioElement): void {
  if (typeof window === "undefined") return;

  eventLog.unshift({
    time: new Date().toLocaleTimeString(),
    event,
    state: {
      paused: audio.paused,
      currentTime: Math.round(audio.currentTime * 10) / 10,
      readyState: audio.readyState,
      networkState: audio.networkState,
    },
  });

  if (eventLog.length > MAX_EVENTS) eventLog.pop();
}

export function logAudioAlert(message: string): void {
  if (typeof window === "undefined") return;
  const line = `${new Date().toLocaleTimeString()} ${message}`;
  alertLog.unshift(line);
  if (alertLog.length > MAX_ALERTS) alertLog.pop();
}

export function setAudioDiagnostics(next: Partial<AudioDiagnostics>): void {
  diagnostics = {
    ...diagnostics,
    ...next,
    updatedAt: new Date().toLocaleTimeString(),
  };
}

export function getAudioDiagnostics(): AudioDiagnostics {
  return { ...diagnostics };
}

export function getAudioAlerts(): string[] {
  return [...alertLog];
}

export function getAudioLog(): AudioLogEntry[] {
  return [...eventLog];
}

export function clearAudioLog(): void {
  eventLog.length = 0;
  alertLog.length = 0;
}

export function exportAudioDebugBundle(): string {
  return JSON.stringify(
    {
      diagnostics: getAudioDiagnostics(),
      alerts: getAudioAlerts(),
      events: getAudioLog(),
    },
    null,
    2,
  );
}
