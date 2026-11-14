import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const sourceArg = process.argv[2];
const outArg = process.argv[3];

if (!sourceArg || !outArg) {
  console.error("Usage: node generate-tool-pwa-icons.mjs <source-image> <output-dir-under-public>");
  process.exit(1);
}

const sourcePath = path.isAbsolute(sourceArg) ? sourceArg : path.join(root, sourceArg);
const outDir = path.isAbsolute(outArg) ? outArg : path.join(root, "public", outArg.replace(/^public[/\\]/, ""));

const SIZES = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

async function loadSource() {
  return sharp(sourcePath).resize(1024, 1024, {
    fit: "cover",
    position: "centre",
    kernel: sharp.kernel.lanczos3,
  });
}

async function renderPng(source, size) {
  return source
    .clone()
    .resize(size, size, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const source = await loadSource();

  for (const { name, size } of SIZES) {
    const out = path.join(outDir, name);
    await renderPng(source, size).then((buf) => sharp(buf).toFile(out));
    console.log(`Wrote ${path.relative(root, out)} (${size}x${size})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});