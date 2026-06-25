import { normalizeE164 } from "@/lib/qr-generator/qrUtils";

/** Normalize to Kazakhstan +7XXXXXXXXXX (11 digits after +). */
export function normalizeKzPhone(input: string): string {
  const cleaned = input.replace(/[\s()-]/g, "");
  if (cleaned.startsWith("+7")) return `+7${cleaned.slice(2).replace(/\D/g, "").slice(0, 10)}`;
  if (cleaned.startsWith("8") && cleaned.length >= 11) {
    return `+7${cleaned.slice(1).replace(/\D/g, "").slice(0, 10)}`;
  }
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  return normalizeE164(input);
}

export function isValidKzPhone(phone: string): boolean {
  const n = normalizeKzPhone(phone);
  return /^\+7\d{10}$/.test(n);
}

export function maskPhone(phone: string): string {
  const n = normalizeKzPhone(phone);
  const m = n.match(/^\+7(\d{10})$/);
  if (!m) return n;
  const digits = m[1];
  return `+7${digits.slice(0, 3)}XXXX${digits.slice(-3)}`;
}

export function deriveDmChatId(phoneA: string, phoneB: string): string {
  const sorted = [normalizeKzPhone(phoneA), normalizeKzPhone(phoneB)].sort();
  return `dm:${sorted[0]}:${sorted[1]}`;
}

export function peerFromDmChannel(channel: string, myPhone: string): string | null {
  if (!channel.startsWith("dm:")) return null;
  const parts = channel.split(":");
  if (parts.length !== 3) return null;
  const me = normalizeKzPhone(myPhone);
  const a = normalizeKzPhone(parts[1]);
  const b = normalizeKzPhone(parts[2]);
  if (a === me) return b;
  if (b === me) return a;
  return null;
}
