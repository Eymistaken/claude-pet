#!/usr/bin/env bash
# claude-pet AppImage uretimi.
#
# NE URETIYOR: butun bagimliliklari (gjs, mozjs, GTK4, libadwaita,
# gtk4-layer-shell, pango, cairo…) icinde tasiyan tek dosya. Hedef sistemde
# yalnizca glibc >= 2.39 ve bir Wayland kompozitoru gerekiyor; FUSE bile
# gerekmiyor (statik runtime).
#
# NEDEN BU KADAR IS: gjs KDE distrolarinda kurulu degil (GNOME'a ait bir
# calisma zamani) ve gtk4-layer-shell hicbir yerde varsayilan degil. Konak
# sisteme guvenilebilecek tek sey grafik yigini ve libc.
#
# ADIMLAR
#   0  yerel derleme zinciri (sudo yok)      tools/toolchain.sh
#   1  gtk4-layer-shell derlemesi
#   2  semalar
#   3  AppDir iskeleti + kaynak dosyalar
#   4  gjs + kutuphane kapanisi
#   5  typelib'ler
#   6  gdk-pixbuf yukleyicileri
#   7  AppRun / .desktop / ikon
#   8  appimagetool
set -euo pipefail

KOK="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$KOK/build"
APPDIR="$BUILD/AppDir"
TC="$BUILD/toolchain"
LS_SRC="$TC/gtk4-layer-shell"
LS_OUT="$LS_SRC/_install/usr"
ARCH=x86_64
LIBDIR=/usr/lib/x86_64-linux-gnu

# Konak sistemden gelmesi GEREKEN kutuphaneler — paketlenirse zarar veriyor.
# Grafik yigini (mesa/GL/drm) ve wayland istemcisi surucuye bagli; libc ve
# arkadaslari konak cekirdegine. Bunlari tasimak AppImage'i tasinabilir
# yapmiyor, tam tersi.
ATLA='^(ld-linux|libc\.|libm\.|libdl\.|libpthread\.|librt\.|libresolv\.|libnsl\.|libutil\.|libcrypt\.|libgcc_s|libstdc\+\+|libGL|libEGL|libGLX|libGLdispatch|libOpenGL|libdrm|libgbm|libglapi|libwayland|libX11|libxcb|libXau|libXdmcp|libXext|libXi\.|libXcursor|libXrandr|libXfixes|libXdamage|libXinerama|libXrender|libXcomposite|libXtst|libSM|libICE|libselinux|libudev|libsystemd|libcap)'

adim() { printf '\n\033[1m>>> %s\033[0m\n' "$*"; }

# --------------------------------------------------------- 0-1  derleme zinciri

adim "derleme zinciri"
bash "$KOK/tools/toolchain.sh"
SR="$TC/sysroot"
# Sysroot yalnizca gelistirme makinesinde var (bkz. tools/toolchain.sh). CI'da
# gtk4 gelistirme dosyalari sistemde oldugu icin ikisi de atlaniyor.
[ -x "$TC/venv/bin/meson" ] && export PATH="$TC/venv/bin:$PATH"

