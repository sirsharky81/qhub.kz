#!/usr/bin/env bash
# Install protomaps/go-pmtiles CLI for on-demand regional offline map extracts.
# Docs: https://docs.protomaps.com/pmtiles/cli
set -euo pipefail

PMTILES_VERSION="${PMTILES_VERSION:-1.31.1}"
INSTALL_DIR="${PMTILES_INSTALL_DIR:-/usr/local/bin}"

if command -v pmtiles >/dev/null 2>&1; then
  echo "pmtiles already installed ($(command -v pmtiles))"
  exit 0
fi

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64 | amd64) ARCH_SUFFIX="x86_64" ;;
  aarch64 | arm64) ARCH_SUFFIX="arm64" ;;
  *)
    echo "Unsupported architecture for pmtiles CLI: $ARCH" >&2
    exit 1
    ;;
esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

URL="https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_${ARCH_SUFFIX}.tar.gz"
echo "Downloading pmtiles v${PMTILES_VERSION} (${ARCH_SUFFIX})"
curl -fsSL "$URL" -o "$TMP/pmtiles.tgz"
tar -xzf "$TMP/pmtiles.tgz" -C "$TMP"

if [[ ! -f "$TMP/pmtiles" ]]; then
  echo "pmtiles binary not found in archive" >&2
  exit 1
fi

install -m 755 "$TMP/pmtiles" "$INSTALL_DIR/pmtiles"
echo "Installed pmtiles -> $INSTALL_DIR/pmtiles"
