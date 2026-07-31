import JSZip from "jszip";
import {
  downloadBlobDirect,
  isIOSWebShare,
  saveBlobToDevice,
  shareMultipleFilesToDevice,
} from "@/lib/platform/save-file";
import { hasFolderStructure } from "./pick-files";

export interface ReceivedShareFile {
  name: string;
  blob: Blob;
}

export interface SaveReceivedResult {
  savedCount: number;
  /** iOS needs a tap — show «Сохранить в Фото» button. */
  needsUserAction: boolean;
  files: ReceivedShareFile[];
}

function basename(relativePath: string): string {
  return relativePath.split("/").pop() ?? relativePath;
}

export function guessShareMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

function toFile(entry: ReceivedShareFile): File {
  const name = basename(entry.name);
  const type = entry.blob.type || guessShareMime(name);
  return new File([entry.blob], name, { type });
}

function isGalleryMedia(file: File): boolean {
  return file.type.startsWith("image/") || file.type.startsWith("video/");
}

async function saveSequentialDownloads(files: File[]): Promise<void> {
  for (let i = 0; i < files.length; i += 1) {
    downloadBlobDirect(files[i]!, files[i]!.name);
    if (i < files.length - 1) {
      await new Promise((r) => window.setTimeout(r, 400));
    }
  }
}

export async function saveShareReceivedFiles(files: ReceivedShareFile[]): Promise<SaveReceivedResult> {
  if (!files.length) {
    return { savedCount: 0, needsUserAction: false, files: [] };
  }

  const asFolder = hasFolderStructure(
    files.map((f) => ({ file: new File([], f.name), relativePath: f.name })),
  );

  if (asFolder && files.length > 1) {
    await saveFilesAsZip(files, `${files[0]!.name.split("/")[0] ?? "qhub-share"}.zip`);
    return { savedCount: files.length, needsUserAction: false, files: [] };
  }

  const fileObjects = files.map(toFile);
  const allMedia = fileObjects.every(isGalleryMedia);

  if (allMedia && (await shareMultipleFilesToDevice(fileObjects))) {
    return { savedCount: files.length, needsUserAction: false, files: [] };
  }

  if (isIOSWebShare()) {
    return { savedCount: 0, needsUserAction: true, files };
  }

  if (fileObjects.length === 1) {
    await saveBlobToDevice(fileObjects[0]!, fileObjects[0]!.name);
    return { savedCount: 1, needsUserAction: false, files: [] };
  }

  await saveSequentialDownloads(fileObjects);
  return { savedCount: files.length, needsUserAction: false, files: [] };
}

/** User tapped «Сохранить в Фото» — batch share for gallery. */
export async function saveReceivedFilesToGallery(files: ReceivedShareFile[]): Promise<boolean> {
  const fileObjects = files.map(toFile);
  if (!fileObjects.length) return false;
  return shareMultipleFilesToDevice(fileObjects);
}

export async function saveFilesAsZip(
  files: ReceivedShareFile[],
  zipName = "qhub-share.zip",
): Promise<void> {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.name, f.blob);
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  await saveBlobToDevice(blob, zipName);
}

export async function saveReceivedFile(blob: Blob, relativePath: string): Promise<void> {
  const name = basename(relativePath);
  const typed = blob.type ? blob : new Blob([blob], { type: guessShareMime(name) });
  await saveBlobToDevice(typed, name);
}
