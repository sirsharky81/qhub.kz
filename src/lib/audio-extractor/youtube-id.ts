export function extractYoutubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "");

    if (host === "youtu.be") {
      const id = parsed.pathname.replace(/^\//, "").split("/")[0];
      return id || null;
    }

    if (host.includes("youtube.com")) {
      const v = parsed.searchParams.get("v");
      if (v) return v;
      const shorts = parsed.pathname.match(/\/shorts\/([^/?]+)/);
      if (shorts?.[1]) return shorts[1];
    }
  } catch {
    return null;
  }
  return null;
}

export function isYoutubeUrl(url: string): boolean {
  return extractYoutubeVideoId(url) !== null;
}
