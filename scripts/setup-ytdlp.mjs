import { chmodSync, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { get } from "node:https";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const binDir = join(root, "bin");

function download(url, dest) {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const file = createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve()));
      file.on("error", reject);
    }).on("error", reject);
  });
}

async function main() {
  mkdirSync(binDir, { recursive: true });

  const isWin = process.platform === "win32";
  const filename = isWin ? "yt-dlp.exe" : "yt-dlp";
  const dest = join(binDir, filename);

  const forceOnVercel = process.env.VERCEL === "1";

  if (existsSync(dest) && !forceOnVercel) {
    console.log("[setup-ytdlp] already present:", dest);
    return;
  }

  const url = isWin
    ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

  console.log("[setup-ytdlp] downloading", url);
  await download(url, dest);
  if (!isWin) {
    try {
      chmodSync(dest, 0o755);
    } catch {
      /* ignore */
    }
  }
  console.log("[setup-ytdlp] saved to", dest);
}

main().catch((err) => {
  console.error("[setup-ytdlp] failed:", err.message);
  process.exit(1);
});
