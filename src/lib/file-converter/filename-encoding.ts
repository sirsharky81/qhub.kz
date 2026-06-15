import { parseBlob } from "music-metadata";

/** Unicode → byte для windows-1251 (обратная таблица TextDecoder) */
const CP1251_ENCODE = (() => {
  const map = new Map<string, number>();
  const decoder = new TextDecoder("windows-1251");
  for (let b = 0; b < 256; b++) {
    const ch = decoder.decode(new Uint8Array([b]));
    if (ch.length === 1) map.set(ch, b);
  }
  return map;
})();

/** Признаки «битого» имени: UTF-8/CP1251, прочитанные как Latin-1 */
export function looksLikeBrokenEncoding(name: string): boolean {
  if (/[ÃÐÑ][\u0080-\u00FF]/.test(name)) return true;
  if (/â€[™œž""]/.test(name)) return true;
  if (/Ð[ÑÐ]/.test(name)) return true;

  const cyrillic = (name.match(/[а-яА-ЯёЁ]/g) || []).length;
  const latinExtended = (name.match(/[\u00C2-\u00FF]{2,}/g) || []).length;
  if (latinExtended > 0 && cyrillic === 0 && /[^\x00-\x7F]/.test(name)) return true;

  if (looksLikeUtf8MisreadAsCp1251(name)) return true;

  return false;
}

/** UTF-8 прочитан как CP1251: «РџРµСЃРЅСЏ» вместо «Песня» */
export function looksLikeUtf8MisreadAsCp1251(name: string): boolean {
  if (!/[а-яА-ЯёЁ]/.test(name)) return false;
  const fakePairs = (name.match(/[\u0420\u0421\u0401\u0451][\u0400-\u04FF]/g) || []).length;
  return fakePairs >= 2;
}

function latin1Bytes(str: string): Uint8Array {
  return new Uint8Array([...str].map((c) => c.charCodeAt(0) & 0xff));
}

function cp1251Bytes(str: string): Uint8Array | null {
  const bytes: number[] = [];
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if (code <= 0x7f) {
      bytes.push(code);
      continue;
    }
    const byte = CP1251_ENCODE.get(ch);
    if (byte === undefined) return null;
    bytes.push(byte);
  }
  return new Uint8Array(bytes);
}

