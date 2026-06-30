"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarcodeFormat,
  BrowserMultiFormatReader,
  DecodeHintType,
  NotFoundException,
} from "@zxing/library";
import type { ScanPauseSeconds, ScanSessionSettings } from "@/lib/code-scanner/types";
import { DuplicateScanGuard, scanFeedback } from "@/lib/code-scanner/scan-feedback";
import { useCodeScannerT } from "@/lib/code-scanner/i18n";
import { getCameraStream } from "@/lib/platform/camera-access";

interface CameraScannerProps {
  active: boolean;
  settings: ScanSessionSettings;
  /** true = камера не закрывается после скана (инвентаризация, коробки) */
  continuous?: boolean;
  onScan: (text: string) => void;
  onManualInput?: () => void;
  /** вызывается после одиночного скана, когда камера остановлена */
  onSingleScanDone?: () => void;
}

export default function CameraScanner({
  active,
  settings,
  continuous = true,
  onScan,
  onManualInput,
  onSingleScanDone,
}: CameraScannerProps) {
  const { t } = useCodeScannerT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** инкремент при каждом stop — отменяет отложенный getUserMedia */
  const generationRef = useRef(0);
  const guardRef = useRef(new DuplicateScanGuard());
  const pausedUntilRef = useRef(0);
  const facingRef = useRef<"environment" | "user">("environment");
  const onScanRef = useRef(onScan);
  const onSingleScanDoneRef = useRef(onSingleScanDone);

  const [error, setError] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");

  useEffect(() => {
    onScanRef.current = onScan;
    onSingleScanDoneRef.current = onSingleScanDone;
  }, [onScan, onSingleScanDone]);

  const stopStream = useCallback(() => {
    generationRef.current += 1;
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((tr) => tr.stop());
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
    readerRef.current?.reset();
    readerRef.current = null;
  }, []);

  const applyTorch = useCallback(async (on: boolean) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setTorchOn(on);
    } catch {
      /* torch unsupported */
    }
  }, []);

  const handleDecode = useCallback(
    (text: string) => {
      if (Date.now() < pausedUntilRef.current) return;
      if (!guardRef.current.shouldAccept(text)) return;

      scanFeedback();
      onScanRef.current(text);

      if (continuous && settings.conveyorMode) {
        pausedUntilRef.current = Date.now() + settings.pauseSeconds * 1000;
        return;
      }

      stopStream();
      onSingleScanDoneRef.current?.();
    },
    [continuous, settings.conveyorMode, settings.pauseSeconds, stopStream],
  );

  const startCamera = useCallback(async () => {
    stopStream();
    const generation = generationRef.current;
    setError(null);
    setTorchOn(false);

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.PDF_417,
    ]);

    const reader = new BrowserMultiFormatReader(hints, 250);
    readerRef.current = reader;

    try {
      const stream = await getCameraStream(facingRef.current);
      if (generationRef.current !== generation) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video || generationRef.current !== generation) {
        stream.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
        return;
      }
      video.srcObject = stream;
      await video.play();

      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
      setTorchAvailable(Boolean(caps?.torch));

      reader.decodeFromStream(stream, video, (result, err) => {
        if (!result) {
          if (err && !(err instanceof NotFoundException)) {
            /* ignore transient errors */
          }
          return;
        }
        const text = result.getText()?.trim();
        if (!text) return;
        handleDecode(text);
      });
    } catch {
      setError(t("cameraDenied"));
    }
  }, [handleDecode, stopStream, t]);

  useEffect(() => {
    facingRef.current = facing;
  }, [facing]);

  useEffect(() => {
    if (!active) {
      stopStream();
      return;
    }
    guardRef.current.reset();
    pausedUntilRef.current = 0;
    void startCamera();
    return () => stopStream();
  }, [active, facing, startCamera, stopStream]);

  if (!active) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] bg-black rounded-xl overflow-hidden">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center gap-3">
            <p className="text-sm text-red-300">{error}</p>
            {onManualInput && (
              <button
                type="button"
                onClick={onManualInput}
                className="px-4 py-2 text-sm rounded-lg bg-white text-gray-900"
              >
                {t("manualInput")}
              </button>
            )}
          </div>
        ) : (
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-8 h-40 border-2 border-sky-400/70 rounded-lg pointer-events-none" />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
          className="px-3 py-2 text-xs rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
        >
          {t("switchCamera")}
        </button>
        {torchAvailable && (
          <button
            type="button"
            onClick={() => void applyTorch(!torchOn)}
            className={`px-3 py-2 text-xs rounded-lg border ${torchOn ? "border-sky-500 bg-sky-50 text-sky-700" : "border-gray-200 bg-white"}`}
          >
            {t("torch")}
          </button>
        )}
      </div>
    </div>
  );
}

export function ScanSessionControls({
  settings,
  onChange,
  showConveyorToggle = true,
}: {
  settings: ScanSessionSettings;
  onChange: (s: ScanSessionSettings) => void;
  showConveyorToggle?: boolean;
}) {
  const { t } = useCodeScannerT();
  const pauseOptions: ScanPauseSeconds[] = [0.5, 1, 2];

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
      {showConveyorToggle && (
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.conveyorMode}
            onChange={(e) => onChange({ ...settings, conveyorMode: e.target.checked })}
            className="mt-0.5"
          />
          <span className="text-sm">
            <span className="font-medium text-gray-900">{t("conveyorMode")}</span>
            <span className="block text-xs text-gray-500 mt-0.5">{t("conveyorModeHint")}</span>
          </span>
        </label>
      )}

      {settings.conveyorMode && showConveyorToggle && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-700">{t("pauseLabel")}</span>
            {pauseOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => onChange({ ...settings, pauseSeconds: opt })}
                className={`px-2.5 py-1 text-xs rounded-md border ${settings.pauseSeconds === opt ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white"}`}
              >
                {opt}с
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 leading-snug">{t("pauseHint")}</p>
        </div>
      )}
    </div>
  );
}

export function CameraToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const { t } = useCodeScannerT();
  return (
    <label className="flex items-start gap-2 cursor-pointer rounded-xl border border-gray-200 bg-white p-3">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span className="text-sm">
        <span className="font-medium text-gray-900">{enabled ? t("cameraOn") : t("cameraOff")}</span>
        <span className="block text-xs text-gray-500 mt-0.5">
          {enabled ? t("cameraOnHint") : t("cameraOffHint")}
        </span>
      </span>
    </label>
  );
}

/** @deprecated use ScanSessionControls */
export function PauseSelector({
  value,
  onChange,
}: {
  value: ScanPauseSeconds;
  onChange: (v: ScanPauseSeconds) => void;
}) {
  return (
    <ScanSessionControls
      settings={{ pauseSeconds: value, conveyorMode: true }}
      onChange={(s) => onChange(s.pauseSeconds)}
    />
  );
}
