import sharp from "sharp";
import { access } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "public", "tools", "music");
const sourcePath = path.join(outDir, "icon-512.png");

const SIZES = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

async function loadSource() {
  await access(sourcePath);
  return sharp(sourcePath).resize(512, 512, {
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

async function renderMaskable(source, size) {
  const inner = Math.round(size * 0.8);
  const pad = Math.round((size - inner) / 2);
  const icon = await source
    .clone()
    .resize(inner, inner, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 249, g: 250, b: 251, alpha: 1 },
    },
  })
    .composite([{ input: icon, top: pad, left: pad }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const source = await loadSource();

  for (const { name, size } of SIZES) {
    const out = path.join(outDir, name);
    await renderPng(source, size).then((buf) => sharp(buf).toFile(out));
    console.log(`Wrote ${name} (${size}x${size})`);
  }

  const maskable = path.join(outDir, "icon-512-maskable.png");
  await renderMaskable(source, 512).then((buf) => sharp(buf).toFile(maskable));
  console.log("Wrote icon-512-maskable.png (512x512)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
