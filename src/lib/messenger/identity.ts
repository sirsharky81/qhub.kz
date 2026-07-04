import { normalizeKzPhone } from "./phone";

const IDENTITY_PINS_KEY = "qhub_messenger_identity_pins_v1";

type IdentityPin = { fingerprint: string; updatedAt: number };
type IdentityPinMap = Record<string, IdentityPin>;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function loadIdentityPinMap(): IdentityPinMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(IDENTITY_PINS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as IdentityPinMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveIdentityPinMap(map: IdentityPinMap): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(IDENTITY_PINS_KEY, JSON.stringify(map));
}

export async function fingerprintPublicKeyJwk(publicKeyJwk: string): Promise<string> {
  const parsed = JSON.parse(publicKeyJwk) as unknown;
  const canonical = stableStringify(parsed);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return toBase64Url(new Uint8Array(digest));
}

export function trustPeerIdentity(phone: string, fingerprint: string): void {
  const map = loadIdentityPinMap();
  map[normalizeKzPhone(phone)] = { fingerprint, updatedAt: Date.now() };
  saveIdentityPinMap(map);
}

export function checkPeerIdentity(
  phone: string,
  fingerprint: string,
): { status: "first_seen" | "match" | "changed"; previousFingerprint: string | null } {
  const map = loadIdentityPinMap();
  const key = normalizeKzPhone(phone);
  const prev = map[key];
  if (!prev?.fingerprint) {
    map[key] = { fingerprint, updatedAt: Date.now() };
    saveIdentityPinMap(map);
    return { status: "first_seen", previousFingerprint: null };
  }
  if (prev.fingerprint === fingerprint) {
    return { status: "match", previousFingerprint: prev.fingerprint };
  }
  return { status: "changed", previousFingerprint: prev.fingerprint };
}

export function shortFingerprint(fingerprint: string): string {
  return `${fingerprint.slice(0, 10)}…${fingerprint.slice(-6)}`;
}
