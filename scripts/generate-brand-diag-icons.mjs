import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function star(cx, cy, outer, inner = outer * 0.42) {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const ang = -Math.PI / 2 + i * (Math.PI / 5);
    const rad = i % 2 === 0 ? outer : inner;
    pts.push(`${(cx + Math.cos(ang) * rad).toFixed(2)},${(cy + Math.sin(ang) * rad).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="#F4F7FB"/>`;
}

function subaruSvg() {
  const stars = [
    [96, 58, 18],
    [132, 74, 11],
    [146, 112, 9.5],
    [112, 142, 12],
    [70, 136, 9],
    [54, 98, 11],
  ]
    .map(([x, y, r]) => star(x, y, r))
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="42" fill="#0B2A4A"/>
  <circle cx="96" cy="100" r="62" fill="none" stroke="#D6DEE8" stroke-width="3"/>
  ${stars}
</svg>`;
}

function diamond(cx, cy, s) {
  return `<polygon points="${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}" fill="#E60012"/>`;
}

function mitsubishiSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="42" fill="#141414"/>
  ${diamond(96, 68, 28)}
  ${diamond(68, 112, 28)}
  ${diamond(124, 112, 28)}
</svg>`;
}

function corner(x, y, hx, hy) {
  return `<path d="M${x + hx},${y} H${x} V${y + hy}" fill="none" stroke="#F4F7FB" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function etacsSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="42" fill="#141414"/>
  ${corner(44, 44, 28, 28)}
  ${corner(148, 44, -28, 28)}
  ${corner(44, 148, 28, -28)}
  ${corner(148, 148, -28, -28)}
  ${diamond(96, 72, 18)}
  ${diamond(74, 110, 18)}
  ${diamond(118, 110, 18)}
</svg>`;
}

const targets = [
  { svg: subaruSvg(), dir: "public/tools/obd-diag" },
  { svg: mitsubishiSvg(), dir: "public/tools/mitsubishi-diag" },
  { svg: etacsSvg(), dir: "public/tools/etacs-coding" },
];

const sizes = [
  ["icon-512.png", 512],
  ["icon-192.png", 192],
  ["apple-touch-icon.png", 180],
];

for (const target of targets) {
  for (const [name, size] of sizes) {
    const out = path.join(root, target.dir, name);
    await sharp(Buffer.from(target.svg)).resize(size, size).png().toFile(out);
    console.log(path.relative(root, out));
  }
}