function scoreFilename(name: string): number {
  const cyrillic = (name.match(/[а-яА-ЯёЁ]/g) || []).length;
  const bad = (name.match(/[\uFFFD\u0000]/g) || []).length;
  const mojibake = (name.match(/[ÃÐÑâ€]/g) || []).length;
  const fakeCp1251 = (name.match(/[\u0420\u0421\u0401\u0451][\u0400-\u04FF]/g) || []).length;
  const latinExtended = (name.match(/[\u00C0-\u00FF]/g) || []).length;
  const controlBytes = (name.match(/[\u0080-\u009F]/g) || []).length;
  return (
    cyrillic * 3 -
    bad * 10 -
    mojibake * 5 -
    fakeCp1251 * 4 -
    latinExtended * 4 -
    controlBytes * 8
  );
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

/** UTF-8 → CP1251 → bytes → UTF-8 (стандартный fix для «РџРµСЃРЅСЏ») */
function tryFixUtf8MisreadAsCp1251(text: string): string | null {
  const bytes = cp1251Bytes(text);
  if (!bytes) return null;
  return tryDecode(bytes, "utf-8");
}

function pickBestEncoding(text: string): { text: string; fixed: boolean } {
  const candidates: string[] = [text];

  const latin1 = latin1Bytes(text);
  const utf8FromLatin1 = tryDecode(latin1, "utf-8");
  if (utf8FromLatin1) candidates.push(utf8FromLatin1);

  const cp1251FromLatin1 = tryDecode(latin1, "windows-1251");
  if (cp1251FromLatin1) candidates.push(cp1251FromLatin1);

  if (looksLikeUtf8MisreadAsCp1251(text)) {
    const utf8FromCp1251 = tryFixUtf8MisreadAsCp1251(text);
    if (utf8FromCp1251) candidates.push(utf8FromCp1251);
  }

  let best = text;
  let bestScore = scoreFilename(text);

  for (const candidate of candidates) {
    const s = scoreFilename(candidate);
    if (s > bestScore) {
      bestScore = s;
      best = candidate;
    }
  }

  return { text: best, fixed: best !== text && bestScore > scoreFilename(text) };
}

export function fixTextEncoding(text: string): { text: string; fixed: boolean } {
  if (!looksLikeBrokenEncoding(text)) {
    return { text, fixed: false };
  }
  return pickBestEncoding(text);
}

export function fixFilenameEncoding(filename: string): { name: string; fixed: boolean } {
  const baseName = filename.replace(/^.*[/\\]/, "");
  const { text, fixed } = fixTextEncoding(baseName);
  return { name: fixed ? preservePath(filename, text) : filename, fixed };
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

export interface Mp3FixedTags {
  title?: string;
  artist?: string;
  album?: string;
}

export interface Mp3FixResult {
  filename: string;
  filenameFixed: boolean;
  tagsFixed: boolean;
  fixed: boolean;
  source: "encoding" | "id3" | "both" | "none";
  tags: Mp3FixedTags;
}

function fixOptionalText(value: string | undefined): { text?: string; fixed: boolean } {
  if (!value?.trim()) return { fixed: false };
  const result = fixTextEncoding(value.trim());
  return { text: result.text, fixed: result.fixed };
}

/** Исправляет имя файла и ID3-теги (title/artist/album — то, что показывает плеер) */
export async function resolveMp3Fix(file: File): Promise<Mp3FixResult> {
  const empty: Mp3FixResult = {
    filename: file.name,
    filenameFixed: false,
    tagsFixed: false,
    fixed: false,
    source: "none",
    tags: {},
  };

  if (!/\.mp3$/i.test(file.name)) return empty;

  const encodingFix = fixFilenameEncoding(file.name);
  let filename = encodingFix.fixed ? sanitizeFilename(encodingFix.name) : file.name;
  let filenameFixed = encodingFix.fixed;
  let tagsFixed = false;
  const tags: Mp3FixedTags = {};

  try {
    const parsed = await parseBlob(file);
    const rawTitle = parsed.common.title?.trim();
    const rawArtist = parsed.common.artist?.trim();
    const rawAlbum = parsed.common.album?.trim();

    const fixedTitle = fixOptionalText(rawTitle);
    const fixedArtist = fixOptionalText(rawArtist);
    const fixedAlbum = fixOptionalText(rawAlbum);

    if (rawTitle) tags.title = fixedTitle.fixed ? fixedTitle.text : rawTitle;
    if (rawArtist) tags.artist = fixedArtist.fixed ? fixedArtist.text : rawArtist;
    if (rawAlbum) tags.album = fixedAlbum.fixed ? fixedAlbum.text : rawAlbum;

    tagsFixed = fixedTitle.fixed || fixedArtist.fixed || fixedAlbum.fixed;

    if (!filenameFixed && tags.title) {
      const parts = [tags.artist, tags.title].filter(Boolean);
      const fromTags = sanitizeFilename(`${parts.join(" - ")}.mp3`);
      if (fromTags !== file.name && !looksLikeBrokenEncoding(fromTags)) {
        filename = fromTags;
        filenameFixed = true;
      }
    }
  } catch {
    /* optional */
  }

  const fixed = filenameFixed || tagsFixed;
  let source: Mp3FixResult["source"] = "none";
  if (filenameFixed && tagsFixed) source = "both";
  else if (filenameFixed) source = "encoding";
  else if (tagsFixed) source = "id3";

  return { filename, filenameFixed, tagsFixed, fixed, source, tags };
}

/** @deprecated Используйте resolveMp3Fix */
export async function resolveAudioFilename(file: File): Promise<{ filename: string; fixed: boolean; source: "encoding" | "id3" | "none" }> {
  const result = await resolveMp3Fix(file);
  const source =
    result.source === "both" ? "encoding" : result.source === "id3" ? "id3" : result.source;
  return { filename: result.filename, fixed: result.fixed, source };
}

export function buildMp3MetadataArgs(tags: Mp3FixedTags): string[] {
  const args: string[] = [];
  if (tags.title) args.push("-metadata", `title=${tags.title}`);
  if (tags.artist) args.push("-metadata", `artist=${tags.artist}`);
  if (tags.album) args.push("-metadata", `album=${tags.album}`);
  return args;
}

export function applyFilenameFix(filename: string): string {
  const { name, fixed } = fixFilenameEncoding(filename);
  return fixed ? sanitizeFilename(name) : filename;
}
