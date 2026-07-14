import { KZ_BOUNDS } from "./constants";

/** Convert tile z/x/y to WGS84 bounds [west, south, east, north]. */
export function tileBounds(z: number, x: number, y: number): [number, number, number, number] {
  const n = 2 ** z;
  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;
  const northRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const southRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n)));
  const north = (northRad * 180) / Math.PI;
  const south = (southRad * 180) / Math.PI;
  return [west, south, east, north];
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 <= b1 && b0 <= a1;
}

/** True if tile intersects Kazakhstan bounding box. */
export function tileIntersectsKz(z: number, x: number, y: number): boolean {
  const [west, south, east, north] = tileBounds(z, x, y);
  const [[kzSouth, kzWest], [kzNorth, kzEast]] = KZ_BOUNDS;
  return (
    rangesOverlap(west, east, kzWest, kzEast) && rangesOverlap(south, north, kzSouth, kzNorth)
  );
}
