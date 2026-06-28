"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logTunerEvent } from "@/lib/audioDebug";
import { isIOSDevice, isStandalonePWA } from "@/lib/platform/device";

export type MicPermissionState = "prompt" | "granted" | "denied" | "error";

export interface UseMicrophoneResult {
  stream: MediaStream | null;
  permission: MicPermissionState;
  error: string | null;
  pwaHint: boolean;
  micLevel: number;
  availableMics: MediaDeviceInfo[];
  requestMic: (deviceId?: string | null) => Promise<MediaStream | null>;
  reacquireMic: () => Promise<MediaStream | null>;
}

async function getAvailableMicrophones(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const mics = devices.filter((d) => d.kind === "audioinput");
  const hasUsableLabels = mics.some((m) => m.label.length > 0);
  if (!hasUsableLabels) return [];
  return mics;
}

export function useMicrophone(
  deviceId: string | null,
  onStreamReady?: (stream: MediaStream) => void,
): UseMicrophoneResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permission, setPermission] = useState<MicPermissionState>("prompt");
  const [error, setError] = useState<string | null>(null);
  const [pwaHint, setPwaHint] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const levelContextRef = useRef<AudioContext | null>(null);
  const firstAttemptRef = useRef(true);

  const stopStream = useCallback((s: MediaStream | null) => {
    s?.getTracks().forEach((t) => t.stop());
  }, []);

  const requestMic = useCallback(
    async (overrideDeviceId?: string | null): Promise<MediaStream | null> => {
      const id = overrideDeviceId !== undefined ? overrideDeviceId : deviceId;
      try {
        const constraints: MediaStreamConstraints = {
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            ...(id ? { deviceId: { exact: id } } : {}),
          },
        };
        stopStream(streamRef.current);
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = newStream;
        setStream(newStream);
        setPermission("granted");
        setError(null);
        setPwaHint(false);
        firstAttemptRef.current = false;

        const mics = await getAvailableMicrophones();
        setAvailableMics(mics);
        onStreamReady?.(newStream);
        logTunerEvent("micGranted", id ?? "default");
        return newStream;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Microphone access failed";
        logTunerEvent("micDenied", message);

        if (
          firstAttemptRef.current &&
          isIOSDevice() &&
          isStandalonePWA()
        ) {
          setPwaHint(true);
          logTunerEvent("pwaFirstGetUserMediaFail", message);
        }
        firstAttemptRef.current = false;

        const denied =
          err instanceof DOMException &&
          (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
        setPermission(denied ? "denied" : "error");
        setError(message);
        return null;
      }
    },
    [deviceId, onStreamReady, stopStream],
  );

  const reacquireMic = useCallback(() => requestMic(deviceId), [deviceId, requestMic]);

  useEffect(() => {
    let raf = 0;
    let analyser: AnalyserNode | null = null;

    if (!stream) return;

    const ctx = new AudioContext();
    levelContextRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!analyser) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      setMicLevel(Math.sqrt(sum / data.length));
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      analyser?.disconnect();
      void ctx.close();
      levelContextRef.current = null;
    };
  }, [stream]);

  useEffect(() => {
    return () => {
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [stopStream]);

  return {
    stream,
    permission,
    error,
    pwaHint,
    micLevel,
    availableMics,
    requestMic,
    reacquireMic,
  };
}

export function useMicVisibilityResume(
  audioContext: AudioContext | null,
  stream: MediaStream | null,
  reacquireMic: () => Promise<void>,
): void {
  useEffect(() => {
    if (!audioContext) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;

      if (audioContext.state === "suspended") {
        try {
          await audioContext.resume();
          logTunerEvent("contextResumed");
        } catch (err) {
          logTunerEvent("contextResumeFailed", String(err));
        }
      }

      const track = stream?.getAudioTracks()[0];
      if (track && track.readyState === "ended") {
        logTunerEvent("micTrackEnded");
        await reacquireMic();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [audioContext, stream, reacquireMic]);
}
