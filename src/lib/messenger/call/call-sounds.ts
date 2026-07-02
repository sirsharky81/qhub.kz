import { prepareAudioSessionForCall } from "@/lib/audio-session";

type RingMode = "incoming" | "outgoing";

export class CallSounds {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  private pulseTimer: ReturnType<typeof setTimeout> | null = null;
  private mode: RingMode | null = null;

  private async ensureContext(): Promise<AudioContext> {
    prepareAudioSessionForCall();
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  async startIncoming(): Promise<void> {
    await this.start("incoming", 1000, 3000);
  }

  async startOutgoing(): Promise<void> {
    await this.start("outgoing", 2000, 4000);
  }

  private async start(mode: RingMode, onMs: number, offMs: number): Promise<void> {
    if (this.mode === mode) return;
    this.stopOscillators();

    this.mode = mode;
    const ctx = await this.ensureContext();
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(ctx.destination);

    this.oscA = ctx.createOscillator();
    this.oscB = ctx.createOscillator();
    this.oscA.type = "sine";
    this.oscB.type = "sine";

    if (mode === "incoming") {
      this.oscA.frequency.value = 440;
      this.oscB.frequency.value = 480;
    } else {
      this.oscA.frequency.value = 425;
      this.oscB.frequency.value = 425;
    }

    this.oscA.connect(this.gain);
    this.oscB.connect(this.gain);
    this.oscA.start();
    this.oscB.start();

    this.schedulePulse(onMs, offMs, true);
  }

  private schedulePulse(onMs: number, offMs: number, on: boolean): void {
    if (!this.mode || !this.gain || !this.ctx) return;
    this.gain.gain.setTargetAtTime(on ? 0.25 : 0, this.ctx.currentTime, 0.02);
    this.pulseTimer = setTimeout(() => {
      this.schedulePulse(onMs, offMs, !on);
    }, on ? onMs : offMs);
  }

  stop(): void {
    this.mode = null;
    if (this.pulseTimer) {
      clearTimeout(this.pulseTimer);
      this.pulseTimer = null;
    }
    this.stopOscillators();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }

  private stopOscillators(): void {
    for (const osc of [this.oscA, this.oscB]) {
      try {
        osc?.stop();
        osc?.disconnect();
      } catch {
        // already stopped
      }
    }
    this.oscA = null;
    this.oscB = null;
    if (this.gain) {
      this.gain.disconnect();
      this.gain = null;
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
