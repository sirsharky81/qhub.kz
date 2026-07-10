import type { DecryptedHistoryMessage } from "./history-db";
import { extractHttpLinks } from "./linkify";

export type HistoryMediaBucket = "media" | "docs" | "links";

export interface HistoryMediaItem {
  messageId: string;
  ts: number;
  mine: boolean;
  fromPhone?: string;
  bucket: HistoryMediaBucket;
  mime?: string;
  filename?: string;
  durationMs?: number;
  dataBase64?: string;
  dataUrl?: string;
  url?: string;
  context?: string;
}

function isDocumentMime(mime?: string, filename?: string): boolean {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/") || m.startsWith("video/") || m.startsWith("audio/")) return false;
  if (m.includes("pdf") || m.includes("msword") || m.includes("officedocument") || m.includes("text/")) {
    return true;
  }
  const name = (filename ?? "").toLowerCase();
  return /\.(pdf|docx?|xlsx?|pptx?|txt|zip|rar|7z)$/i.test(name);
}

export function extractHistoryMedia(history: DecryptedHistoryMessage[]): HistoryMediaItem[] {
  const items: HistoryMediaItem[] = [];

  for (const msg of history) {
    const plain = msg.plain;
    if (msg.type === "image" || msg.type === "video") {
      if (!plain.data) continue;
      items.push({
        messageId: msg.id,
        ts: msg.ts,
        mine: msg.mine,
        fromPhone: msg.fromPhone,
        bucket: "media",
        mime: plain.mime,
        filename: plain.filename,
        durationMs: plain.durationMs,
        dataBase64: plain.data,
        dataUrl: `data:${plain.mime ?? "application/octet-stream"};base64,${plain.data}`,
      });
      continue;
    }

    if (msg.type === "file" || msg.type === "audio") {
      if (!plain.data) continue;
      const asDoc = msg.type === "file" && isDocumentMime(plain.mime, plain.filename);
      items.push({
        messageId: msg.id,
        ts: msg.ts,
        mine: msg.mine,
        fromPhone: msg.fromPhone,
        bucket: asDoc ? "docs" : msg.type === "audio" ? "media" : "docs",
        mime: plain.mime,
        filename: plain.filename ?? (msg.type === "audio" ? "Голосовое" : "Файл"),
        durationMs: plain.durationMs,
        dataBase64: plain.data,
        dataUrl: `data:${plain.mime ?? "application/octet-stream"};base64,${plain.data}`,
      });
      continue;
    }

    if (msg.type === "text" && plain.text) {
      for (const url of extractHttpLinks(plain.text)) {
        items.push({
          messageId: msg.id,
          ts: msg.ts,
          mine: msg.mine,
          fromPhone: msg.fromPhone,
          bucket: "links",
          url,
          context: plain.text,
        });
      }
    }
  }

  return items.sort((a, b) => b.ts - a.ts);
}

export function groupHistoryMedia(items: HistoryMediaItem[]) {
  return {
    media: items.filter((i) => i.bucket === "media"),
    docs: items.filter((i) => i.bucket === "docs"),
    links: items.filter((i) => i.bucket === "links"),
  };
}