if [ ! -f "$LS_OUT/lib/libgtk4-layer-shell.so.0" ]; then
    adim "gtk4-layer-shell derleniyor"
    # $TC'yi BURADA yaratiyoruz: toolchain.sh sistem zinciri yeterliyse (CI)
    # hicbir sey yapmadan cikiyor ve dizin hic olusmuyor. Olculdu -- curl
    # "diske yazamadi" (23) ile dustu.
    mkdir -p "$TC"
    [ -d "$LS_SRC" ] || {
        curl -sL https://github.com/wmww/gtk4-layer-shell/archive/refs/tags/v1.3.0.tar.gz \
            -o "$TC/ls.tgz"
        tar xzf "$TC/ls.tgz" -C "$TC"
        mv "$TC/gtk4-layer-shell-1.3.0" "$LS_SRC"
    }
    if [ -d "$SR/usr/lib" ]; then
        # g-ir-scanner konak sistemde; PKG_CONFIG_SYSROOT_DIR onu de sysroot'a
        # kaydirdigi icin bag kuruluyor (meson aksi halde "distributor issue"
        # deyip duruyor).
        mkdir -p "$SR/usr/bin"
        for t in $(ls /usr/bin | grep -i 'g-ir'); do ln -sf "/usr/bin/$t" "$SR/usr/bin/$t"; done
        export PKG_CONFIG_PATH="$SR/usr/lib/x86_64-linux-gnu/pkgconfig:$SR/usr/share/pkgconfig"
        export PKG_CONFIG_SYSROOT_DIR="$SR"
        export XDG_DATA_DIRS="$SR/usr/share:/usr/share"
    fi
    ( cd "$LS_SRC" && rm -rf _b _install &&
      meson setup _b -Dexamples=false -Ddocs=false -Dtests=false \
          -Dintrospection=true -Dvapi=false --prefix=/usr --libdir=lib >/dev/null &&
      ninja -C _b >/dev/null &&
      DESTDIR="$LS_SRC/_install" ninja -C _b install >/dev/null )
    unset PKG_CONFIG_PATH PKG_CONFIG_SYSROOT_DIR XDG_DATA_DIRS
fi

# ------------------------------------------------------------------- 2  semalar

adim "semalar"
glib-compile-schemas "$KOK/app/data"

# --------------------------------------------------------- 3  AppDir + kaynaklar

adim "AppDir"
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/bin" "$APPDIR/usr/lib/girepository-1.0" \
         "$APPDIR/usr/lib/gio/modules" \
         "$APPDIR/usr/share/glib-2.0/schemas" \
         "$APPDIR/usr/share/icons/hicolor/256x256/apps"

# Agac depodakiyle AYNI: app/main.js kardeslerini ../src ve ../assets diye
# buluyor, yani AppImage icinde de depoda da tek kod yolu.
cp -r "$KOK/app" "$APPDIR/app"
mkdir -p "$APPDIR/src" "$APPDIR/assets" "$APPDIR/hooks"
cp -r "$KOK/src/lib" "$APPDIR/src/lib"
cp "$KOK/assets/animations.json" "$APPDIR/assets/"
cp "$KOK/hooks/claude-pet-hook.py" "$APPDIR/hooks/"

# ------------------------------------------------------- 4  gjs + kutuphaneler

adim "gjs + kutuphane kapanisi"
cp "$(readlink -f "$(command -v gjs)")" "$APPDIR/usr/bin/gjs"

# GTK4 kendi simgelerinin 122'sini SVG olarak GRESOURCE ICINDE tasiyor
# (ayarlar penceresindeki +/- dugmeleri, acilir ok, kapatma dugmesi). SVG'yi
# cozen sey librsvg2-common'dan gelen su yukleyici; yoksa o simgeler
# CIZILMIYOR. PNG/JPEG/GIF gdk-pixbuf'un icinde, ayri yukleyici istemiyorlar.
SVG_YUKLEYICI="$LIBDIR/gdk-pixbuf-2.0/2.10.0/loaders/libpixbufloader-svg.so"
[ -f "$SVG_YUKLEYICI" ] || {
    echo "HATA: $SVG_YUKLEYICI yok. 'librsvg2-common' kurulu olmali."; exit 1; }

TOHUM=(
    "$APPDIR/usr/bin/gjs"
    "$LIBDIR/libgtk-4.so.1"
    "$LIBDIR/libadwaita-1.so.0"
    "$LIBDIR/libgirepository-1.0.so.1"
    "$LIBDIR/libgdk_pixbuf-2.0.so.0"
    "$LIBDIR/libvulkan.so.1"
    "$LS_OUT/lib/libgtk4-layer-shell.so.0"
)
TOHUM+=("$SVG_YUKLEYICI")

