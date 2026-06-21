/** True on localhost / LAN dev (audio-extractor and devOnly apps stay available). */
export function isLocalDevHost(host: string | null | undefined): boolean {
  if (!host) return process.env.NODE_ENV === "development";
  const h = host.split(":")[0].toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.startsWith("192.168.") ||
    h.startsWith("10.") ||
    h.endsWith(".local")
  );
}

/** Hide devOnly apps when not on local dev (production / qhub.kz). */
export function shouldHideDevOnlyApps(host: string | null | undefined): boolean {
  return !isLocalDevHost(host);
}
