import type { ProcessProgress } from "../types";
import { runFfmpeg, outputFilename, uint8ToBlob } from "../ffmpeg-client";
import { applyFilenameFix } from "../filename-encoding";

export async function extractMp3(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const out = `out_${Date.now()}.mp3`;
  const data = await runFfmpeg(
    file,
    ["-vn", "-c:a", "libmp3lame", "-b:a", "192k"],
    out,
    onProgress,
  );
  return {
    blob: uint8ToBlob(data, "audio/mpeg"),
    filename: applyFilenameFix(outputFilename(file.name, "mp3")),
    mimeType: "audio/mpeg",
  };
}

export async function convertToWebm(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const out = `out_${Date.now()}.webm`;
  const data = await runFfmpeg(
    file,
    ["-c:v", "libvpx-vp9", "-crf", "33", "-b:v", "0", "-c:a", "libopus"],
    out,
    onProgress,
  );
  return {
    blob: uint8ToBlob(data, "video/webm"),
    filename: outputFilename(file.name, "webm"),
    mimeType: "video/webm",
  };
}

export async function createGif(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const out = `out_${Date.now()}.gif`;
  const data = await runFfmpeg(
    file,
    [
      "-t", "10",
      "-vf", "fps=10,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
    ],
    out,
    onProgress,
  );
  return {
    blob: uint8ToBlob(data, "image/gif"),
    filename: outputFilename(file.name, "gif"),
    mimeType: "image/gif",
  };
}

export async function compressVideo(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const out = `out_${Date.now()}.mp4`;
  const data = await runFfmpeg(
    file,
    ["-c:v", "libx264", "-crf", "28", "-preset", "fast", "-c:a", "aac", "-b:a", "128k"],
    out,
    onProgress,
  );
  return {
    blob: uint8ToBlob(data, "video/mp4"),
    filename: outputFilename(file.name, "mp4"),
    mimeType: "video/mp4",
  };
}

export async function resizeVideo(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const out = `out_${Date.now()}.mp4`;
  const data = await runFfmpeg(
    file,
    ["-vf", "scale=1280:-2", "-c:v", "libx264", "-crf", "23", "-c:a", "copy"],
    out,
    onProgress,
  );
  return {
    blob: uint8ToBlob(data, "video/mp4"),
    filename: outputFilename(file.name, "mp4"),
    mimeType: "video/mp4",
  };
}
