#!/usr/bin/env bash
# Extract regional PMTiles from the open Protomaps/OSM planet archive (ODbL).
# Requires pmtiles CLI: https://docs.protomaps.com/pmtiles/cli
#
# Example (Almaty city bbox):
#   PROTOMAPS_URL=https://data.source.coop/protomaps/openstreetmap/v4.pmtiles \
#   ./scripts/kz-maps/extract-region-pmtiles.sh almaty-city 76.7,43.1,77.15,43.45
set -euo pipefail

REGION_ID="${1:?region id}"
BBOX="${2:?min_lon,min_lat,max_lon,max_lat}"
OUT="${3:-${REGION_ID}.pmtiles}"
SOURCE="${PROTOMAPS_URL:-https://data.source.coop/protomaps/openstreetmap/v4.pmtiles}"
MAXZOOM="${PROTOMAPS_MAX_ZOOM:-14}"

echo "Extracting ${REGION_ID} from Protomaps/OpenStreetMap"
echo "  source: ${SOURCE}"
echo "  bbox:   ${BBOX}"
echo "  maxzoom: ${MAXZOOM}"
echo "  output: ${OUT}"

pmtiles extract "${SOURCE}" "${OUT}" --bbox="${BBOX}" --maxzoom="${MAXZOOM}"

echo "Done. Attribution required on map: Protomaps © OpenStreetMap (ODbL)"
