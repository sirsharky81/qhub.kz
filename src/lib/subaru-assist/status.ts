export const ASSIST_SERVICES = ["celsius", "key", "res"] as const;
export type AssistService = (typeof ASSIST_SERVICES)[number];

export const ASSIST_STATUS_TEXT = {
  meter_read: "Считывание приборки",
  meter_ok: "Приборка считана",
  meter_fail: "Приборку считать не удалось",
  eyesight_read: "Считывание EyeSight",
  eyesight_ok: "EyeSight считан",
  eyesight_fail: "EyeSight считать не удалось",
  write_start: "Идёт запись. Не отключайте зажигание и vLinker",
  write_ok: "Записано",
  write_fail: "Запись не удалась. Зажигание и vLinker не отключайте, дождитесь мастера",
  clear_start: "Сброс ошибок. Не отключайте зажигание и vLinker",
  clear_ok: "Ошибки очищены",
  clear_fail: "Сбросить ошибки не удалось",
  key_present: "Поднесите новый ключ к кнопке START",
  key_step: "Идёт прописка ключа. Не отключайте зажигание и vLinker",
  key_ok: "Шаг прописки ключа выполнен",
  key_fail: "Прописка ключа не удалась. Не отключайте зажигание и vLinker",
  res_step: "Идёт прописка RES. Не отключайте зажигание и vLinker",
  res_ok: "RES прописан",
  res_fail: "Прописка RES не удалась. Не отключайте зажигание и vLinker",
  link_lost: "Связь прервана. Не выключайте зажигание",
  adapter_online: "vLinker подключён. Ожидайте мастера",
  ignition_on: "Зажигание включено",
} as const;

export type AssistStatusCode = keyof typeof ASSIST_STATUS_TEXT;

export const ASSIST_STATUS_CODES = Object.keys(ASSIST_STATUS_TEXT) as AssistStatusCode[];

const WARN_CODES = new Set<AssistStatusCode>([
  "write_start",
  "write_fail",
  "clear_start",
  "clear_fail",
  "key_present",
  "key_step",
  "key_fail",
  "res_step",
  "res_fail",
  "link_lost",
]);

export function isAssistService(value: string): value is AssistService {
  return (ASSIST_SERVICES as readonly string[]).includes(value);
}

export function isAssistStatusCode(value: string): value is AssistStatusCode {
  return Object.prototype.hasOwnProperty.call(ASSIST_STATUS_TEXT, value);
}

export function assistStatusText(code: AssistStatusCode): string {
  return ASSIST_STATUS_TEXT[code];
}

export function assistStatusTone(code: AssistStatusCode): "warn" | "ok" | "info" {
  if (WARN_CODES.has(code)) return "warn";
  if (
    code === "meter_ok" ||
    code === "eyesight_ok" ||
    code === "write_ok" ||
    code === "clear_ok" ||
    code === "key_ok" ||
    code === "res_ok" ||
    code === "adapter_online"
  ) {
    return "ok";
  }
  return "info";
}

export function assistServiceLabel(service: AssistService): string {
  if (service === "celsius") return "Перевод градусов";
  if (service === "key") return "Прописка ключа";
  return "Прописка RES";
}
