/** Bluefy and CoreBluetooth often reject with a bare number instead of an Error. */

const USER_CANCEL =
  "Выбор адаптера отменён. Нажмите кнопку 1 и выберите vLinker в списке.";

export function isBluefyBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /bluefy/i.test(navigator.userAgent);
}

export function looksLikeObdAdapterName(name: string | undefined): boolean {
  if (!name) return false;
  const normalized = name.toLowerCase();
  return ["vlink", "obd", "elm", "veepeak", "vgate", "icar"].some((part) => normalized.includes(part));
}

export function isBleUserCancel(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { name?: unknown; message?: unknown };
  const name = typeof record.name === "string" ? record.name : "";
  if (name === "AbortError" || name === "NotFoundError") return true;
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  return message.includes("cancel") || message.includes("отмен");
}

/** True when the rejection is a numeric BLE status (Bluefy), not a user-facing Error. */
export function isNumericBleFailure(error: unknown): boolean {
  if (typeof error === "number" && Number.isFinite(error)) return true;
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message.trim() : "";
  if (typeof record.code === "number" && (message === "" || /^\d+$/.test(message))) return true;
  return /^\d+$/.test(message);
}

export function formatBleFailure(error: unknown): string {
  if (isBleUserCancel(error)) return USER_CANCEL;
  const code = bleFailureCode(error);
  if (code != null) return bleCodeMessage(code);
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  const text = typeof error === "string" ? error.trim() : "";
  return text || "Не удалось подключить Bluetooth-адаптер";
}

/**
 * vLinker FFF2 is write-without-response. Bluefy/CoreBluetooth rejects write-with-response
 * with a numeric status, which used to leave the session in "idle".
 */
export function preferWriteWithoutResponse(
  properties: { write?: boolean; writeWithoutResponse?: boolean } | undefined,
  bluefy: boolean,
): boolean {
  if (properties?.writeWithoutResponse && (bluefy || !properties.write)) return true;
  if (!properties && bluefy) return true;
  return false;
}

function bleFailureCode(error: unknown): number | null {
  if (typeof error === "number" && Number.isFinite(error)) return error;
  if (typeof error === "string" && /^\d+$/.test(error.trim())) return Number(error.trim());
  if (!error || typeof error !== "object") return null;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message.trim() : "";
  if (/^\d+$/.test(message)) return Number(message);
  if (typeof record.code === "number" && Number.isFinite(record.code) && message === "") {
    return record.code;
  }
  return null;
}

function bleCodeMessage(code: number): string {
  switch (code) {
    case 2:
      return (
        "Канал адаптера не открылся (код 2). Кнопка «Подключиться к автомобилю» включается только после кнопки 1 на этой странице. " +
        "Выберите vLinker в списке. Если он уже подключён в меню Bluefy — отключите его там и нажмите кнопку 1 снова."
      );
    case 3:
      return "Адаптер не подключён (код 3). Нажмите кнопку 1 и выберите vLinker.";
    case 5:
      return USER_CANCEL;
    case 6:
      return "Таймаут Bluetooth (код 6). Подойдите ближе к адаптеру и нажмите кнопку 1 снова.";
    case 8:
      return "Браузер не разрешил сервис адаптера (код 8). Нажмите кнопку 1 и подтвердите доступ к BLE.";
    case 10:
      return "Не удалось связаться с адаптером (код 10). Подойдите ближе, режим BLE, и нажмите кнопку 1 снова.";
    default:
      return `Ошибка Bluetooth (код ${code}). Нажмите кнопку 1 и выберите vLinker в списке страницы.`;
  }
}
