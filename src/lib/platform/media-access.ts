import { isNativePlatform } from "./runtime";

/** Call before getUserMedia on Capacitor — ensures the user sees the system permission dialog. */
export async function ensureMediaPermissions(options: {
  video?: boolean;
  audio?: boolean;
}): Promise<void> {
  if (!isNativePlatform()) return;

  const needs: Array<"camera" | "microphone"> = [];
  if (options.video) needs.push("camera");
  if (options.audio) needs.push("microphone");

  if (needs.length === 0) return;

  const { PlatformPermissions } = await import("./permissions");
  for (const type of needs) {
    const status = await PlatformPermissions.check(type);
    if (status !== "granted") {
      const result = await PlatformPermissions.request(type);
      if (result !== "granted") {
        throw new Error("permission_denied");
      }
    }
  }
}

export function mediaPermissionErrorMessage(): string {
  if (isNativePlatform()) {
    return "Не удалось открыть камеру. Разрешите доступ в настройках телефона: Приложения → QHub → Разрешения → Камера.";
  }
  return "Не удалось открыть камеру. Разрешите доступ или выберите фото из галереи.";
}
