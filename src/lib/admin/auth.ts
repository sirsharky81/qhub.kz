import { timingSafeEqual } from "node:crypto";
import { getAdminEmail, verifySessionToken } from "./session";
import { getPasswordHash, setPasswordHash } from "./store";
import { hashPassword, verifyPassword } from "./password";

export function emailsEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a.toLowerCase());
  const bb = Buffer.from(b.toLowerCase());
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

export async function verifyAdminCredentials(
  email: string,
  password: string,
): Promise<boolean> {
  if (!emailsEqual(email.trim(), getAdminEmail())) return false;
  const hash = await getPasswordHash();
  return verifyPassword(password, hash);
}

export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  if (newPassword.length < 8) {
    return { ok: false, error: "Новый пароль должен быть не короче 8 символов" };
  }
  const hash = await getPasswordHash();
  if (!(await verifyPassword(currentPassword, hash))) {
    return { ok: false, error: "Текущий пароль неверный" };
  }
  await setPasswordHash(await hashPassword(newPassword));
  return { ok: true };
}

export { verifySessionToken };
