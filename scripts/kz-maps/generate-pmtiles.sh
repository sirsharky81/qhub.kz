#!/usr/bin/env bash
# DEPRECATED — do not use for production offline bundles.
# Use on-demand Protomaps extract instead: scripts/kz-maps/extract-region-pmtiles.sh
# To remove old VPS files: scripts/kz-maps/cleanup-vps-legacy-bundles.sh
# Docs: https://docs.protomaps.com/basemaps/downloads
set -euo pipefail

OSM_PBF="${1:-}"
OUT_DIR="${KZ_MAPS_BUNDLES_DIR:-/var/www/qhub-tiles/kz-maps}"

if [[ -z "$OSM_PBF" || ! -f "$OSM_PBF" ]]; then
  echo "Usage: $0 /path/to/kazakhstan-latest.osm.pbf"
  echo "Download: https://download.geofabrik.de/asia/kazakhstan-latest.osm.pbf"
  exit 1
fi

mkdir -p "$OUT_DIR"

# Example with planetiler (install separately):
# planetiler build --download --area=kazakhstan --output="$OUT_DIR/kazakhstan.pmtiles"

declare -A REGIONS=(
  ["almaty-city"]="76.7,43.1,77.15,43.45"
  ["almaty-oblast"]="74.5,42.5,80.5,45.5"
  ["turkestan"]="67.0,41.0,72.0,44.5"
  ["mangystau"]="50.0,42.0,56.0,46.0"
)

for id in "${!REGIONS[@]}"; do
  bbox="${REGIONS[$id]}"
  echo "==> $id ($bbox) -> $OUT_DIR/$id.pmtiles"
  # Replace with your tilemaker/planetiler command, e.g.:
  # tilemaker --input "$OSM_PBF" --output "$OUT_DIR/$id.pmtiles" --bbox "$bbox"
  echo "    (configure tilemaker/planetiler for bbox $bbox)"
done

echo "Done. Serve via nginx location /kz-maps/bundles/ -> $OUT_DIR"
