import { writeFileSync } from "node:fs";
import sharp from "sharp";

const NAVY = "#09203F";

/** Six-point star. rx/ry stretch the horizontal points the way the badge does. */
function star6(cx, cy, rx, ry, inner = 0.4) {
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const ang = (i * Math.PI) / 6;
    const k = i % 2 === 0 ? 1 : inner;
    pts.push(`${(cx + Math.cos(ang) * rx * k).toFixed(2)},${(cy + Math.sin(ang) * ry * k).toFixed(2)}`);
  }
  return pts.join(" ");
}

/**
 * Wide chrome oval on a full-bleed navy field.
 * One large star on the left, five smaller stars grouped to the right.
 * Positions follow the badge the user supplied.
 */
function subaruSvg(size) {
  const s = size;
  const cx = s * 0.5;
  const cy = s * 0.5;
  const orx = s * 0.47;
  const ory = s * 0.262;
  const irx = s * 0.414;
  const iry = s * 0.21;
  // [nx, ny] offsets and [rw, rh] radii, in units of the inner oval.
  // Large star is wide; the other five sit in a bunch to its right.
  const stars = [
    [-0.34, 0.0, 0.58, 0.58],
    [0.12, -0.38, 0.19, 0.32],
    [0.52, -0.22, 0.16, 0.28],
    [0.76, 0.18, 0.1, 0.2],
    [0.26, 0.28, 0.15, 0.28],
    [-0.02, 0.52, 0.16, 0.3],
  ];
  const starSvg = stars
    .map(([nx, ny, rw, rh]) => {
      const x = cx + nx * irx;
      const y = cy + ny * iry;
      return `<polygon fill="url(#star)" points="${star6(x, y, rw * irx, rh * iry)}"/>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="metal" x1="0.15" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#f7f8fa"/>
      <stop offset="0.42" stop-color="#d5dae0"/>
      <stop offset="0.72" stop-color="#aeb6bf"/>
      <stop offset="1" stop-color="#7d868f"/>
    </linearGradient>
    <linearGradient id="blue" x1="0.5" y1="0" x2="0.5" y2="1">
      <stop offset="0" stop-color="#3c86d4"/>
      <stop offset="0.28" stop-color="#1a62b5"/>
      <stop offset="0.62" stop-color="#0c4b96"/>
      <stop offset="1" stop-color="#06336f"/>
    </linearGradient>
    <linearGradient id="star" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.45" stop-color="#f3f5f7"/>
      <stop offset="1" stop-color="#c5ccd3"/>
    </linearGradient>
    <radialGradient id="gloss" cx="0.5" cy="0.22" r="0.55">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.42"/>
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="inner">
      <ellipse cx="${cx}" cy="${cy}" rx="${irx}" ry="${iry}"/>
    </clipPath>
  </defs>
  <rect width="${s}" height="${s}" fill="${NAVY}"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${orx}" ry="${ory}" fill="url(#metal)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${irx}" ry="${iry}" fill="url(#blue)"/>
  <g clip-path="url(#inner)">
    <ellipse cx="${cx}" cy="${cy - iry * 0.35}" rx="${irx * 0.92}" ry="${iry * 0.55}" fill="url(#gloss)"/>
  </g>
  ${starSvg}
</svg>`;
}

async function writeSizes(dir) {
  for (const size of [512, 192, 180]) {
    const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
    const png = await sharp(Buffer.from(subaruSvg(size))).png().toBuffer();
    writeFileSync(`${dir}/${name}`, png);
  }
}

async function flatten(dir, background) {
  for (const name of ["icon-512.png", "icon-192.png", "apple-touch-icon.png"]) {
    const file = `${dir}/${name}`;
    const png = await sharp(file).flatten({ background }).png().toBuffer();
    writeFileSync(file, png);
  }
}

await writeSizes("public/tools/obd-diag");
await writeSizes("public/tools/subaru-coding");
await flatten("public/tools/mitsubishi-diag", "#141414");
await flatten("public/tools/etacs-coding", "#141414");
console.log("icons written");
