import { hashPassword, verifyPassword } from "@/lib/admin/password";
import {
  MAX_PIN_ATTEMPTS,
  PIN_LENGTH,
  PIN_LOCKOUT_MS,
} from "./constants";
import type { MessengerAuthRecord } from "./types";
import { getAuthRecord, saveAuthRecord } from "./store";

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export async function loginWithPin(
  phone: string,
  pin: string,
): Promise<{ ok: true; mustChangePin: boolean } | { ok: false; error: string; lockedUntil?: number }> {
  if (!isValidPin(pin)) {
    return { ok: false, error: "PIN должен состоять из 4 цифр" };
  }

  let record = await getAuthRecord(phone);
  if (!record) {
    record = {
      phone,
      pinHash: null,
      pinSetAt: null,
      mustChangePin: false,
      failedAttempts: 0,
      lockedUntil: null,
    };
  }

  if (record.lockedUntil && record.lockedUntil > Date.now()) {
    return {
      ok: false,
      error: "Слишком много попыток. Попробуйте позже.",
      lockedUntil: record.lockedUntil,
    };
  }

  if (!record.pinHash) {
    return { ok: false, error: "PIN не установлен" };
  }

  const valid = await verifyPassword(pin, record.pinHash);
  if (!valid) {
    record.failedAttempts += 1;
    if (record.failedAttempts >= MAX_PIN_ATTEMPTS) {
      record.lockedUntil = Date.now() + PIN_LOCKOUT_MS;
      record.failedAttempts = 0;
    }
    await saveAuthRecord(record);
    return { ok: false, error: "Неверный PIN" };
  }

  record.failedAttempts = 0;
  record.lockedUntil = null;
  await saveAuthRecord(record);
  return { ok: true, mustChangePin: record.mustChangePin };
}

export async function setPin(
  phone: string,
  pin: string,
  confirmPin?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidPin(pin)) {
    return { ok: false, error: "PIN должен состоять из 4 цифр" };
  }
  if (confirmPin !== undefined && pin !== confirmPin) {
    return { ok: false, error: "PIN не совпадает" };
  }

  const pinHash = await hashPassword(pin);
  const record: MessengerAuthRecord = {
    phone,
    pinHash,
    pinSetAt: Date.now(),
    mustChangePin: false,
    failedAttempts: 0,
    lockedUntil: null,
  };
  await saveAuthRecord(record);
  return { ok: true };
}

export async function getPinStatus(phone: string): Promise<{
  passwordSet: boolean;
  mustChangePin: boolean;
  lockedUntil: number | null;
}> {
  const record = await getAuthRecord(phone);
  return {
    passwordSet: !!record?.pinHash,
    mustChangePin: record?.mustChangePin ?? false,
    lockedUntil: record?.lockedUntil ?? null,
  };
}
