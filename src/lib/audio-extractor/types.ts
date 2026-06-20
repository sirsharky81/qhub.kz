import type { ExportFormat } from "@/lib/music-editor/types";
import type { SUPPORTED_PLATFORMS } from "./constants";

export type AudioPlatform = (typeof SUPPORTED_PLATFORMS)[number];

export interface VideoMetadata {
  title: string;
  duration: number;
  thumbnail: string | null;
  platform: AudioPlatform;
  uploader: string | null;
  id: string;
}

export interface ExtractedAudio {
  buffer: AudioBuffer;
  peaks: number[];
  blob: Blob;
  mimeType: string;
  metadata: VideoMetadata;
}

export type ExtractorStep = "input" | "metadata" | "extracting" | "ready" | "error";

export type { ExportFormat };
