"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import InstrumentSelector from "./components/InstrumentSelector";
import MicSelector from "./components/MicSelector";
import Needle from "./components/Needle";
import NoteDisplay from "./components/NoteDisplay";
import PerformanceBanner from "./components/PerformanceBanner";
import PermissionDialog from "./components/PermissionDialog";
import StringSelector from "./components/StringSelector";
import TunerControls, { type TunerSessionState } from "./components/TunerControls";
import TunerDebugPanel from "./components/TunerDebugPanel";
import TuningSelector from "./components/TuningSelector";
import { useMicVisibilityResume } from "@/lib/guitar-tuner/hooks/useMicrophone";
import { usePitchDetection } from "@/lib/guitar-tuner/hooks/usePitchDetection";
import { useTunerState } from "@/lib/guitar-tuner/hooks/useTunerState";
import { isIOSDevice, isStandalonePWA } from "@/lib/platform/device";
import { loadTunerSettings, saveTunerSettings } from "@/lib/guitar-tuner/storage";
import {
  getDefaultTuning,
  getInstrument,
  getTuning,
  INSTRUMENTS,
} from "@/lib/guitar-tuner/tunings";
import type { InstrumentId, TunerSettings } from "@/lib/guitar-tuner/types";

async function loadMicList(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const mics = devices.filter((d) => d.kind === "audioinput");
  return mics.some((m) => m.label.length > 0) ? mics : [];
}

export default function GuitarTunerClient() {
  const [settings, setSettings] = useState<TunerSettings | null>(null);
  const [sessionState, setSessionState] = useState<TunerSessionState>("idle");
  const [showPermission, setShowPermission] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [pwaHint, setPwaHint] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);

  const isActive = sessionState === "active";

  useEffect(() => {
    void loadTunerSettings().then(setSettings);
  }, []);

  const instrument = useMemo(
    () => getInstrument(settings?.instrumentId ?? "guitar"),
    [settings?.instrumentId],
  );

  const tuning = useMemo(() => {
    if (!settings) return getDefaultTuning("guitar");
    return getTuning(settings.instrumentId, settings.tuningId) ?? getDefaultTuning(settings.instrumentId);
  }, [settings]);

  const pitch = usePitchDetection({
    tuning,
    deviceId: settings?.micDeviceId ?? null,
    a4CalibrationCents: settings?.a4CalibrationCents ?? 0,
    enabled: isActive,
  });

  const tuner = useTunerState(pitch.isReconfiguring);

  useMicVisibilityResume(
    isActive ? pitch.audioContext : null,
    isActive ? pitch.stream : null,
    pitch.reacquire,
  );

  useEffect(() => {
    if (!isActive || !pitch.reading) return;
    tuner.pushReading(pitch.reading);
  }, [pitch.reading, isActive, tuner]);

  useEffect(() => {
    if (!isActive) return;

    let cancelled = false;

    void pitch.start().catch((err) => {
      if (cancelled) return;
      pitch.stop();
      setSessionState("idle");
      const message = err instanceof Error ? err.message : "Microphone access failed";
      setStartError(message);
      setPermissionDenied(
        err instanceof DOMException &&
          (err.name === "NotAllowedError" || err.name === "PermissionDeniedError"),
      );
      if (isIOSDevice() && isStandalonePWA()) {
        setPwaHint(true);
      }
      setShowPermission(true);
    });

    return () => {
      cancelled = true;
      pitch.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, settings?.micDeviceId, settings?.a4CalibrationCents]);

  useEffect(() => {
    if (!isActive || !pitch.stream) return;
    void loadMicList().then(setAvailableMics);
  }, [isActive, pitch.stream]);

  const updateSettings = useCallback(
    async (patch: Partial<TunerSettings>) => {
      setSettings((prev) => {
        const next = { ...(prev ?? ({} as TunerSettings)), ...patch };
        void saveTunerSettings(patch);
        return next;
      });
      tuner.reset();
    },
    [tuner],
  );

  const handleInstrumentChange = (id: string) => {
    const inst = getInstrument(id);
    if (!inst) return;
    void updateSettings({
      instrumentId: id as InstrumentId,
      tuningId: inst.tunings[0].id,
      selectedStringIndex: null,
    });
  };

  const handleStart = () => {
    setStartError(null);
    setPermissionDenied(false);
    setShowPermission(false);
    setSessionState("active");
  };

  const handlePause = () => {
    pitch.stop();
    tuner.reset();
    setSessionState("paused");
  };

  const handleResume = () => {
    setSessionState("active");
  };

  const handleStop = () => {
    pitch.stop();
    tuner.reset();
    setSessionState("idle");
    setAvailableMics([]);
    setShowPermission(false);
    setStartError(null);
  };

  const handleMicChange = async (deviceId: string) => {
    await updateSettings({ micDeviceId: deviceId });
  };

  if (!settings) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
        Загрузка...
      </div>
    );
  }

  const displayCents = tuner.display?.cents ?? 0;
  const displayConfidence = tuner.display?.confidence ?? tuner.rawReading?.confidence ?? 0;
  const displayState = sessionState === "active" ? tuner.displayState : "listening";

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-6 pb-8">
      <PermissionDialog
        open={showPermission}
        denied={permissionDenied}
        pwaHint={pwaHint}
        error={startError}
        onRequest={handleStart}
      />

      <TunerControls
        sessionState={sessionState}
        onStart={handleStart}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
      />

      {sessionState === "paused" && (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          Микрофон отключён. Нажмите «Продолжить» или «Завершить».
        </p>
      )}

      {sessionState === "idle" && (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          Нажмите «Начать проверку», чтобы включить микрофон.
        </p>
      )}

      {pitch.useFallback && isActive && <PerformanceBanner />}

      <InstrumentSelector
        instruments={INSTRUMENTS}
        value={settings.instrumentId}
        onChange={handleInstrumentChange}
      />

      {instrument && (
        <TuningSelector
          tunings={instrument.tunings}
          value={settings.tuningId}
          onChange={(tuningId) => void updateSettings({ tuningId, selectedStringIndex: null })}
        />
      )}

      <StringSelector
        strings={tuning.strings}
        selectedIndex={settings.selectedStringIndex}
        activeNote={tuner.display?.note ?? null}
        onSelect={(index) => void updateSettings({ selectedStringIndex: index })}
      />

      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <NoteDisplay
          note={tuner.display?.note ?? "—"}
          cents={displayCents}
          frequency={tuner.display?.frequency ?? 0}
          confidence={displayConfidence}
          displayState={displayState}
        />
        <Needle
          cents={displayCents}
          confidence={displayConfidence}
          displayState={displayState}
        />
      </div>

      {isActive && availableMics.length > 0 && (
        <MicSelector
          mics={availableMics}
          value={settings.micDeviceId}
          onChange={handleMicChange}
          level={tuner.rawReading?.rms ?? 0}
        />
      )}

      <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-900">
        <label className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-300">
          <span>Калибровка A4</span>
          <span>
            {settings.a4CalibrationCents > 0 ? "+" : ""}
            {settings.a4CalibrationCents} cents
          </span>
        </label>
        <input
          type="range"
          min={-50}
          max={50}
          step={1}
          value={settings.a4CalibrationCents}
          onChange={(e) => void updateSettings({ a4CalibrationCents: Number(e.target.value) })}
          className="mt-2 w-full accent-emerald-600"
        />
      </div>

      <TunerDebugPanel />
    </div>
  );
}
