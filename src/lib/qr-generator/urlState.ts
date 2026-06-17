import type { QrFormData, QrSettings, QrType } from "./types";
import { emptyForm } from "./qrUtils";

export function serializeToUrl(form: QrFormData, settings: Partial<QrSettings>): string {
  const params = new URLSearchParams();
  params.set("type", form.type);
  params.set("data", btoa(encodeURIComponent(JSON.stringify(form.data))));
  if (settings.size) params.set("size", String(settings.size));
  if (settings.foreground) params.set("fg", settings.foreground.replace("#", ""));
  if (settings.background) params.set("bg", settings.background.replace("#", ""));
  if (settings.errorCorrectionLevel) params.set("ecc", settings.errorCorrectionLevel);
  return params.toString();
}

export function parseFromUrl(search: string): {
  form: QrFormData | null;
  settings: Partial<QrSettings>;
} {
  const params = new URLSearchParams(search);
  const type = params.get("type") as QrType | null;
  const dataB64 = params.get("data");
  if (!type || !dataB64) return { form: null, settings: {} };

  try {
    const data = JSON.parse(decodeURIComponent(atob(dataB64)));
    const form = { type, data } as QrFormData;
    const settings: Partial<QrSettings> = {};
    const size = params.get("size");
    if (size) settings.size = parseInt(size, 10);
    const fg = params.get("fg");
    if (fg) settings.foreground = `#${fg}`;
    const bg = params.get("bg");
    if (bg) settings.background = `#${bg}`;
    const ecc = params.get("ecc");
    if (ecc && ["L", "M", "Q", "H"].includes(ecc)) {
      settings.errorCorrectionLevel = ecc as QrSettings["errorCorrectionLevel"];
    }
    return { form, settings };
  } catch {
    return { form: emptyForm(type), settings: {} };
  }
}

export function buildShareUrl(form: QrFormData, settings: QrSettings, basePath: string): string {
  const qs = serializeToUrl(form, settings);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://qhub.kz";
  return `${origin}${basePath}?${qs}`;
}
