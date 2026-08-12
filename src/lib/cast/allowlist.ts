export class CastAllowlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CastAllowlistError";
  }
}

function isPrivateIpv4(a: number, b: number, c: number): boolean {
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  return false;
}

function parseIpv4(hostname: string): [number, number, number, number] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums as [number, number, number, number];
}

export function assertPublicHttpsUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new CastAllowlistError("Некорректная ссылка");
  }

  if (url.protocol !== "https:") {
    throw new CastAllowlistError("Разрешены только HTTPS-ссылки");
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "[::1]" ||
    hostname === "::1"
  ) {
    throw new CastAllowlistError("Локальные адреса запрещены");
  }

  const ipv4 = parseIpv4(hostname);
  if (ipv4 && isPrivateIpv4(ipv4[0], ipv4[1], ipv4[2])) {
    throw new CastAllowlistError("Приватные IP-адреса запрещены");
  }

  if (hostname.startsWith("fe80:") || hostname.startsWith("fc") || hostname.startsWith("fd")) {
    throw new CastAllowlistError("Локальные IPv6-адреса запрещены");
  }

  return url;
}
