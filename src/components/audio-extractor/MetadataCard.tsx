"use client";

import { SOFT_DURATION_WARN_SEC } from "@/lib/audio-extractor/constants";
import { formatDuration, useAudioExtractorT } from "@/lib/audio-extractor/i18n";
import type { VideoMetadata } from "@/lib/audio-extractor/types";

interface MetadataCardProps {
  metadata: VideoMetadata;
  onExtract: () => void;
  onCancel: () => void;
  extracting?: boolean;
}

function platformLabel(platform: VideoMetadata["platform"], t: (k: string) => string): string {
  if (platform === "tiktok") return t("platformTiktok");
  if (platform === "instagram") return t("platformInstagram");
  return t("platformYoutube");
}

export function MetadataCard({ metadata, onExtract, onCancel, extracting }: MetadataCardProps) {
  const { t } = useAudioExtractorT();
  const longWarning = metadata.duration > SOFT_DURATION_WARN_SEC;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
      <div className="flex gap-3">
        {metadata.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={metadata.thumbnail}
            alt=""
            className="w-24 h-16 object-cover rounded-lg bg-gray-100 flex-shrink-0"
          />
        ) : (
          <div className="w-24 h-16 rounded-lg bg-gray-100 flex-shrink-0" />
        )}
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-gray-900 line-clamp-2">{metadata.title}</p>
          {metadata.uploader && (
            <p className="text-xs text-gray-500">
              {t("author")}: {metadata.uploader}
            </p>
          )}
          <p className="text-xs text-gray-500">
            {t("platform")}: {platformLabel(metadata.platform, t)} · {t("duration")}:{" "}
            {formatDuration(metadata.duration)}
          </p>
        </div>
      </div>

      {longWarning && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {t("durationWarning")}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onExtract}
          disabled={extracting}
          className="flex-1 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 disabled:opacity-50"
        >
          {extracting ? t("loadingAudio") : t("extractAudio")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={extracting}
          className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
