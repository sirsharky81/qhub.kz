"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logTunerEvent } from "@/lib/audioDebug";
import {
  createAudioGraph,
  reconfigureWorklet,
  type AudioGraphHandle,
} from "../audio-graph";
import { selectAlgorithm } from "../pitch/detector";
import { PitchPipeline } from "../pitch/pipeline";
import type { PitchReading, WorkletPitchMessage } from "../types";
import type { TuningPreset } from "../tunings/types";

const FALLBACK_INTERVAL_MS = 100;

export interface UsePitchDetectionOptions {
  tuning: TuningPreset;
  deviceId: string | null;
  a4CalibrationCents: number;
  enabled: boolean;
  analysisIntervalMs?: number;
}

export interface UsePitchDetectionResult {
  reading: PitchReading | null;
  useFallback: boolean;
  audioContext: AudioContext | null;
  stream: MediaStream | null;
  isReconfiguring: boolean;
  start: () => Promise<AudioGraphHandle | undefined>;
  stop: () => void;
  reacquire: () => Promise<void>;
}

export function usePitchDetection(options: UsePitchDetectionOptions): UsePitchDetectionResult {
  const { tuning, deviceId, a4CalibrationCents, enabled, analysisIntervalMs = 50 } = options;

  const [reading, setReading] = useState<PitchReading | null>(null);
  const [useFallback, setUseFallback] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isReconfiguring, setIsReconfiguring] = useState(false);

  const graphRef = useRef<AudioGraphHandle | null>(null);
  const pipelineRef = useRef<PitchPipeline | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tuningKeyRef = useRef("");

  const stop = useCallback(() => {
    if (fallbackTimerRef.current) {
      clearInterval(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (graphRef.current) {
      graphRef.current.dispose();
      graphRef.current = null;
    }
    pipelineRef.current = null;
    setReading(null);
    setAudioContext(null);
    setStream(null);
    setUseFallback(false);
    logTunerEvent("sessionStopped");
  }, []);

  const startFallbackLoop = useCallback((handle: AudioGraphHandle) => {
    if (!handle.analyserNode) return;

    const algo = selectAlgorithm([tuning.minFrequency, tuning.maxFrequency]);
    pipelineRef.current = new PitchPipeline({
      minFrequency: tuning.minFrequency,
      maxFrequency: tuning.maxFrequency,
      algorithm: algo.algorithm,
      a4CalibrationCents,
    });

    const analyser = handle.analyserNode;
    const buffer = new Float32Array(analyser.fftSize);

    fallbackTimerRef.current = setInterval(() => {
      analyser.getFloatTimeDomainData(buffer);
      const result = pipelineRef.current?.process(buffer, handle.context.sampleRate);
      if (result) {
        setReading(result);
      }
    }, FALLBACK_INTERVAL_MS);
  }, [tuning, a4CalibrationCents]);

  const start = useCallback(async () => {
    stop();

    const algo = selectAlgorithm([tuning.minFrequency, tuning.maxFrequency]);
    const handle = await createAudioGraph({
      bufferSize: tuning.recommendedBufferSize,
      minFrequency: tuning.minFrequency,
      maxFrequency: tuning.maxFrequency,
      algorithm: algo.algorithm,
      deviceId,
      analysisIntervalMs,
      a4CalibrationCents,
    });

    graphRef.current = handle;
    setAudioContext(handle.context);
    setStream(handle.stream);
    setUseFallback(handle.useFallback);
    tuningKeyRef.current = `${tuning.id}-${tuning.recommendedBufferSize}`;

    if (handle.useFallback) {
      startFallbackLoop(handle);
    } else if (handle.workletNode) {
      handle.workletNode.port.onmessage = (event: MessageEvent<WorkletPitchMessage>) => {
        const msg = event.data;
        if (msg.type !== "pitch") return;
        setReading({
          frequency: msg.frequency,
          clarity: msg.clarity,
          note: msg.note,
          cents: msg.cents,
          confidence: msg.confidence,
          rms: msg.rms,
          snr: msg.snr,
          timestamp: Date.now(),
        });
      };
    }

    return handle;
  }, [stop, tuning, deviceId, analysisIntervalMs, a4CalibrationCents, startFallbackLoop]);

  const reacquire = useCallback(async () => {
    if (!enabled) return;
    logTunerEvent("reacquirePitch");
    await start();
  }, [enabled, start]);

  useEffect(() => {
    if (!enabled || !graphRef.current?.workletNode) return;

    const key = `${tuning.id}-${tuning.recommendedBufferSize}-${a4CalibrationCents}`;
    if (key === tuningKeyRef.current) return;

    setIsReconfiguring(true);
    tuningKeyRef.current = key;

    const algo = selectAlgorithm([tuning.minFrequency, tuning.maxFrequency]);
    reconfigureWorklet(graphRef.current.workletNode, {
      bufferSize: tuning.recommendedBufferSize,
      minFrequency: tuning.minFrequency,
      maxFrequency: tuning.maxFrequency,
      algorithm: algo.algorithm,
      analysisIntervalMs,
      a4CalibrationCents,
    });

    const timer = setTimeout(() => setIsReconfiguring(false), 150);
    return () => clearTimeout(timer);
  }, [tuning, a4CalibrationCents, enabled, analysisIntervalMs]);

  useEffect(() => {
    if (useFallback && graphRef.current) {
      stop();
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tuning.id, tuning.recommendedBufferSize]);

  useEffect(() => () => stop(), [stop]);

  return {
    reading,
    useFallback,
    audioContext,
    stream,
    isReconfiguring,
    start,
    stop,
    reacquire,
  };
}
