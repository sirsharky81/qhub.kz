export type UserErrorCode =
  | "corrupted"
  | "unsupported"
  | "too-large"
  | "out-of-memory"
  | "no-space"
  | "browser-unsupported"
  | "conversion-failed"
  | "drm"
  | "cancelled";

const MESSAGES: Record<UserErrorCode, string> = {
  corrupted: "Файл повреждён или не читается.",
  unsupported: "Формат не поддерживается.",
  "too-large": "Размер файла слишком большой для обработки на этом устройстве.",
  "out-of-memory": "Недостаточно памяти устройства. Попробуйте файл меньшего размера.",
  "no-space": "Недостаточно свободного места для сохранения результата.",
  "browser-unsupported": "Браузер не поддерживает данный формат.",
  "conversion-failed": "Конвертация невозможна для данного файла.",
  drm: "Файл защищён DRM — обработка невозможна.",
  cancelled: "Операция отменена.",
};

export class ConverterError extends Error {
  code: UserErrorCode;

  constructor(code: UserErrorCode, detail?: string) {
    super(MESSAGES[code]);
    this.name = "ConverterError";
    this.code = code;
    if (detail) {
      console.warn("[file-converter]", code, detail);
    }
  }
}

export function mapErrorToUserMessage(err: unknown): string {
  if (err instanceof ConverterError) return err.message;
  if (err instanceof DOMException && err.name === "AbortError") {
    return MESSAGES.cancelled;
  }
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (msg.includes("memory") || msg.includes("allocation")) return MESSAGES["out-of-memory"];
  if (msg.includes("quota") || msg.includes("space")) return MESSAGES["no-space"];
  if (msg.includes("heic") || msg.includes("decode")) return MESSAGES["browser-unsupported"];
  if (msg.includes("invalid") || msg.includes("corrupt")) return MESSAGES.corrupted;
  return MESSAGES["conversion-failed"];
}
