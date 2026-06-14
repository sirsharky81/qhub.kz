import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ProcessProgress } from "../types";
import { ConverterError } from "../errors";
import { uint8ToBlob } from "../ffmpeg-client";

async function loadEpubZip(file: File): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new ConverterError("corrupted");
  }
}

async function getEpubText(zip: JSZip): Promise<string> {
  const container = await zip.file("META-INF/container.xml")?.async("text");
  if (!container) throw new ConverterError("corrupted");
  const rootMatch = container.match(/full-path="([^"]+)"/);
  const opfPath = rootMatch?.[1];
  if (!opfPath) throw new ConverterError("corrupted");

  const opf = await zip.file(opfPath)?.async("text");
  if (!opf) throw new ConverterError("corrupted");

  const basePath = opfPath.replace(/[^/]+$/, "");
  const hrefMatches = [...opf.matchAll(/href="([^"]+\.(xhtml|html|htm))"/gi)];
  const parts: string[] = [];

  for (const match of hrefMatches) {
    const href = match[1]!;
    const fullPath = href.startsWith("/") ? href.slice(1) : basePath + href;
    const html = await zip.file(fullPath)?.async("text");
    if (html) {
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) parts.push(text);
    }
  }

  return parts.join("\n\n");
}

export async function epubToTxt(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  onProgress?.({ stage: "read", percent: 30, message: "Чтение EPUB…" });
  const zip = await loadEpubZip(file);
  const text = await getEpubText(zip);
  return {
    blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
    filename: file.name.replace(/\.epub$/i, ".txt"),
    mimeType: "text/plain",
  };
}

export async function epubToPdf(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  onProgress?.({ stage: "read", percent: 20, message: "Чтение EPUB…" });
  const zip = await loadEpubZip(file);
  const text = await getEpubText(zip);

  onProgress?.({ stage: "pdf", percent: 50, message: "Создание PDF…" });
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontSize = 11;
  const margin = 50;
  const lineHeight = fontSize * 1.4;
  const pageWidth = 595;
  const pageHeight = 842;
  const maxWidth = pageWidth - margin * 2;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const words = text.split(/\s+/);
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    const width = font.widthOfTextAtSize(test, fontSize);
    if (width > maxWidth && line) {
      page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
      y -= lineHeight;
      line = word;
      if (y < margin) {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
    } else {
      line = test;
    }
  }
  if (line) {
    page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0, 0, 0) });
  }

  const bytes = await pdf.save();
  return {
    blob: uint8ToBlob(bytes, "application/pdf"),
    filename: file.name.replace(/\.epub$/i, ".pdf"),
    mimeType: "application/pdf",
  };
}

export async function extractEpubCover(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  onProgress?.({ stage: "read", percent: 40, message: "Поиск обложки…" });
  const zip = await loadEpubZip(file);
  const container = await zip.file("META-INF/container.xml")?.async("text");
  const rootMatch = container?.match(/full-path="([^"]+)"/);
  const opfPath = rootMatch?.[1];
  const opf = opfPath ? await zip.file(opfPath)?.async("text") : null;

  let coverHref: string | undefined;
  if (opf) {
    const coverIdMatch = opf.match(/id="([^"]+)"[^>]*properties="cover-image"/);
    const coverId = coverIdMatch?.[1];
    if (coverId) {
      const hrefMatch = opf.match(new RegExp(`id="${coverId}"[^>]*href="([^"]+)"`));
      coverHref = hrefMatch?.[1];
    }
    if (!coverHref) {
      const imgMatch = opf.match(/href="([^"]+cover[^"]*\.(jpg|jpeg|png|webp))"/i);
      coverHref = imgMatch?.[1];
    }
  }

  const basePath = opfPath?.replace(/[^/]+$/, "") ?? "";
  const imagePath = coverHref
    ? coverHref.startsWith("/")
      ? coverHref.slice(1)
      : basePath + coverHref
    : undefined;

  let imageFile = imagePath ? zip.file(imagePath) : null;
  if (!imageFile) {
    const images = Object.keys(zip.files).filter((p) => /\.(jpg|jpeg|png|webp)$/i.test(p));
    imageFile = images[0] ? zip.file(images[0]) : null;
  }

  if (!imageFile) throw new ConverterError("conversion-failed", "Cover not found");
  const data = await imageFile.async("blob");
  const ext = imageFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
  return {
    blob: data,
    filename: file.name.replace(/\.epub$/i, `-cover.${ext}`),
    mimeType: data.type || "image/jpeg",
  };
}

