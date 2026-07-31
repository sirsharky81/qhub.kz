export interface SharePendingText {
  title?: string;
  text?: string;
  url?: string;
}

const PENDING_TEXT_KEY = "qhub_share_pending_text";

let pendingFiles: File[] | null = null;

export function stashPendingFiles(files: File[]): void {
  pendingFiles = files;
}

export function takePendingFiles(): File[] | null {
  const files = pendingFiles;
  pendingFiles = null;
  return files?.length ? files : null;
}

export function peekPendingFilesCount(): number {
  return pendingFiles?.length ?? 0;
}

export function stashPendingText(payload: SharePendingText): void {
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(PENDING_TEXT_KEY, JSON.stringify(payload));
  }
}

export function takePendingText(): SharePendingText | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_TEXT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_TEXT_KEY);
    const parsed = JSON.parse(raw) as SharePendingText;
    if (!parsed.title && !parsed.text && !parsed.url) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function peekPendingText(): SharePendingText | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_TEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SharePendingText;
    if (!parsed.title && !parsed.text && !parsed.url) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasPendingSharePayload(): boolean {
  return peekPendingFilesCount() > 0 || Boolean(peekPendingText());
}

export function formatPendingTextAsBody(payload: SharePendingText): string {
  const parts: string[] = [];
  if (payload.title?.trim()) parts.push(payload.title.trim());
  if (payload.text?.trim()) parts.push(payload.text.trim());
  if (payload.url?.trim()) parts.push(payload.url.trim());
  return parts.join("\n\n");
}

export function parseShareTargetParams(input: {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}): SharePendingText | null {
  const payload: SharePendingText = {
    title: input.title?.trim() || undefined,
    text: input.text?.trim() || undefined,
    url: input.url?.trim() || undefined,
  };
  if (!payload.title && !payload.text && !payload.url) return null;
  return payload;
}
