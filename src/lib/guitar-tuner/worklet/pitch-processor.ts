/// <reference lib="webworker" />

import { PitchPipeline } from "../pitch/pipeline";
import type { PitchAlgorithm, WorkletConfigMessage, WorkletPitchMessage } from "../types";

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: AudioWorkletNodeOptions);
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void;

declare const sampleRate: number;
declare const currentTime: number;

class PitchProcessor extends AudioWorkletProcessor {
  private buffer: Float32Array;
  private bufferIndex = 0;
  private hopSize = 1024;
  private pipeline: PitchPipeline;
  private lastPostTime = 0;
  private analysisIntervalMs = 50;
  private stableSince = 0;
  private lastStableNote = "";

  constructor(options?: AudioWorkletNodeOptions) {
    super();
    const bufferSize = options?.processorOptions?.bufferSize ?? 4096;
    this.buffer = new Float32Array(bufferSize);
    this.hopSize = Math.floor(bufferSize / 4);
    this.pipeline = new PitchPipeline({
      minFrequency: 65,
      maxFrequency: 450,
      algorithm: "mpm",
    });

    this.port.onmessage = (event: MessageEvent<WorkletConfigMessage>) => {
      const msg = event.data;
      if (msg.type !== "config") return;

      if (msg.bufferSize !== this.buffer.length) {
        this.buffer = new Float32Array(msg.bufferSize);
        this.bufferIndex = 0;
        this.hopSize = Math.floor(msg.bufferSize / 4);
      }

      this.analysisIntervalMs = msg.analysisIntervalMs;
      this.pipeline.updateConfig({
        minFrequency: msg.minFrequency,
        maxFrequency: msg.maxFrequency,
        algorithm: msg.algorithm as PitchAlgorithm,
        a4CalibrationCents: msg.a4CalibrationCents,
      });
      this.pipeline.reset();
    };
  }

  private accumulate(input: Float32Array): void {
    for (let i = 0; i < input.length; i++) {
      if (this.bufferIndex >= this.buffer.length) {
        this.analyze();
        this.advanceWithOverlap();
      }
      this.buffer[this.bufferIndex++] = input[i];
    }
  }

  private advanceWithOverlap(): void {
    const keep = this.buffer.length - this.hopSize;
    if (keep > 0) {
      this.buffer.copyWithin(0, this.hopSize, this.buffer.length);
    }
    this.bufferIndex = keep;
  }

  private analyze(): void {
    const now = currentTime * 1000;
    const interval = this.getEffectiveInterval(now);
    if (now - this.lastPostTime < interval) return;

    const reading = this.pipeline.process(this.buffer, sampleRate);
    if (!reading) return;

    this.lastPostTime = now;

    const msg: WorkletPitchMessage = {
      type: "pitch",
      frequency: reading.frequency,
      clarity: reading.clarity,
      note: reading.note,
      cents: reading.cents,
      confidence: reading.confidence,
      rms: reading.rms,
      snr: reading.snr,
    };

    this.port.postMessage(msg);

    if (reading.note === this.lastStableNote && reading.confidence >= 70) {
      if (this.stableSince === 0) this.stableSince = now;
    } else {
      this.stableSince = 0;
      this.lastStableNote = reading.note;
    }
  }

  private getEffectiveInterval(now: number): number {
    if (this.stableSince > 0 && now - this.stableSince >= 3000) {
      return 200;
    }
    return this.analysisIntervalMs;
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    if (!input) return true;
    this.accumulate(input);
    return true;
  }
}

registerProcessor("pitch-processor", PitchProcessor);
