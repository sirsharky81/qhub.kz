import type { QrFormData, QrHistoryEntry, QrSettings, QrTemplate } from "./types";
import { shouldSaveToHistory } from "./sensitiveDataGuard";
import { getFormLabel } from "./qrUtils";

const HISTORY_KEY = "qhub-qr-history";
const TEMPLATES_KEY = "qhub-qr-templates";
const MAX_HISTORY = 20;

export function loadHistory(): QrHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QrHistoryEntry[];
  } catch {
    return [];
  }
}

const TYPING_WINDOW_MS = 60_000;

function isSameTypingSession(a: string, b: string): boolean {
  return a.startsWith(b) || b.startsWith(a);
}

export function saveHistoryEntry(
  form: QrFormData,
  payload: string,
  settings: QrSettings,
): void {
  if (!shouldSaveToHistory(form) || !payload.trim()) return;

  const now = Date.now();
  const entry: QrHistoryEntry = {
    id: crypto.randomUUID(),
    type: form.type,
    label: getFormLabel(form),
    payload,
    formSnapshot: form,
    settings: { ...settings },
    createdAt: now,
  };

  const prev = loadHistory();
  const [latest, ...rest] = prev;

  if (
    latest &&
    latest.type === form.type &&
    now - latest.createdAt < TYPING_WINDOW_MS &&
    isSameTypingSession(payload, latest.payload)
  ) {
    const updated: QrHistoryEntry = {
      ...entry,
      id: latest.id,
      createdAt: latest.createdAt,
    };
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([updated, ...rest].slice(0, MAX_HISTORY)),
    );
    return;
  }

  const dupIdx = prev.findIndex((h) => h.payload === payload);
  if (dupIdx !== -1) {
    const existing = prev[dupIdx];
    const updated: QrHistoryEntry = {
      ...entry,
      id: existing.id,
      createdAt: existing.createdAt,
    };
    const without = prev.filter((_, i) => i !== dupIdx);
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([updated, ...without].slice(0, MAX_HISTORY)),
    );
    return;
  }

  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify([entry, ...prev].slice(0, MAX_HISTORY)),
  );
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}

export function loadTemplates(): QrTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QrTemplate[];
  } catch {
    return [];
  }
}

export function saveTemplate(
  name: string,
  form: QrFormData,
  settings: Partial<QrSettings>,
): QrTemplate {
  const template: QrTemplate = {
    id: crypto.randomUUID(),
    name,
    type: form.type,
    formSnapshot: form,
    settings,
    createdAt: Date.now(),
  };
  const prev = loadTemplates();
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify([template, ...prev]));
  return template;
}

export function deleteTemplate(id: string): void {
  const next = loadTemplates().filter((t) => t.id !== id);
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
}
