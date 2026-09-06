#!/usr/bin/env bash
# gtk4-layer-shell'i SUDO OLMADAN derleyebilmek icin yerel bir sysroot kurar.
#
# NEDEN: `libgtk-4-dev` bu makinede kurulu degil ve `sudo` parola istiyor.
# `apt-get download` ayricalik istemiyor; .deb'leri acip PKG_CONFIG_PATH'i
# oraya cevirmek yetiyor. Sistem dizinlerine hicbir sey yazilmiyor.
#
# meson/ninja de ayni sebeple pip venv'inden geliyor.
set -euo pipefail

KOK="$(cd "$(dirname "$0")/.." && pwd)"
TC="$KOK/build/toolchain"
SYSROOT="$TC/sysroot"
VENV="$TC/venv"

# CI'DA BU BETIK HICBIR SEY YAPMAZ. Sysroot numarasi yalnizca gelistirme
# makinesi icin: orada `sudo` parola istiyor. GitHub Actions'ta paketler
# dogrudan kurulabildigi icin sistem zinciri yeterli ve buradan cikiliyor --
# tek kod yolu, iki ortam.
if pkg-config --exists gtk4 && command -v meson >/dev/null 2>&1 &&
   command -v ninja >/dev/null 2>&1; then
    echo "sistem zinciri yeterli (gtk4 dev + meson + ninja) — sysroot atlaniyor"
    exit 0
fi

mkdir -p "$TC/debs" "$SYSROOT"

if [ ! -x "$VENV/bin/meson" ]; then
    echo ">>> meson + ninja (venv)"
    python3 -m venv "$VENV"
    "$VENV/bin/pip" -q install meson ninja
fi

if [ ! -f "$SYSROOT/.tamam" ]; then
    echo ">>> gtk4 gelistirme dosyalari indiriliyor (sudo yok)"
    cd "$TC/debs"
    # Yalnizca pkg-config kapanisi lazim: gtk4'un .pc dosyasinin Requires
    # zinciri. --recurse butun agaci veriyor, kurulu olanlar zaten atlanacak.
    PAKETLER=$(apt-cache depends --recurse --no-recommends --no-suggests \
        --no-conflicts --no-breaks --no-replaces --no-enhances \
        libgtk-4-dev 2>/dev/null | grep -E '^[a-z0-9]' | sort -u)
    # shellcheck disable=SC2086
    apt-get download $PAKETLER 2>/dev/null || true
    echo ">>> aciliyor"
    for d in *.deb; do dpkg-deb -x "$d" "$SYSROOT" 2>/dev/null || true; done
    touch "$SYSROOT/.tamam"
fi

echo "sysroot : $SYSROOT"
echo "venv    : $VENV"
