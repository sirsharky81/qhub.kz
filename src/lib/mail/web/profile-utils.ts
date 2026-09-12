import type { MailProfile } from "./profile-store";

export const MAX_MAIL_FULL_NAME_LENGTH = 120;
export const MAX_MAIL_PHONE_LENGTH = 32;
export const MAX_MAIL_SIGNATURE_LENGTH = 2000;

export function formatMailFrom(email: string, fullName?: string): string {
  const trimmed = fullName?.trim();
  if (!trimmed) return email;
  const safe = trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${safe}" <${email}>`;
}

export function effectiveMailSignature(profile: Pick<MailProfile, "fullName" | "phone" | "signature">): string {
  const custom = profile.signature.trim();
  if (custom) return custom;
  const parts = [profile.fullName.trim(), profile.phone.trim()].filter(Boolean);
  return parts.join("\n");
}

export function appendMailSignature(body: string, signature: string): string {
  const sig = signature.trim();
  if (!sig) return body;
  const trimmedBody = body.trimEnd();
  if (trimmedBody.endsWith(sig)) return body;
  return `${trimmedBody}\n\n${sig}`;
}
