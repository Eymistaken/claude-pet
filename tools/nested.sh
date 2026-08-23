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

# Log KOSUMA OZEL, sabit tek dosya DEGIL.
#
# NEDEN: onceki kosumdan kalan servisler log dosyasini hala ACIK tutuyor ve
# kendi dosya konumlarindan yazmaya devam ediyor. Sabit bir dosyayi `>` ile
# kisaltinca yeni kabugun satirlarini o eski yazicilar UZERINE yaziyor --
# yani kanit sessizce yok oluyor. Bir kere yasandi: `[claude-pet] etkin`
# satiri logdan kayboldu ve kabuk cokmus gibi gorundu.
LOG_DIR="${CLAUDE_PET_NESTED_LOG_DIR:-${TMPDIR:-/tmp}/claude-pet-nested}"
mkdir -p "$LOG_DIR"
# Sabit ad, son kosuma isaret eden bir symlink olarak duruyor.
LOG_LINK="${TMPDIR:-/tmp}/claude-pet-nested.log"
PIDF="$LOG_LINK.pid"
BUSF="$LOG_LINK.bus"

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

# Yetim BUS DAEMON'lari topla.
#
# `oturum_temizle` bunlari kaciriyor, cunki dbus-daemon'in KENDI
# DBUS_SESSION_BUS_ADDRESS'i ebeveynden miras kaldigi icin GERCEK oturumu
# gosteriyor (`/run/user/1000/bus`), `/tmp/dbus-*` degil. Sonuc: her
# `make nested` bir bus daemon birakiyor ve bunlar inotify ornegi yiyor.
#
# GUVENLIK: yalnizca UZERINDE CANLI nested kabuk OLMAYAN bus'lar oldurulur.
# Yani baska bir nested oturum (ornegin Pcbridge'inki) acikken ona dokunmaz.
bus_temizle() {
    command -v ss >/dev/null || return 0

    # Canli nested kabuklarin kullandigi soket yollari.
    local canli="" p adr
    for p in $(pgrep -f -- '^gnome-shell --nested' 2>/dev/null || true); do
        adr=$(grep -azm1 '^DBUS_SESSION_BUS_ADDRESS=' "/proc/$p/environ" 2>/dev/null | tr -d '\0' || true)
        case "$adr" in
            *unix:path=/tmp/dbus-*)
                canli="$canli ${adr#*unix:path=}"
                ;;
        esac
    done
    canli=$(echo "$canli" | tr ' ' '\n' | cut -d, -f1 | grep -v '^$' || true)

    local vurulan="" yol pid satir
    while read -r satir; do
        yol=$(echo "$satir" | grep -o '/tmp/dbus-[A-Za-z0-9]*' | head -1)
        pid=$(echo "$satir" | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)
        [[ -z "$yol" || -z "$pid" ]] && continue
        if ! echo "$canli" | grep -qx "$yol"; then
            vurulan="$vurulan $pid"
        fi
    done < <(ss -lxp 2>/dev/null | grep '/tmp/dbus-' || true)

    [[ -z "${vurulan// }" ]] && return 0
    echo "sahipsiz $(echo $vurulan | wc -w) bus daemon kapatiliyor"
    kill -TERM $vurulan 2>/dev/null || true
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
    bus_temizle
}

# Izole veritabanini nested oturum icin hazirla.
#
# Veritabani BOS oldugu icin `enabled-extensions` tek satirda yazilabiliyor --
# gercek oturumdaki gibi mevcut listeyi okuyup birlestirmeye gerek yok.
dconf_hazirla() {
    local surum
    surum="$(gnome-shell --version 2>/dev/null | awk '{print $3}')"

    # `disabled-extensions` ONCE temizlenmeli. `gnome-extensions disable`
    # UUID'yi O LISTEYE yaziyor ve o liste `enabled-extensions`'i EZIYOR:
    # kabuk, disabled'da gordugu bir UUID'yi enabled listesinden aninda geri
    # siliyor. Belirtisi kafa karistirici -- "Durum: INITIALIZED", log sessiz,
    # `enabled-extensions` yazdiktan saniyeler sonra `@as []` olmus oluyor.
    # `dconf reset` kullaniliyor, `gsettings set` degil: bu iki listenin
    # sahibi CALISAN KABUK ve o ayaktayken disaridan yapilan yazmalari geri
    # aliyor (olculdu: `gsettings set` 0 donuyor, deger degismiyor). Burada
    # kabuk kapali oldugu icin ikisi de calisir, ama reset niyeti daha net:
    # "bu anahtari hic yazilmamis say".
    dconf reset /org/gnome/shell/disabled-extensions
    dconf write /org/gnome/shell/enabled-extensions "['$UUID']"
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
        bus_temizle
        inotify_durum
        exit 0
        ;;
    --log)
        exec tail -f "$LOG_LINK"
        ;;
    --bus)
        # Calisan nested kabugun oturum veriyolu adresi.
        # KULLAN: export DBUS_SESSION_BUS_ADDRESS="$(tools/nested.sh --bus)"
        # Kabuk her yeniden baslatildiginda BU ADRES DEGISIYOR; eski adrese
        # gonderilen `gnome-extensions` komutlari sessizce olu bir veriyoluna
        # gidiyor ve hicbir sey yapmiyor.
        [[ -f "$BUSF" ]] || { echo "nested kabuk calismiyor" >&2; exit 1; }
        cat "$BUSF"
        exit 0
        ;;
    -h|--yardim|--help)
        cat <<EOF
