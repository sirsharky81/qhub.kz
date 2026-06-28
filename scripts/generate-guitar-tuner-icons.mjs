import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "tools", "guitar-tuner");

const SIZES = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

async function renderIcon(size) {
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" rx="${Math.round(size * 0.18)}" fill="#059669"/>
      <circle cx="${size / 2}" cy="${size * 0.42}" r="${size * 0.22}" fill="none" stroke="#ecfdf5" stroke-width="${Math.max(2, size * 0.025)}"/>
      <line x1="${size / 2}" y1="${size * 0.2}" x2="${size / 2}" y2="${size * 0.62}" stroke="#ecfdf5" stroke-width="${Math.max(2, size * 0.02)}"/>
      <text x="50%" y="${size * 0.82}" text-anchor="middle" font-size="${size * 0.18}" fill="#ecfdf5" font-family="Arial,sans-serif">♪</text>
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  await mkdir(outDir, { recursive: true });

  for (const { name, size } of SIZES) {
    const buf = await renderIcon(size);
    await sharp(buf).toFile(path.join(outDir, name));
    console.log(`Wrote ${name}`);
  }

  const maskable = await renderIcon(512);
  await sharp(maskable).toFile(path.join(outDir, "icon-512-maskable.png"));
  console.log("Wrote icon-512-maskable.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
