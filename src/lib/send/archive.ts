import JSZip from "jszip";

export async function archiveFiles(
  files: { name: string; data: Buffer }[],
): Promise<{ data: Buffer; filename: string; mime: string }> {
  if (files.length === 1) {
    const only = files[0]!;
    return {
      data: only.data,
      filename: only.name,
      mime: guessMime(only.name),
    };
  }

  const zip = new JSZip();
  const used = new Set<string>();
  for (const file of files) {
    let name = file.name.replace(/[/\\]/g, "_") || "file";
    if (used.has(name)) {
      const dot = name.lastIndexOf(".");
      const base = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      let i = 2;
      while (used.has(`${base}-${i}${ext}`)) i++;
      name = `${base}-${i}${ext}`;
    }
    used.add(name);
    zip.file(name, file.data);
  }

  const data = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return {
    data,
    filename: "qhub-send.zip",
    mime: "application/zip",
  };
}

function guessMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  return "application/octet-stream";
}
