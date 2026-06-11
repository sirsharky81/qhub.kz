import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");

const SOURCE = process.argv[2] ?? path.join(root, "public", "icon-master.png");

const SIZES = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

/** Pixels at or below this RGB value become transparent (black letterbox). */
const BLACK_THRESHOLD = 18;

async function loadWithTransparency(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (r <= BLACK_THRESHOLD && g <= BLACK_THRESHOLD && b <= BLACK_THRESHOLD) {
        data[i + 3] = 0;
        continue;
      }

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  const contentWidth = maxX - minX + 1;
  const contentHeight = maxY - minY + 1;
  const square = Math.max(contentWidth, contentHeight);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const left = Math.round(centerX - square / 2);
  const top = Math.round(centerY - square / 2);

  return sharp(data, { raw: { width, height, channels } })
    .extract({
      left: Math.max(0, left),
      top: Math.max(0, top),
      width: Math.min(square, width - Math.max(0, left)),
      height: Math.min(square, height - Math.max(0, top)),
    })
    .png();
}

async function main() {
  await mkdir(publicDir, { recursive: true });

  const master = await loadWithTransparency(SOURCE);
  const masterPath = path.join(publicDir, "icon-master.png");
  await master.clone().resize(1024, 1024).png().toFile(masterPath);

  for (const { name, size } of SIZES) {
    const out = path.join(publicDir, name);
    await master
      .clone()
      .resize(size, size, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(out);
    console.log(`Wrote ${name} (${size}x${size})`);
  }

  console.log(`Master saved to ${masterPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
