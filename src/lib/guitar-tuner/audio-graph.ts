import { logTunerEvent } from "@/lib/audioDebug";
import { supportsAudioWorklet } from "@/lib/platform/device";
import { DEFAULT_NOISE_GATE_CONFIG } from "./noise";
import type { PitchAlgorithm } from "./types";

export const WORKLET_URL = "/worklets/pitch-processor.js";
export const WORKLET_PROCESSOR_NAME = "pitch-processor";

export interface AudioGraphOptions {
  bufferSize: number;
  minFrequency: number;
  maxFrequency: number;
  algorithm: PitchAlgorithm;
  deviceId?: string | null;
  analysisIntervalMs?: number;
  a4CalibrationCents?: number;
}

export interface AudioGraphHandle {
  context: AudioContext;
  stream: MediaStream;
  workletNode: AudioWorkletNode | null;
  analyserNode: AnalyserNode | null;
  useFallback: boolean;
  dispose: () => void;
}

function ensureRecordAudioSession(): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) {
    nav.audioSession.type = "play-and-record";
  }
}

export async function createAudioGraph(options: AudioGraphOptions): Promise<AudioGraphHandle> {
  ensureRecordAudioSession();

  const constraints: MediaStreamConstraints = {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      ...(options.deviceId ? { deviceId: { exact: options.deviceId } } : {}),
    },
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const context = new AudioContext();
  await context.resume();

  const source = context.createMediaStreamSource(stream);
  const lowPass = context.createBiquadFilter();
  lowPass.type = "lowpass";
  lowPass.frequency.value = DEFAULT_NOISE_GATE_CONFIG.lowPassCutoffHz;

  source.connect(lowPass);

  let workletNode: AudioWorkletNode | null = null;
  let analyserNode: AnalyserNode | null = null;
  let useFallback = !supportsAudioWorklet();

  if (!useFallback) {
    try {
      await context.audioWorklet.addModule(WORKLET_URL);
      workletNode = new AudioWorkletNode(context, WORKLET_PROCESSOR_NAME, {
        processorOptions: { bufferSize: options.bufferSize },
      });
      lowPass.connect(workletNode);

      workletNode.port.postMessage({
        type: "config",
        bufferSize: options.bufferSize,
        minFrequency: options.minFrequency,
        maxFrequency: options.maxFrequency,
        algorithm: options.algorithm,
        analysisIntervalMs: options.analysisIntervalMs ?? 50,
        a4CalibrationCents: options.a4CalibrationCents ?? 0,
      });
    } catch (err) {
      logTunerEvent("workletFallback", String(err));
      useFallback = true;
      workletNode?.disconnect();
      workletNode = null;
    }
  }

  if (useFallback) {
    analyserNode = context.createAnalyser();
    analyserNode.fftSize = options.bufferSize;
    analyserNode.smoothingTimeConstant = 0;
    lowPass.connect(analyserNode);
    logTunerEvent("workletFallback", "Using AnalyserNode fallback at 10 Hz");
  }

  const dispose = () => {
    workletNode?.disconnect();
    analyserNode?.disconnect();
    lowPass.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => {
      t.stop();
      t.enabled = false;
    });
    void context.close();
    logTunerEvent("micStopped");
  };

  return { context, stream, workletNode, analyserNode, useFallback, dispose };
}

export function reconfigureWorklet(
  workletNode: AudioWorkletNode,
  options: Omit<AudioGraphOptions, "deviceId">,
): void {
  workletNode.port.postMessage({
    type: "config",
    bufferSize: options.bufferSize,
    minFrequency: options.minFrequency,
    maxFrequency: options.maxFrequency,
    algorithm: options.algorithm,
    analysisIntervalMs: options.analysisIntervalMs ?? 50,
    a4CalibrationCents: options.a4CalibrationCents ?? 0,
  });
}
