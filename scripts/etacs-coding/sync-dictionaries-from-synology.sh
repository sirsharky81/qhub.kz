#!/usr/bin/env bash
# Sync proprietary ETACS dictionaries: Synology (master copy) -> VPS (runtime).
# Run on VPS as deploy user with SSH key to Synology. Dictionaries must NOT live under public/.
#
# Synology layout (example):
#   /volume1/qhub/etacs-dictionary/index.json
#   /volume1/qhub/etacs-dictionary/blocks/*.json
#   /volume1/qhub/etacs-dictionary/8637C671.json
#
# Usage:
#   ETACS_SYNOLOGY_SRC="backup@synology.local:/volume1/qhub/etacs-dictionary/" \
#   ETACS_DICTIONARY_DIR="/var/lib/qhub/etacs-dictionaries" \
#   bash scripts/etacs-coding/sync-dictionaries-from-synology.sh

set -euo pipefail

SRC="${ETACS_SYNOLOGY_SRC:?Set ETACS_SYNOLOGY_SRC (rsync source, trailing slash)}"
DEST="${ETACS_DICTIONARY_DIR:-/var/lib/qhub/etacs-dictionaries}"

mkdir -p "$DEST"
rsync -av --delete --chmod=D755,F644 "$SRC" "$DEST/"

echo "[etacs-sync] updated $DEST from Synology"
echo "[etacs-sync] restart QHub Node process to clear in-memory dictionary cache (or redeploy)."
