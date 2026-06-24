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

export function senderColorClass(phone: string): string {
  let hash = 0;
  for (let i = 0; i < phone.length; i++) {
    hash = (hash * 31 + phone.charCodeAt(i)) >>> 0;
  }
  return SENDER_COLORS[hash % SENDER_COLORS.length];
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
}): string {
  if (plain.text) return plain.text;
  if (plain.mime?.startsWith("image/")) return "Фото";
  if (plain.filename) return plain.filename;
  return "Вложение";
}
