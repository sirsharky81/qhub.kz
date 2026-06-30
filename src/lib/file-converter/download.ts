import { saveBlobToDevice } from "@/lib/platform/save-file";

export function downloadBlob(blob: Blob, filename: string): void {
  void saveBlobToDevice(blob, filename);
}

export async function downloadZip(files: { name: string; blob: Blob }[], zipName: string): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.blob);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  await saveBlobToDevice(blob, zipName);
}
