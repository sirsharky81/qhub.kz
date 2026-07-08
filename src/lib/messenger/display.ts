const SENDER_COLORS = [
  "text-sky-700",
  "text-violet-700",
  "text-emerald-700",
  "text-amber-700",
  "text-rose-700",
  "text-cyan-700",
  "text-orange-700",
  "text-indigo-700",
];

const AVATAR_BG_COLORS = [
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700",
  "bg-indigo-100 text-indigo-700",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function senderColorClass(phone: string): string {
  return SENDER_COLORS[hashString(phone) % SENDER_COLORS.length];
}

export function avatarBgClass(seed: string): string {
  return AVATAR_BG_COLORS[hashString(seed || "x") % AVATAR_BG_COLORS.length];
}

/** First letter from a display name / room title for avatar fallback. */
export function initialFromLabel(label: string): string | null {
  const letter = label.trim().match(/[\p{L}\p{N}]/u)?.[0];
  return letter ? letter.toUpperCase() : null;
}

export function userAvatarUrl(phone: string, version?: number | null): string {
  const params = new URLSearchParams({ phone });
  if (version) params.set("v", String(version));
  return `/api/messenger/avatar?${params.toString()}`;
}

export function roomAvatarUrl(roomId: string, version?: number | null): string {
  const params = new URLSearchParams({ roomId: roomId.toUpperCase() });
  if (version) params.set("v", String(version));
  return `/api/messenger/avatar?${params.toString()}`;
}

export function truncateQuote(text: string, max = 80): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function messagePreview(plain: {
  text?: string;
  filename?: string;
  mime?: string;
  type?: string;
  durationMs?: number;
}): string {
  if (plain.text) return plain.text;
  if (plain.type === "audio" || plain.mime?.startsWith("audio/")) return "Голосовое сообщение";
  if (plain.type === "video" || plain.mime?.startsWith("video/")) return "Видео";
  if (plain.mime?.startsWith("image/")) return "Фото";
  if (plain.filename) return plain.filename;
  return "Вложение";
}
