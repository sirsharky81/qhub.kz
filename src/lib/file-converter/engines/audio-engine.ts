import type { ProcessProgress } from "../types";
import { runFfmpeg, outputFilename, uint8ToBlob } from "../ffmpeg-client";
import { applyFilenameFix, buildMp3MetadataArgs, resolveMp3Fix } from "../filename-encoding";

type AudioFormat = "mp3" | "wav" | "aac" | "flac" | "ogg";

const CODEC_ARGS: Record<AudioFormat, string[]> = {
  mp3: ["-c:a", "libmp3lame", "-b:a", "192k"],
  wav: ["-c:a", "pcm_s16le"],
  aac: ["-c:a", "aac", "-b:a", "192k"],
  flac: ["-c:a", "flac"],
  ogg: ["-c:a", "libvorbis", "-q:a", "4"],
};

function withFixedName(originalName: string, newExt: string): string {
  const raw = outputFilename(originalName, newExt);
  return applyFilenameFix(raw);
}

export async function fixMp3Filename(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  onProgress?.({ stage: "analyze", percent: 30, message: "Чтение имени и ID3-тегов…" });
  const resolved = await resolveMp3Fix(file);

  if (resolved.tagsFixed) {
    onProgress?.({ stage: "encode", percent: 50, message: "Запись исправленных тегов в файл…" });
    const out = `out_${Date.now()}.mp3`;
    const metadataArgs = buildMp3MetadataArgs(resolved.tags);
    const data = await runFfmpeg(
      file,
      ["-c", "copy", "-map", "0", ...metadataArgs],
      out,
      onProgress,
    );
    onProgress?.({ stage: "done", percent: 100, message: "Готово" });
    return {
      blob: uint8ToBlob(data, "audio/mpeg"),
      filename: resolved.filename,
      mimeType: "audio/mpeg",
    };
  }

  onProgress?.({ stage: "done", percent: 100, message: "Готово" });
  return {
    blob: file,
    filename: resolved.filename,
    mimeType: file.type || "audio/mpeg",
  };
}

export async function convertAudio(
  file: File,
  format: AudioFormat,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const ext = format === "aac" ? "m4a" : format;
  const out = `out_${Date.now()}.${ext}`;
  const data = await runFfmpeg(file, CODEC_ARGS[format], out, onProgress);
  const mimeMap: Record<AudioFormat, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    aac: "audio/mp4",
    flac: "audio/flac",
    ogg: "audio/ogg",
  };
  const filename = format === "mp3" ? withFixedName(file.name, ext) : outputFilename(file.name, ext);
  return {
    blob: uint8ToBlob(data, mimeMap[format]),
    filename,
    mimeType: mimeMap[format],
  };
}

export async function changeBitrate(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const out = `out_${Date.now()}.mp3`;
  const data = await runFfmpeg(
    file,
    ["-c:a", "libmp3lame", "-b:a", "192k"],
    out,
    onProgress,
  );
  return {
    blob: uint8ToBlob(data, "audio/mpeg"),
    filename: withFixedName(file.name, "mp3"),
    mimeType: "audio/mpeg",
  };
}