Kullanim: nested.sh [secenek]

  (bos)         onceki nested kabugu oldur, yenisini baslat, durumu yazdir
  --oldur       kabugu VE ardinda kalan oturum servislerini kapat
  --temizle     yalnizca yetim servisleri topla (kabuga dokunmaz)
  --log         calisan kabugun logunu izle
  --bus         calisan kabugun D-Bus adresini yazdir

Log dizini    : $LOG_DIR  (son kosum: $LOG_LINK)
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

LOG="$LOG_DIR/$(date +%Y%m%d-%H%M%S).log"
: > "$LOG"
ln -sfn "$LOG" "$LOG_LINK"
rm -f "$BUSF"
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

# Bus adresini kaydet ki `--bus` ile sorulabilsin.
SHELL_PID="$(pgrep -f -- '^gnome-shell --nested' | tail -1 || true)"
if [[ -n "$SHELL_PID" ]]; then
    grep -azm1 '^DBUS_SESSION_BUS_ADDRESS=' "/proc/$SHELL_PID/environ" 2>/dev/null \
        | tr -d '\0' | cut -d= -f2- > "$BUSF" || true
fi

# Eklenti GERCEKTEN etkin mi?
#
# NEDEN GEREKLI: `enabled-extensions`'i yazmak yetmiyor. Kabuk bu listenin
# sahibi; `disabled-extensions`'ta duran bir UUID'yi enabled listesinden
# aninda geri siliyor ve bunu SESSIZCE yapiyor. Belirtisi cok kafa
# karistirici: log tertemiz, hicbir hata yok, ama pet ekranda yok.
# Bu yuzden durum sorulup gerekirse kabugun KENDI D-Bus yoluyla duzeltiliyor.
eklenti_dogrula() {
    local durum
    durum=$(DBUS_SESSION_BUS_ADDRESS="$(cat "$BUSF" 2>/dev/null)" \
        gnome-extensions info "$UUID" 2>/dev/null | grep -oP '(?<=Durum: ).*' || true)
    echo "${durum:-BILINMIYOR}"
}

if [[ -s "$BUSF" ]]; then
    durum="$(eklenti_dogrula)"
    if [[ "$durum" != "ACTIVE" ]]; then
        echo "eklenti etkin degil (durum: $durum) — kabuga soruluyor"
        DBUS_SESSION_BUS_ADDRESS="$(cat "$BUSF")" \
            gnome-extensions enable "$UUID" 2>/dev/null || true
        sleep 2
        durum="$(eklenti_dogrula)"
    fi
    echo "eklenti durumu: $durum"
    [[ "$durum" == "ACTIVE" ]] || echo "UYARI: eklenti ETKIN DEGIL — log bos olabilir ama pet ekranda olmayacak"
fi

echo
echo "--- eklenti satirlari ---"
grep -E 'claude-pet' "$LOG" || echo "(henuz cikti yok)"
echo
echo "Test penceresi:"
echo "    WAYLAND_DISPLAY=$WL_DISPLAY DBUS_SESSION_BUS_ADDRESS=\"\$($0 --bus)\" gnome-calculator &"
echo "Eklentiyi bu oturumda yonetmek icin:"
echo "    export DCONF_PROFILE=$PROFIL DBUS_SESSION_BUS_ADDRESS=\"\$($0 --bus)\""
