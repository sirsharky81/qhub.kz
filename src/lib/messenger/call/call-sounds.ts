import { prepareAudioSessionForCall } from "@/lib/audio-session";

type RingMode = "incoming" | "outgoing";

function pcmToneWav(frequency: number, durationSec: number, volume = 0.35): string {
  const sampleRate = 8000;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t) * volume;
    view.setInt16(44 + i * 2, Math.max(-32767, Math.min(32767, Math.floor(sample * 32767))), true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export class CallSounds {
  private audio: HTMLAudioElement | null = null;
  private pulseTimer: ReturnType<typeof setInterval> | null = null;
  private mode: RingMode | null = null;
  private primed = false;
  private generation = 0;

  prime(): void {
    if (this.primed || typeof document === "undefined") return;
    this.primed = true;
    prepareAudioSessionForCall();
    const el = document.createElement("audio");
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    el.src = pcmToneWav(440, 0.05, 0.01);
    el.volume = 0.01;
    void el.play().catch(() => {});
  }

  async startIncoming(): Promise<void> {
    await this.start("incoming");
  }

  async startOutgoing(): Promise<void> {
    await this.start("outgoing");
  }

  private async start(mode: RingMode): Promise<void> {
    if (this.mode === mode) return;
    this.stop();

    this.mode = mode;
    const gen = this.generation;
    prepareAudioSessionForCall();

    const playBurst = async () => {
      if (!this.mode || gen !== this.generation) return;
      if (this.audio) {
        this.audio.pause();
        this.audio.src = "";
        this.audio.remove();
        this.audio = null;
      }
      if (!this.mode || gen !== this.generation) return;

      const el = document.createElement("audio");
      el.setAttribute("playsinline", "true");
      el.setAttribute("webkit-playsinline", "true");
      el.volume = 1;
      el.src =
        mode === "incoming"
          ? pcmToneWav(440, 0.35, 0.45)
          : pcmToneWav(425, 0.45, 0.4);
      this.audio = el;
      try {
        await el.play();
      } catch {
        // iOS may block until user interacts with the page.
      }
    };

    void playBurst();
    const intervalMs = mode === "incoming" ? 4000 : 6000;
    this.pulseTimer = setInterval(() => void playBurst(), intervalMs);
  }

  stop(): void {
    this.generation += 1;
    this.mode = null;
    if (this.pulseTimer) {
      clearInterval(this.pulseTimer);
      this.pulseTimer = null;
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio.remove();
      this.audio = null;
    }
  }
}

let sharedSounds: CallSounds | null = null;

export function getCallSounds(): CallSounds {
  if (!sharedSounds) {
    sharedSounds = new CallSounds();
  }
  return sharedSounds;
}

export function primeCallSounds(): void {
  getCallSounds().prime();
}
