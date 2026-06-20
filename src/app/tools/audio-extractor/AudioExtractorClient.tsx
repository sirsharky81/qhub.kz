"use client";

import { useCallback, useRef, useState } from "react";
import { PlaybackControls, useAudioPlayer } from "@/components/music-editor/AudioPlayer";
import { ExportPanel } from "@/components/music-editor/ExportPanel";
import { ProgressOverlay } from "@/components/music-editor/ProgressOverlay";
import { EphemeralPrivacyBanner } from "@/components/audio-extractor/EphemeralPrivacyBanner";
import { ExtractProgress } from "@/components/audio-extractor/ExtractProgress";
import { LegalDisclaimer, readStoredConsent } from "@/components/audio-extractor/LegalDisclaimer";
import { MetadataCard } from "@/components/audio-extractor/MetadataCard";
import { UrlInput } from "@/components/audio-extractor/UrlInput";
import { WaveformPlayer } from "@/components/audio-extractor/WaveformPlayer";
import { AudioExtractorHeader } from "@/components/audio-extractor/LocaleSwitcher";
import { ExtractClientError, fetchAudioStream, fetchMetadata } from "@/lib/audio-extractor/extract-client";
import { loadExtractedAudio } from "@/lib/audio-extractor/load-audio";
import { useAudioExtractorT } from "@/lib/audio-extractor/i18n";
import type { ExportFormat } from "@/lib/music-editor/types";
import { exportAudioBuffer, downloadBlob } from "@/lib/music-editor/ffmpeg";
import { sanitizeFilename } from "@/lib/file-converter/filename-encoding";
import type { ExtractedAudio, ExtractorStep, VideoMetadata } from "@/lib/audio-extractor/types";

function mapClientError(err: unknown, t: (k: string) => string): string {
  if (err instanceof ExtractClientError) {
    if (err.status === 429) return t("errorRateLimit");
    if (err.status === 404) return t("errorUnavailable");
    if (err.status === 400 && err.message.includes("10")) return t("errorTooLong");
    if (err.status === 503) return t("errorService");
    return err.message || t("errorGeneric");
  }
  if (err instanceof Error) return err.message;
  return t("errorGeneric");
}

export default function AudioExtractorClient() {
  const { t } = useAudioExtractorT();
  const [step, setStep] = useState<ExtractorStep>("input");
  const [url, setUrl] = useState("");
  const [consented, setConsented] = useState(() => readStoredConsent());
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [extracted, setExtracted] = useState<ExtractedAudio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamPercent, setStreamPercent] = useState<number | null>(null);
  const [decodePercent, setDecodePercent] = useState<number | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("mp3-320");
  const [exporting, setExporting] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const extractGenRef = useRef(0);

  const player = useAudioPlayer();

  const resetToInput = useCallback(() => {
    player.stop();
    setStep("input");
    setMetadata(null);
    setExtracted(null);
    setError(null);
    setStreamPercent(null);
    setDecodePercent(null);
  }, [player]);

  const handleFetchMetadata = useCallback(async () => {
    setError(null);
    if (!consented) {
      setError(t("errorConsent"));
      return;
    }
    if (!url.trim()) return;

    setMetadataLoading(true);
    setMetadata(null);
    try {
      const meta = await fetchMetadata(url.trim());
      setMetadata(meta);
      setStep("metadata");
    } catch (err) {
      setError(mapClientError(err, t));
      setStep("error");
    } finally {
      setMetadataLoading(false);
    }
  }, [consented, url, t]);

  const handleExtract = useCallback(async () => {
    if (!metadata) return;
    setError(null);
    setStep("extracting");
    setStreamPercent(null);
    setDecodePercent(null);

    const gen = ++extractGenRef.current;

    try {
      const blob = await fetchAudioStream(url.trim(), (loaded, total) => {
        if (gen !== extractGenRef.current) return;
        if (total && total > 0) {
          setStreamPercent((loaded / total) * 100);
        } else {
          setStreamPercent(null);
        }
      });

      if (gen !== extractGenRef.current) return;

      setDecodePercent(0);
      const result = await loadExtractedAudio(blob, metadata, (pct) => {
        if (gen === extractGenRef.current) setDecodePercent(pct);
      });

      if (gen !== extractGenRef.current) return;

      setExtracted(result);
      player.load(result.buffer);
      setStep("ready");
    } catch (err) {
      if (gen !== extractGenRef.current) return;
      setError(mapClientError(err, t));
      setStep("error");
    } finally {
      if (gen === extractGenRef.current) {
        setDecodePercent(null);
        setStreamPercent(null);
      }
    }
  }, [metadata, url, player, t]);

  const handleExport = useCallback(async () => {
    if (!extracted) return;
    player.stop();
    setExporting(true);
    try {
      const blob = await exportAudioBuffer(extracted.buffer, exportFormat);
      const ext = exportFormat === "wav" ? "wav" : "mp3";
      const base = sanitizeFilename(extracted.metadata.title) || "audio";
      downloadBlob(blob, `${base}.${ext}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    } finally {
      setExporting(false);
    }
  }, [extracted, exportFormat, player, t]);

  const showDecodeOverlay =
    step === "extracting" && decodePercent !== null && decodePercent < 100;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-4 py-4 space-y-4">
        <AudioExtractorHeader />
        <EphemeralPrivacyBanner />
        <LegalDisclaimer consented={consented} onConsentChange={setConsented} />

        {(step === "input" || step === "error") && (
          <UrlInput
            value={url}
            onChange={setUrl}
            onSubmit={handleFetchMetadata}
            consented={consented}
            loading={metadataLoading}
          />
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
            {step === "error" && (
              <button
                type="button"
                onClick={resetToInput}
                className="block mt-2 text-xs font-semibold underline"
              >
                {t("newLink")}
              </button>
            )}
          </div>
        )}

        {metadata && step === "metadata" && (
          <MetadataCard
            metadata={metadata}
            onExtract={handleExtract}
            onCancel={resetToInput}
          />
        )}

        {step === "extracting" && (
          <ExtractProgress
            percent={decodePercent ?? streamPercent}
            label={decodePercent !== null ? t("loadingAudio") : t("loadingAudio")}
          />
        )}

        {extracted && step === "ready" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
              <p className="text-sm font-semibold text-gray-900">{extracted.metadata.title}</p>
              <WaveformPlayer
                peaks={extracted.peaks}
                duration={player.duration}
                currentTime={player.currentTime}
                isPlaying={player.isPlaying}
                onSeek={player.seek}
                getPlayheadTime={() => player.currentTimeRef.current}
              />
              <PlaybackControls
                isPlaying={player.isPlaying}
                currentTime={player.currentTime}
                duration={player.duration}
                onPlay={() => player.play()}
                onPause={player.pause}
                onStop={player.stop}
                onSeek={player.seek}
                onSkipBack={() => player.skip(-5)}
                onSkipForward={() => player.skip(5)}
              />
            </div>

            <ExportPanel
              format={exportFormat}
              onFormatChange={setExportFormat}
              onExport={handleExport}
              exporting={exporting}
              filename={sanitizeFilename(extracted.metadata.title) || "audio"}
              saveTargetLabel={extracted.metadata.title}
            />

            <button
              type="button"
              onClick={resetToInput}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
            >
              {t("newLink")}
            </button>
          </div>
        )}
      </div>

      {showDecodeOverlay && decodePercent !== null && (
        <ProgressOverlay message={t("loadingAudio")} progress={decodePercent} />
      )}
    </div>
  );
}
