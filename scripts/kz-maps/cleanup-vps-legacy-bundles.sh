#!/usr/bin/env bash
# Remove legacy pre-built offline map bundles from VPS disk.
# Current kz-maps flow extracts regions on-demand from Protomaps/OSM — no static bundles needed.
set -euo pipefail

LEGACY_DIR="${KZ_MAPS_BUNDLES_DIR:-/var/www/qhub-tiles/kz-maps}"
TMP_GLOB="${TMPDIR:-/tmp}/kz-pmtiles-extract-*"

echo "==> KZ Maps legacy bundle cleanup"
echo "    target: ${LEGACY_DIR}"

if [[ -d "$LEGACY_DIR" ]]; then
  BEFORE=$(du -sh "$LEGACY_DIR" 2>/dev/null | cut -f1 || echo "?")
  echo "    size before: ${BEFORE}"
  rm -rf "$LEGACY_DIR"
  echo "    removed directory ${LEGACY_DIR}"
else
  echo "    nothing to remove (directory absent)"
fi

# Best-effort: drop stale on-demand extract temp dirs older than 1 day
STALE=$(find "${TMPDIR:-/tmp}" -maxdepth 1 -type d -name 'kz-pmtiles-extract-*' -mtime +1 2>/dev/null | wc -l || echo 0)
if [[ "$STALE" -gt 0 ]]; then
  find "${TMPDIR:-/tmp}" -maxdepth 1 -type d -name 'kz-pmtiles-extract-*' -mtime +1 -exec rm -rf {} + 2>/dev/null || true
  echo "    removed ${STALE} stale temp extract dir(s)"
fi

echo "==> Done. Offline maps are stored on user devices; VPS only streams on-demand extracts."
