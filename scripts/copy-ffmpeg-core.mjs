import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "node_modules", "@ffmpeg", "core", "dist", "umd");
const destDir = join(root, "public", "ffmpeg");

if (!existsSync(srcDir)) {
  console.warn("[copy-ffmpeg-core] @ffmpeg/core not found, skip");
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
for (const file of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  copyFileSync(join(srcDir, file), join(destDir, file));
}
console.log("[copy-ffmpeg-core] UMD core copied to public/ffmpeg/");
