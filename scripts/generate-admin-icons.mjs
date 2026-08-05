import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "qhub-ctrl-7k2m");
const source = path.join(outDir, "icon.svg");

const SIZES = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

async function main() {
  await mkdir(outDir, { recursive: true });
  const master = sharp(source).resize(512, 512);

  for (const { name, size } of SIZES) {
    const out = path.join(outDir, name);
    await master
      .clone()
      .resize(size, size, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(out);
    console.log(`Wrote ${name} (${size}x${size})`);
  }

  const maskable = path.join(outDir, "icon-512-maskable.png");
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 30, g: 41, b: 59, alpha: 1 },
    },
  })
    .composite([{ input: await master.clone().resize(384, 384).png().toBuffer(), gravity: "center" }])
    .png()
    .toFile(maskable);
  console.log("Wrote icon-512-maskable.png (512x512)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