# `ldd` zaten GECISLI kapanisi veriyor; tek tur yetiyor.
{
    for t in "${TOHUM[@]}"; do
        printf '%s\n' "$t"
        ldd "$t" 2>/dev/null | awk '/=> \//{print $3}'
    done
} | sort -u | while read -r lib; do
    ad=$(basename "$lib")
    echo "$ad" | grep -qE "$ATLA" && continue
    cp -L "$lib" "$APPDIR/usr/lib/$ad" 2>/dev/null || true
done

# layer-shell'in soname ve gelistirme bagi
cp -L "$LS_OUT/lib/libgtk4-layer-shell.so.1.3.0" "$APPDIR/usr/lib/" 2>/dev/null || true
ln -sf libgtk4-layer-shell.so.1.3.0 "$APPDIR/usr/lib/libgtk4-layer-shell.so.0"

# ---------------------------------------------------------------- 5  typelib'ler

adim "typelib'ler"
TYPELIB=(GLib-2.0 GObject-2.0 Gio-2.0 GioUnix-2.0 GLibUnix-2.0 GModule-2.0
         Gtk-4.0 Gdk-4.0 Gsk-4.0 Graphene-1.0 Pango-1.0 PangoCairo-1.0
         cairo-1.0 GdkPixbuf-2.0 HarfBuzz-0.0 freetype2-2.0 Adw-1)
for t in "${TYPELIB[@]}"; do
    cp "$LIBDIR/girepository-1.0/$t.typelib" "$APPDIR/usr/lib/girepository-1.0/"
done
cp "$LS_OUT/lib/girepository-1.0/Gtk4LayerShell-1.0.typelib" \
   "$APPDIR/usr/lib/girepository-1.0/"

# ---------------------------------------------------- 6  gdk-pixbuf yukleyicileri

adim "gdk-pixbuf: yalnizca SVG yukleyicisi"
# `*.so` DEGIL, TEK dosya. Makinede kurulu yukleyici kumesi (heif, webp,
# wmf, tiff…) makineden makineye degisiyor; hepsini almak cikti'yi derleyen
# makineye bagli yapiyordu -- OLCULDU: ayni commit yerelde 108, CI'da 98
# kutuphane uretti. Uygulamanin ihtiyaci tek bir yukleyici.
PB="$APPDIR/usr/lib/gdk-pixbuf-2.0/2.10.0/loaders"
mkdir -p "$PB"
cp "$SVG_YUKLEYICI" "$PB/"
# Onbellekteki yol MUTLAK olamaz: AppImage her acilista baska bir yere
# bagleniyor. Yalnizca dosya adi birakiliyor; gdk-pixbuf onu
# GDK_PIXBUF_MODULEDIR'e gore cozuyor.
"$LIBDIR/gdk-pixbuf-2.0/gdk-pixbuf-query-loaders" "$SVG_YUKLEYICI" |
    sed 's|^"'"$LIBDIR"'/gdk-pixbuf-2.0/2.10.0/loaders/|"|' \
    > "$APPDIR/usr/lib/gdk-pixbuf-2.0/2.10.0/loaders.cache"

# ----------------------------------------------------------- 7  semalar + ikon

adim "glib semalari"
# GTK ve libadwaita kendi semalarini ariyor. Bizimki AYRI: uygulama onu
# `SettingsSchemaSource` ile kendi dizininden aciyor (app/data), cunku ayar
# arka ucu da ayri (keyfile).
for s in "$LIBDIR/../../share/glib-2.0/schemas"/org.gtk.gtk4.*.gschema.xml \
         /usr/share/glib-2.0/schemas/org.gtk.gtk4.*.gschema.xml \
         /usr/share/glib-2.0/schemas/org.gnome.desktop.interface.gschema.xml; do
    [ -f "$s" ] && cp "$s" "$APPDIR/usr/share/glib-2.0/schemas/" || true
done
glib-compile-schemas "$APPDIR/usr/share/glib-2.0/schemas" >/dev/null

