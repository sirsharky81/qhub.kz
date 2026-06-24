export async function readBatteryLevel(): Promise<number | null> {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<{ level: number; charging: boolean }>;
  };
  if (!nav.getBattery) return null;
  try {
    const battery = await nav.getBattery();
    return Math.round(battery.level * 100);
  } catch {
    return null;
  }
}

export function subscribeBattery(onChange: (level: number | null) => void): () => void {
  if (typeof navigator === "undefined") return () => {};
  const nav = navigator as Navigator & {
    getBattery?: () => Promise<{ level: number; addEventListener: (e: string, fn: () => void) => void; removeEventListener: (e: string, fn: () => void) => void }>;
  };
  if (!nav.getBattery) return () => {};

  let battery: { level: number; addEventListener: (e: string, fn: () => void) => void; removeEventListener: (e: string, fn: () => void) => void } | null = null;
  const handler = () => onChange(battery ? Math.round(battery.level * 100) : null);

  void nav.getBattery().then((b) => {
    battery = b;
    onChange(Math.round(b.level * 100));
    b.addEventListener("levelchange", handler);
  });

  return () => {
    battery?.removeEventListener("levelchange", handler);
  };
}
