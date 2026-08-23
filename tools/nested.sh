#!/usr/bin/env bash
# Gelistirme dongusu: eklentiyi ic ice (nested) bir GNOME kabugunda calistir.
#
# NEDEN: GNOME 45+ ESM modullerini onbellege aliyor. `gnome-extensions
# disable/enable` JS'i YENIDEN OKUMAZ -- kabuk yeniden baslamali. Wayland'de
# gercek oturumda bu cikis/giris demek. Nested oturum ayni isi bedavaya
# yariyor: oldur, yeniden baslat, birkac saniyede yeni kod.
#
# Bu betik Pcbridge/gnome-extension/nested.sh'ten uyarlandi. Oradaki uc aci
# ders (yetim servisler, pkill'in cagirani oldurmesi, logun journalctl'e
# gitmemesi) burada da gecerli -- ayrintilar asagida, ilgili yerlerde.
#
# SINIRLARI (gercek oturumda mutlaka bir kez dogrula):
#   - sanal monitorler, gercek DP-1/DP-2 degil
#   - imlec bir Wayland ISTEMCISI olarak ciziliyor; donanim imlec duzlemi yok

set -euo pipefail

UUID="claude-pet@eymistaken.local"
BURASI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EKLENTI_DIZIN="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

LOG="${CLAUDE_PET_NESTED_LOG:-${TMPDIR:-/tmp}/claude-pet-nested.log}"
PIDF="$LOG.pid"

# Nested kabugun Wayland soketi. SABIT ad: test istemcisini
# `WAYLAND_DISPLAY=claude-pet-nested <uygulama>` ile acabilmek icin.
WL_DISPLAY="${CLAUDE_PET_NESTED_DISPLAY:-claude-pet-nested}"

# --------------------------------------------------------------- izole dconf
#
# NEDEN: `~/.config/dconf/user` GERCEK oturumla paylasiliyor. Nested'de
# `enabled-extensions`'a claude-pet yazmak onu gercek masaustunun de eklenti
# listesine sokar -- yani hic test edilmemis, gnome-shell process'inin ICINDE
# calisan bir kodu. Ayri bir kullanici veritabani bunu yapisal olarak
# imkansiz kiliyor. Yan fayda: nested TEMIZ aciliyor (blur-my-shell vb.
# yuklenmiyor), yani logdaki her satir bizim.
# ADTA TIRE YOK, BILEREK: dconf yazicisinin D-Bus nesne yolu veritabani
# adindan turuyor (/ca/desktop/dconf/Writer/<ad>) ve nesne yolu ogeleri
# yalnizca [A-Za-z0-9_] kabul ediyor. "claude-pet-nested" ile `gsettings
# set` g_variant_is_object_path assertion'i basip KILITLENIYOR.
DCONF_DB="claudepet_nested"
PROFIL="${TMPDIR:-/tmp}/claude-pet-dconf-profile"
printf 'user-db:%s\n' "$DCONF_DB" > "$PROFIL"
export DCONF_PROFILE="$PROFIL"

# Iki sanal monitor pahali degil ama Faz 0'da tek buyuk monitor daha kullanisli:
# dikdortgeni gormek ve ALTINA bir pencere acmak icin yer gerekiyor.
# Faz 5 (monitor mantigi) icin: MUTTER_DEBUG_NUM_DUMMY_MONITORS=2
: "${MUTTER_DEBUG_NUM_DUMMY_MONITORS:=1}"
: "${MUTTER_DEBUG_DUMMY_MODE_SPECS:=1280x800}"
export MUTTER_DEBUG_NUM_DUMMY_MONITORS MUTTER_DEBUG_DUMMY_MODE_SPECS

# Nested oturumun ARDINDA BIRAKTIGI servisleri de topla.
#
# OLCULDU (Pcbridge, 2026-08-04, aci sekilde): gnome-shell'i oldurmek YETMIYOR.
# `dbus-run-session` ozel bir veriyolu kuruyor ve o veriyolu gvfsd,
# tracker-miner, dconf-service, at-spi, evolution... diye ~13 servis
# baslatiyor. Kabuk olunce bunlar YASAMAYA DEVAM EDIYOR.
#
# Bedeli teorik degil: ~20 kosumdan sonra 298 yetim surec birikti ve
# `fs.inotify.max_user_instances` (128) DOLDU. O noktada Gio.FileMonitor
# artik yeni izleyici yaratamiyor -- SESSIZCE. Bu proje icin olumcul:
# Faz 3'un tamami inbox'i izleyen bir FileMonitor uzerine kurulu.
#
# Ayirt etme olcutu kesin: nested oturumlar `/tmp/dbus-*`, gercek oturum
# `/run/user/<uid>/bus` kullaniyor. Gercek oturumun servislerine dokunmak
# yapisal olarak mumkun degil.
oturum_temizle() {
    local liste="" p adr
    for p in $(ls /proc 2>/dev/null | grep -E '^[0-9]+$'); do
        # Dosyayi KABUGA DEGIL grep'e actiriyoruz. `< /proc/$p/environ`
        # yazilirsa okuma izni olmayan yuzlerce surec icin hatayi BASH
        # basiyor ve komut icindeki `2>/dev/null` onu susturmuyor.
        # `|| true` de sart: `set -e` altinda ilk basarisiz okuma betigi
        # komple dusuruyor -- belirtisi "nested hic baslamadi" oluyor.
        adr=$(grep -azm1 '^DBUS_SESSION_BUS_ADDRESS=' "/proc/$p/environ" 2>/dev/null | tr -d '\0' || true)
        case "$adr" in *"/tmp/dbus-"*) liste="$liste $p";; esac
    done
    [[ -z "${liste// }" ]] && return 0
    echo "nested oturumdan kalan $(echo $liste | wc -w) servis kapatiliyor"
    kill -TERM $liste 2>/dev/null || true
    sleep 2
    local kalan="" q
    for q in $liste; do [[ -d /proc/$q ]] && kalan="$kalan $q"; done
    [[ -n "${kalan// }" ]] && kill -KILL $kalan 2>/dev/null || true
    return 0
}

