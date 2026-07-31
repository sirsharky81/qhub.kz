import JSZip from "jszip";
import { downloadBlobAsync } from "@/lib/platform/save-file";

export async function saveFilesAsZip(
  files: Array<{ name: string; blob: Blob }>,
  zipName = "qhub-share.zip",
): Promise<void> {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.name, f.blob);
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  await downloadBlobAsync(blob, zipName);
}

export async function saveReceivedFile(blob: Blob, relativePath: string): Promise<void> {
  const { saveBlobToDevice } = await import("@/lib/platform/save-file");
  const name = relativePath.split("/").pop() ?? relativePath;
  await saveBlobToDevice(blob, name);
}