adim "ikon + .desktop"
gjs -m "$KOK/tools/ikon.js" "$KOK/app/data/claude-pet.png" 256 >/dev/null
cp "$KOK/app/data/claude-pet.png" "$APPDIR/claude-pet.png"
cp "$KOK/app/data/claude-pet.png" "$APPDIR/usr/share/icons/hicolor/256x256/apps/"

cat > "$APPDIR/io.github.eymistaken.ClaudePet.desktop" <<'DESKTOP'
[Desktop Entry]
Type=Application
Name=Claude Pet
Comment=Desktop mascot that shows what Claude Code is doing
Exec=claude-pet
Icon=claude-pet
Terminal=false
Categories=Utility;
StartupNotify=false
DESKTOP

cat > "$APPDIR/AppRun" <<'APPRUN'
#!/bin/sh
# claude-pet AppImage giris noktasi.
HERE="$(dirname "$(readlink -f "$0")")"

export LD_LIBRARY_PATH="$HERE/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export GI_TYPELIB_PATH="$HERE/usr/lib/girepository-1.0"
export GSETTINGS_SCHEMA_DIR="$HERE/usr/share/glib-2.0/schemas"
export XDG_DATA_DIRS="$HERE/usr/share:${XDG_DATA_DIRS:-/usr/local/share:/usr/share}"

# dconf BAGIMLILIGI YOK: kendi ayarlarimiz acikca keyfile arka ucundan
# geciyor (app/ayarlar.js), geri kalan her sey (GTK'nin kendi semalari)
# bellekte. Boylece dconf kurulu olmayan bir sistemde de uyari cikmiyor.
export GSETTINGS_BACKEND=memory

# Konak sistemin GIO modulleri paketlenmis glib'e sizmasin — Arch ve
# Fedora'da klasik AppImage cokmesi bu.
export GIO_MODULE_DIR="$HERE/usr/lib/gio/modules"

export GDK_PIXBUF_MODULEDIR="$HERE/usr/lib/gdk-pixbuf-2.0/2.10.0/loaders"
export GDK_PIXBUF_MODULE_FILE="$HERE/usr/lib/gdk-pixbuf-2.0/2.10.0/loaders.cache"

# Bu surum yalnizca Wayland: konum, ustte durma ve tiklama gecirgenligi
# wlr-layer-shell'den geliyor.
export GDK_BACKEND=wayland
# Piksel sanati icin GL/Vulkan gereksiz; yazilim yolu her yerde calisiyor ve
# mesa paketlemeye gerek birakmiyor.
export GSK_RENDERER=cairo

# ZORUNLU: gtk4-layer-shell libwayland cagrilarini shim'liyor ve
# libwayland-client'tan ONCE yuklenmek zorunda. GJS'de Python'un
# `CDLL(...)` numarasinin karsiligi yok; tek yol bu.
export LD_PRELOAD="$HERE/usr/lib/libgtk4-layer-shell.so.0${LD_PRELOAD:+:$LD_PRELOAD}"

exec "$HERE/usr/bin/gjs" -m "$HERE/app/main.js" "$@"
APPRUN
chmod +x "$APPDIR/AppRun"

# ------------------------------------------------------------ 8  appimagetool

adim "appimagetool"
TOOL="$TC/appimagetool-$ARCH.AppImage"
[ -f "$TOOL" ] || {
    curl -sL "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-$ARCH.AppImage" -o "$TOOL"
    chmod +x "$TOOL"
}

CIKTI="$BUILD/Claude_Pet-$ARCH.AppImage"
rm -f "$CIKTI"
# `--appimage-extract-and-run`: aracin kendisi FUSE istemesin.
ARCH=$ARCH "$TOOL" --appimage-extract-and-run "$APPDIR" "$CIKTI"

adim "bitti"
ls -lh "$CIKTI"
( cd "$BUILD" && sha256sum "$(basename "$CIKTI")" > SHA256SUMS && cat SHA256SUMS )
