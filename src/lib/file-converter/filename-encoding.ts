import { parseBlob } from "music-metadata";

/** Признаки «битого» имени: UTF-8/CP1251, прочитанные как Latin-1 */
export function looksLikeBrokenEncoding(name: string): boolean {
  if (/[ÃÐÑ][\u0080-\u00FF]/.test(name)) return true;
  if (/â€[™œž""]/.test(name)) return true;
  if (/Ð[ÑÐ]/.test(name)) return true;

  const cyrillic = (name.match(/[а-яА-ЯёЁ]/g) || []).length;
  const latinExtended = (name.match(/[\u00C2-\u00FF]{2,}/g) || []).length;
  if (latinExtended > 0 && cyrillic === 0 && /[^\x00-\x7F]/.test(name)) return true;

  return false;
}

function latin1Bytes(str: string): Uint8Array {
  return new Uint8Array([...str].map((c) => c.charCodeAt(0) & 0xff));
}

function scoreFilename(name: string): number {
  const cyrillic = (name.match(/[а-яА-ЯёЁ]/g) || []).length;
  const bad = (name.match(/[\uFFFD\u0000]/g) || []).length;
  const mojibake = (name.match(/[ÃÐÑâ€]/g) || []).length;
  return cyrillic * 3 - bad * 10 - mojibake * 5;
}

function tryDecode(bytes: Uint8Array, encoding: string): string | null {
  try {
    const decoded = new TextDecoder(encoding).decode(bytes);
    if (!decoded || decoded.includes("\uFFFD")) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function fixFilenameEncoding(filename: string): { name: string; fixed: boolean } {
  const baseName = filename.replace(/^.*[/\\]/, "");
  if (!looksLikeBrokenEncoding(baseName)) {
    return { name: filename, fixed: false };
  }

  const bytes = latin1Bytes(baseName);
  const candidates: string[] = [baseName];

  const utf8 = tryDecode(bytes, "utf-8");
  if (utf8) candidates.push(utf8);

  const cp1251 = tryDecode(bytes, "windows-1251");
  if (cp1251) candidates.push(cp1251);

  const iso88595 = tryDecode(bytes, "iso-8859-5");
  if (iso88595) candidates.push(iso88595);

  let best = baseName;
  let bestScore = scoreFilename(baseName);

  for (const candidate of candidates) {
    const s = scoreFilename(candidate);
    if (s > bestScore) {
      bestScore = s;
      best = candidate;
    }
  }

  const fixed = best !== baseName && bestScore > scoreFilename(baseName);
  return { name: fixed ? preservePath(filename, best) : filename, fixed };
}

function preservePath(fullPath: string, newBase: string): string {
  const sep = fullPath.includes("\\") ? "\\" : "/";
  const idx = Math.max(fullPath.lastIndexOf("/"), fullPath.lastIndexOf("\\"));
  if (idx === -1) return newBase;
  return fullPath.slice(0, idx + 1) + newBase;
}

export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

/** Исправляет кодировку имени; для MP3 дополнительно пробует ID3-теги */
export async function resolveAudioFilename(file: File): Promise<{ filename: string; fixed: boolean; source: "encoding" | "id3" | "none" }> {
  const encodingFix = fixFilenameEncoding(file.name);
  if (encodingFix.fixed) {
    return { filename: sanitizeFilename(encodingFix.name), fixed: true, source: "encoding" };
  }

  if (!/\.mp3$/i.test(file.name)) {
    return { filename: file.name, fixed: false, source: "none" };
  }

  try {
    const tags = await parseBlob(file);
    const title = tags.common.title?.trim();
    if (title) {
      const parts = [tags.common.artist?.trim(), title].filter(Boolean);
      const fromTags = sanitizeFilename(`${parts.join(" - ")}.mp3`);
      if (fromTags !== file.name && !looksLikeBrokenEncoding(fromTags)) {
        return { filename: fromTags, fixed: true, source: "id3" };
      }
    }
  } catch {
    /* optional */
  }

  return { filename: file.name, fixed: false, source: "none" };
}

export function applyFilenameFix(filename: string): string {
  const { name, fixed } = fixFilenameEncoding(filename);
  return fixed ? sanitizeFilename(name) : filename;
}
