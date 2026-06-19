export function playScanBeep(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => void ctx.close();
  } catch {
    /* audio unavailable */
  }
}

export function vibrateScan(): void {
  try {
    navigator.vibrate?.(40);
  } catch {
    /* vibrate unavailable */
  }
}

export function scanFeedback(): void {
  playScanBeep();
  vibrateScan();
}

export class DuplicateScanGuard {
  private lastValue = "";
  private lastAt = 0;

  shouldAccept(value: string, windowMs = 2000): boolean {
    const now = Date.now();
    if (value === this.lastValue && now - this.lastAt < windowMs) {
      return false;
    }
    this.lastValue = value;
    this.lastAt = now;
    return true;
  }

  reset(): void {
    this.lastValue = "";
    this.lastAt = 0;
  }
}
