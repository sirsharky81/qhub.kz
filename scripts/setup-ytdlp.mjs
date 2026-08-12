import { chmodSync, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { get } from "node:https";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const binDir = join(root, "bin");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function download(url, dest) {
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

async function downloadWithRetry(url, dest, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await download(url, dest);
      return;
    } catch (err) {
      lastErr = err;
      const delayMs = 2000 * 2 ** i;
      console.warn(
        `[setup-ytdlp] attempt ${i + 1}/${attempts} failed:`,
        err instanceof Error ? err.message : err,
      );
      if (i < attempts - 1) await sleep(delayMs);
    }
  }
  throw lastErr;
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
  await downloadWithRetry(url, dest);
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
  // If a previous deploy left a working binary, keep install alive (CI/VPS flakiness).
  const isWin = process.platform === "win32";
  const dest = join(binDir, isWin ? "yt-dlp.exe" : "yt-dlp");
  if (existsSync(dest)) {
    console.warn("[setup-ytdlp] using existing binary at", dest);
    return;
  }
  process.exit(1);
});
