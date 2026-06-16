import sharp from "sharp";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "public", "tools", "random-picker");
const svgPath = path.join(outDir, "icon.svg");
const svg = readFileSync(svgPath);

const SIZES = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

async function renderPng(size) {
  return sharp(svg, { density: 384 })
    .resize(size, size, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function renderMaskable(size) {
  const inner = Math.round(size * 0.8);
  const pad = Math.round((size - inner) / 2);
  const icon = await sharp(svg, { density: 384 })
    .resize(inner, inner, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 37, g: 99, b: 235, alpha: 1 },
    },
  })
    .composite([{ input: icon, top: pad, left: pad }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function main() {
  await mkdir(outDir, { recursive: true });

  for (const { name, size } of SIZES) {
    const out = path.join(outDir, name);
    await renderPng(size).then((buf) => sharp(buf).toFile(out));
    console.log(`Wrote ${name} (${size}x${size})`);
  }

  const maskable = path.join(outDir, "icon-512-maskable.png");
  await renderMaskable(512).then((buf) => sharp(buf).toFile(maskable));
  console.log("Wrote icon-512-maskable.png (512x512)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
