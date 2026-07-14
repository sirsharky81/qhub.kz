import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";
import { tileIntersectsKz } from "@/lib/kz-maps/tile-bounds";

const FALLBACK_TILE_URL =
  process.env.KZ_MAPS_FALLBACK_TILE_URL?.trim() ||
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

const LOCAL_TILES_DIR = process.env.KZ_MAPS_TILES_DIR?.trim() || "";

function parseTileParam(raw: string): number | null {
  const n = Number.parseInt(raw.replace(/\.png$/i, ""), 10);
  return Number.isFinite(n) ? n : null;
}

async function fetchFallbackTile(z: number, x: number, y: number): Promise<Response | null> {
  const url = FALLBACK_TILE_URL.replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "QHubKZMaps/1.0 (+https://qhub.kz)" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") || "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z: zRaw, x: xRaw, y: yRaw } = await context.params;
  const z = parseTileParam(zRaw);
  const x = parseTileParam(xRaw);
  const y = parseTileParam(yRaw);

  if (z == null || x == null || y == null || z < 0 || z > 18) {
    return new Response("Bad tile", { status: 400 });
  }

  if (LOCAL_TILES_DIR) {
    const filePath = path.join(LOCAL_TILES_DIR, String(z), String(x), `${y}.png`);
    if (existsSync(filePath)) {
      const bytes = await readFile(filePath);
      return new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=2592000, immutable",
        },
      });
    }
  }

  // Outside KZ: proxy fallback so client can use a single tile URL worldwide.
  if (!tileIntersectsKz(z, x, y)) {
    const proxied = await fetchFallbackTile(z, x, y);
    if (proxied) return proxied;
    return new Response(null, { status: 404 });
  }

  // Inside KZ without local file — no tile yet (vector base style shows through).
  return new Response(null, { status: 404 });
}