inotify_durum() {
    echo "inotify ornegi: $(ls -l /proc/*/fd/* 2>/dev/null | grep -c inotify)/$(cat /proc/sys/fs/inotify/max_user_instances)"
}

# DIKKAT: `pkill -f 'gnome-shell --nested'` KULLANMA. Desen tam komut satirina
# bakiyor, yani bu betigi calistiran kabugun kendi komut satirina da uyuyor ve
# pkill CAGIRANI olduruyor. Pcbridge'de bir kere yasandi. Bu yuzden PID
# dosyasi; yedek yol da `^` ile bagli, boylece yalnizca gercekten `gnome-shell`
# olan surece uyar.
oldur() {
    local vurulan=0 pid
    if [[ -f "$PIDF" ]]; then
        pid="$(cat "$PIDF" 2>/dev/null || true)"
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null && vurulan=1
        fi
        rm -f "$PIDF"
    fi
    if pkill -f -- '^gnome-shell --nested' 2>/dev/null; then
        vurulan=1
    fi
    if (( vurulan )); then
        echo "onceki nested kabuk kapatildi"
        sleep 1
    fi
    # Kabuk olsun olmasin: yetim servisler her zaman toplanir. Bir onceki
    # kosumdan kalmis olabilirler.
    oturum_temizle
}

# Izole veritabanini nested oturum icin hazirla.
#
# Veritabani BOS oldugu icin `enabled-extensions` tek satirda yazilabiliyor --
# gercek oturumdaki gibi mevcut listeyi okuyup birlestirmeye gerek yok.
dconf_hazirla() {
    local surum
    surum="$(gnome-shell --version 2>/dev/null | awk '{print $3}')"

    gsettings set org.gnome.shell enabled-extensions "['$UUID']"
    # Karsilama penceresi bos bir veritabaninda her acilista cikar ve
    # dikdortgenin onunu kapatir.
    gsettings set org.gnome.shell welcome-dialog-last-shown-version "${surum:-99.0}"
    # Dogrulama sirasinda ekran kararmasin / kilitlenmesin.
    gsettings set org.gnome.desktop.session idle-delay 0
    gsettings set org.gnome.desktop.screensaver lock-enabled false

    echo "izole dconf hazir: ~/.config/dconf/$DCONF_DB  (gercek oturum ETKILENMEDI)"
}

case "${1:-}" in
    --oldur|--kapat)
        oldur
        inotify_durum
        exit 0
        ;;
    --temizle)
        oturum_temizle
        inotify_durum
        exit 0
        ;;
    --log)
        exec tail -f "$LOG"
        ;;
    -h|--yardim|--help)
        cat <<EOF
Kullanim: nested.sh [secenek]

  (bos)         onceki nested kabugu oldur, yenisini baslat, durumu yazdir
  --oldur       kabugu VE ardinda kalan oturum servislerini kapat
  --temizle     yalnizca yetim servisleri topla (kabuga dokunmaz)
  --log         calisan kabugun logunu izle

Log dosyasi   : $LOG
Wayland soketi: $WL_DISPLAY
dconf         : IZOLE (~/.config/dconf/$DCONF_DB)

Nested oturuma test penceresi acmak icin:
    WAYLAND_DISPLAY=$WL_DISPLAY gnome-calculator

Cevre degiskenleri: MUTTER_DEBUG_NUM_DUMMY_MONITORS,
MUTTER_DEBUG_DUMMY_MODE_SPECS, CLAUDE_PET_NESTED_LOG,
CLAUDE_PET_NESTED_DISPLAY

NOT: her nested kosumu ~13 oturum servisi (gvfsd, tracker-miner, dconf,
at-spi...) baslatiyor ve kabuk olunce bunlar YASAMAYA DEVAM EDIYOR.
Toplanmazlarsa fs.inotify.max_user_instances doluyor ve o noktada
Gio.FileMonitor SESSIZCE calismaz oluyor. Bu betik her kosumda topluyor.
EOF
        exit 0
        ;;
    "")
        ;;
    *)
        echo "bilinmeyen secenek: $1  (--yardim)" >&2
        exit 1
        ;;
esac

[[ -d "$EKLENTI_DIZIN" ]] || echo "UYARI: eklenti kurulu gorunmuyor -- once 'make install'"

oldur
dconf_hazirla

: > "$LOG"
dbus-run-session -- gnome-shell --nested --wayland --wayland-display="$WL_DISPLAY" >"$LOG" 2>&1 &
echo "$!" > "$PIDF"
echo "nested kabuk basladi (pid $!) · monitor: $MUTTER_DEBUG_DUMMY_MODE_SPECS x$MUTTER_DEBUG_NUM_DUMMY_MONITORS"
echo "log   : $LOG"
inotify_durum

# Kabugun ayaga kalkmasini ve eklentiyi yuklemesini bekle.
for _ in $(seq 1 20); do
    [[ -S "${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/$WL_DISPLAY" ]] && break
    sleep 0.5
done
sleep 3

echo
echo "--- eklenti satirlari ---"
grep -E 'claude-pet' "$LOG" || echo "(henuz cikti yok)"
echo
echo "Test penceresi: WAYLAND_DISPLAY=$WL_DISPLAY gnome-calculator &"
