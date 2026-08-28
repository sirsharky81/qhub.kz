/** Extract bare email from "Name <user@host>" or plain address. */
export function normalizeMailAddress(value: string): string {
  const trimmed = value.trim();
  const angle = trimmed.match(/<([^>]+)>/);
  return (angle?.[1] ?? trimmed).trim().toLowerCase();
}

export function isSameMailbox(a: string, b: string): boolean {
  return normalizeMailAddress(a) === normalizeMailAddress(b);
}

export function findSentFolderPath(
  folders: Array<{ path: string; specialUse?: string; label?: string }>,
): string | null {
  const sent = folders.find(
    (f) =>
      f.specialUse === "\\Sent" ||
      f.path === "Sent Items" ||
      f.path === "Sent" ||
      f.label === "Отправленные",
  );
  return sent?.path ?? null;
}
