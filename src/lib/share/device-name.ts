export async function getDeviceName(): Promise<string> {
  if (typeof navigator === "undefined") return "Устройство";

  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string; brands?: { brand: string }[] } })
    .userAgentData;
  if (uaData?.platform) {
    const brand = uaData.brands?.[0]?.brand;
    return brand ? `${brand} (${uaData.platform})` : uaData.platform;
  }

  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac OS X/i.test(ua)) return "macOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "Браузер";
}
