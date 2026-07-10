import { extractScannableUrl, openUrlInNewTab } from "@/lib/code-scanner/url-utils";
import { isNativePlatform } from "./runtime";

export async function openExternalUrl(raw: string): Promise<boolean> {
  const url = extractScannableUrl(raw);
  if (!url) return false;

  if (isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return true;
  }

  openUrlInNewTab(url);
  return true;
}