export async function fb2ToTxt(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  onProgress?.({ stage: "read", percent: 40, message: "Чтение FB2…" });
  const xml = await file.text();
  const text = xml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
    filename: file.name.replace(/\.fb2$/i, ".txt"),
    mimeType: "text/plain",
  };
}

export async function fb2ToEpub(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  onProgress?.({ stage: "read", percent: 30, message: "Чтение FB2…" });
  const xml = await file.text();
  const title = xml.match(/<book-title[^>]*>([^<]+)<\/book-title>/i)?.[1] ?? "Book";
  const body = xml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? xml;
  const htmlBody = body.replace(/<p>/gi, "<p>").replace(/<\/p>/gi, "</p>");

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title></metadata><manifest><item id="ch1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/></spine></package>`,
  );
  zip.file(
    "OEBPS/chapter.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title></head><body>${htmlBody}</body></html>`,
  );

  const epubBlob = await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
  return {
    blob: epubBlob,
    filename: file.name.replace(/\.fb2$/i, ".epub"),
    mimeType: "application/epub+zip",
  };
}

export async function fb2ToPdf(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const txt = await fb2ToTxt(file, onProgress);
  const textFile = new File([txt.blob], "temp.txt", { type: "text/plain" });
  return textToPdf(textFile, onProgress);
}

export async function mobiToEpub(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  onProgress?.({ stage: "read", percent: 20, message: "Чтение MOBI…" });
  const buffer = await file.arrayBuffer();
  const view = new Uint8Array(buffer);
  const text = extractMobiText(view);
  if (!text || text.length < 50) {
    throw new ConverterError("conversion-failed", "MOBI text extraction limited");
  }
  const title = file.name.replace(/\.(mobi|azw3)$/i, "");
  const txtFile = new File([text], `${title}.txt`, { type: "text/plain" });
  return txtToEpub(txtFile, onProgress);
}

export async function mobiToPdf(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const epub = await mobiToEpub(file, onProgress);
  const epubFile = new File([epub.blob], epub.filename, { type: epub.mimeType });
  return epubToPdf(epubFile, onProgress);
}

export async function txtToEpub(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  onProgress?.({ stage: "create", percent: 50, message: "Создание EPUB…" });
  const text = await file.text();
  const title = file.name.replace(/\.txt$/i, "") || "Book";
  const paragraphs = text.split(/\n\n+/).map((p) => `<p>${escapeHtml(p)}</p>`).join("");

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeHtml(title)}</dc:title></metadata><manifest><item id="c1" href="text.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`,
  );
  zip.file(
    "OEBPS/text.xhtml",
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escapeHtml(title)}</title></head><body>${paragraphs}</body></html>`,
  );

  return {
    blob: await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" }),
    filename: file.name.replace(/\.txt$/i, ".epub"),
    mimeType: "application/epub+zip",
  };
}

async function textToPdf(
  file: File,
  onProgress?: (p: ProcessProgress) => void,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const text = await file.text();
  onProgress?.({ stage: "pdf", percent: 60, message: "Создание PDF…" });
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const lines = text.match(/.{1,80}(\s|$)/g) ?? [text];
  let page = pdf.addPage();
  let y = 750;
  for (const line of lines) {
    if (y < 50) {
      page = pdf.addPage();
      y = 750;
    }
    page.drawText(line.trim(), { x: 50, y, size: 11, font });
    y -= 14;
  }
  const bytes = await pdf.save();
  return {
    blob: uint8ToBlob(bytes, "application/pdf"),
    filename: file.name.replace(/\.txt$/i, ".pdf"),
    mimeType: "application/pdf",
  };
}

function extractMobiText(view: Uint8Array): string {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const raw = decoder.decode(view);
  const cleaned = raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ")
    .replace(/\s{3,}/g, " ")
    .trim();
  const sentences = cleaned.match(/[A-Za-zА-Яа-яЁё0-9][^.!?]{20,}[.!?]/g);
  return sentences?.slice(0, 500).join(" ") ?? cleaned.slice(0, 50000);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
