# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# claude-pet

Claude Code'un durumunu masaüstünde bir maskotla gösterir. **İki sürümü var**
ve ikisi de aynı depoda:

| | Nerede çalışır | Giriş noktası |
|---|---|---|
| GNOME Shell 46 eklentisi | GNOME · Wayland | `src/extension.js` |
| Bağımsız uygulama / AppImage | KDE Plasma · Sway · Hyprland · COSMIC (Wayland) | `app/main.js` |

Ayrım tek bir protokole dayanıyor: GNOME'un kompozitörü Mutter
`wlr-layer-shell` desteklemiyor, KWin ve wlroots destekliyor.

## Ortam

Geliştirme makinesi: Zorin OS 18.1 (Ubuntu 24.04) · GNOME Shell 46.0 ·
**Wayland** · gjs 1.80.2 · GTK 4.14.5

- Eklenti kimliği `claude-pet@eymistaken.local`, şeması
  `org.gnome.shell.extensions.claude-pet` (dconf).
- Uygulama kimliği `io.github.eymistaken.ClaudePet`, şeması aynı adda ama
  **dconf değil keyfile** arka ucunda: `~/.config/claude-pet/ayarlar.conf`.
  Anahtarlar ikisinde de birebir aynı.

## Mutlak kurallar

1. **`src/extension.js` gnome-shell process'inin İÇİNDE çalışır.**
   Yakalanmamış bir exception ya da sonsuz döngü kullanıcının tüm masaüstünü
   düşürür. Dosya okuma ve `JSON.parse` her zaman `try/catch` içinde. Bozuk
   veri pet'i susturur, shell'i değil.

2. **`src/lib/` KABUĞA BAĞIMLI OLAMAZ — bu artık iki tüketicisi olan bir
   sözleşme.** Sekiz modülün hiçbirinde `St`, `Main`, `global`, `Meta`
   geçmiyor; yalnızca GLib/Gio/GObject. Oraya kabuğa bağlı tek bir satır
   eklemek AppImage sürümünü kırar. Kabuğa özgü kod `src/extension.js`e,
   GTK'ya özgü kod `app/`e.

3. **`disable()` her şeyi söker.** Kurulan her `GLib.timeout_add`,
   `connect()`, `Gio.FileMonitor` ve chrome actor `disable()` içinde
   kaldırılmalı ve referansı `null`'lanmalı. Kilit ekranı `disable()`/`enable()`
   çağırır; sızıntı orada hayalet actor olarak birikir.

4. **Wayland'de gnome-shell yeniden başlatılamaz.** `Alt+F2` → `r` yok.
   Test için `make nested`; asıl oturumu bozma.

5. **Girdi geçirgenliği pazarlık konusu değil.** Karakterin dikdörtgeni
   dışında hiçbir piksel tıklama yutmayacak. İki sürümde iki ayrı mekanizma
   — aşağıdaki "Girdi geçirgenliği" bölümüne bak; yeni bir görsel parça
   eklerken ikisini de gözet.

6. **Dil: içeride Türkçe, KULLANICIYA GÖRÜNEN HER ŞEY İNGİLİZCE.**

   | Türkçe | İngilizce |
   |---|---|
   | kod yorumları, commit mesajları | `README.md`, `README-appimage.md` |
   | `docs/`, `prompts/`, bu dosya | ayarlar penceresi (`src/prefs.js`, `app/tercihler.js`) |
   | `console.log/warn/error` — log satırları | sağ tık menüsü, bildirimler |
   | gschema `<summary>`/`<description>` | `.desktop` `Name=`/`Comment=` |
   | | `printerr` ile kullanıcıya basılan hatalar |

   Değişken, fonksiyon ve `Gio.Action` adları İngilizce/Türkçe karışık ama
   **kullanıcıya görünmüyor** — `app.konum-sifirla` gibi bir eylem adını
   çevirmek gereksiz. README'lerde geçen Türkçe log satırları alıntıdır;
   koddaki gerçek metin o, çevrilmez. README'lerdeki ayar tablosuyla
   koddaki etiketler **birebir aynı olmalı**.

## Komutlar

```sh
# --- doğrulama (her değişiklikten sonra) ---
make check              # paket kontrolü: metadata, varlık biçimi, şema --strict,
                        #   TÜM JS'in gjs Reflect.parse'ı, Python sözdizimi
make replay             # dört test dosyası: 21 + 50 + 26 + 13 = 110 iddia
gjs -m tests/director.js # TEK test dosyası (replay|director|layout|presence)

# --- GNOME eklentisi ---
make nested             # izole test oturumu (gerçek masaüstüne dokunmaz)
make nested-log         # o oturumun logu        make nested-kill
make install            # ~/.local/share/gnome-shell/extensions altına kur
make enable / disable   # GERÇEK oturum          make prefs
make logs               # gerçek oturumun gnome-shell logu
make pack               # dağıtılabilir .shell-extension.zip

# --- KDE / AppImage sürümü ---
make appimage           # sudo'suz sysroot → gtk4-layer-shell → AppDir → AppImage
make app-run            # AppImage'sız yerelde çalıştır (GNOME'da "desteklenmiyor"
                        #   deyip 2 ile çıkar — beklenen davranış)
make ikon               # simgeyi assets/animations.json'dan yeniden üret

# --- sanat ve hook'lar ---
make preview            # kareleri kabuğa dokunmadan bağımsız pencerede çiz
make gif                # docs/pet.gif (Pillow ister)
make hooks / unhooks / hooks-status
make replay-canli SENARYO=tur|izin|ratelimit   # CANLI pet'i senaryoyla sür
```

İki test kancası — ikisi de gerçek ortama dokunmadan denemek için:

```sh
CLAUDE_PET_STATE_DIR=/tmp/pet-test   # hook'ların olay bıraktığı dizin
CLAUDE_PET_PROCESSES=cpetsahte       # "Claude açık mı" ölçütünü değiştirir
```

İkincisi olmadan "pet gizlensin" hâlini denemek, deneyen kişinin kendi
Claude'unu kapatmasını gerektirirdi. **`sleep` sahte Claude olarak
KULLANILAMAZ** (sistemde her an başkasının `sleep`'i çalışıyor olabilir) ve ad
15 karakteri geçemez (`comm` kırpılıyor) — ikisi de ölçülerek öğrenildi.

Sanat üzerinde çalışırken `make preview`, `make nested` değil — çok daha hızlı.

## Mimari

Zincir iki sürümde de aynı; değişen yalnızca son halka.

```
Claude Code hook'ları
        │  her olayda bir JSON dosyası
        ▼
~/.local/state/claude-pet/inbox/<ns>-<olay>.json
        │  Gio.FileMonitor — yoklama YOK
        ▼
   lib/tracker.js    oturum başına durum → tek agregat durum (son olay kazanır)
        ▼
   lib/states.js     durum → klip DİZİSİ (TABLO, if zinciri değil):
        │              dizi(A→B) = ÇIKIŞ[A] + GİRİŞ[B] + DÖNGÜ[B]
        ▼
   lib/director.js   hangi klip, ne zaman — animasyonu ORTASINDAN KESMEZ
        ▼
   lib/player.js     kare zamanlaması, `holds` süreleri, boştayken SIFIR timer
        ▼
   lib/sprite.js     Cairo ile şerit şerit çizer        ← assets/animations.json
        ▼
  ┌─────────────────────────┴─────────────────────────┐
  src/extension.js                              app/pencere.js
  Main.layoutManager.addTopChrome(...)          wlr-layer-shell OVERLAY katmanı
  karakter + laptop = İKİ actor                 TEK pencere + giriş bölgesi
```

`lib/presence.js` bu zincirin dışında ve pet'in **var olma şartı**: `/proc`
içinde `claude` ya da `claude-desktop` süreci var mı. Pencereye bakan bir
yöntem terminalde açılan Claude Code'u kaçırırdı. Yoklama iki kademeli
(açıkken tek dosya ~0.05 ms / 2 sn, kapalıyken tam tarama ~5.7 ms / 8 sn).

`lib/layout.js` konum aritmetiğinin tamamı: monitör seçimi, monitöre göreli
kayıt, ekran içine sıkıştırma. Monitörleri düz `{x, y, width, height}` olarak
alıyor — GNOME'da `Main.layoutManager.monitors`, GTK'da `app/ekran.js`.

### İki sürümdeki dört ölçülmüş fark

Bunlar bilinçli sapmalar, kopyalanmayı bekleyen tutarsızlıklar değil.
Gerekçeleri `app/pencere.js` başlığında ve `docs/ILERLEME.md` Faz 7'de.

| | Eklenti (GNOME) | Uygulama (KDE) |
|---|---|---|
| **Girdi geçirgenliği** | `affectsInputRegion` Wayland'de HİÇBİR ŞEY yapmıyor; geçirgenliği sağlayan tek şey laptobun ayrı ve `reactive: false` bir actor olması | `Gdk.Surface.set_input_region()` gerçekten uygulanıyor; tek pencere, giriş bölgesi = karakter kutusu |
| **Tam ekran** | `Meta.disable_unredirect_for_display()` şart, bedeli tam ekran oyunda birkaç fps | `overlay` katmanı protokol gereği üstte, bedel yok |
| **Ölçek** | `cell = ayar × scale_factor` (St fiziksel piksele çiziyor) | `cell = ayar` (GTK4 mantıksal piksele çiziyor, ölçekleme GSK'nın işi) |
| **Ayar deposu** | GSettings + dconf | GSettings + **keyfile** arka ucu, şema paketin içinden okunuyor |

## Animasyon varlıkları

Kareler kodda değil, `assets/animations.json` içinde:

```json
{ "w":53, "h":37,
  "palette": {"#":"#D87656","o":"#2B2A26","L":"#8B8B8B"},
  "animations":[
    {"name":"laptop_code","fps":15,"loop":false,
     "holds":[26,1,2,...],
     "frames":[["....#####....", ...], ...]}
  ]}
```

- Her kare, `h` tane `w` uzunluğunda satır. Karakterler: `#` gövde, `o` göz,
  `L` laptop, `.` boş.
- `holds[i]`, o karenin kaç kare süreyle duracağı. Animasyonun ritmi burada;
  hepsini 1 varsayma.
- **Yeni poz eklemek kod işi değil.** Poz atölyesinde çizilir, JSON dışa
  aktarılır, bu dosyanın üstüne yazılır. `docs/KAYIT.md`'ye bak.
- Dosya değişince `make ikon` simgeyi de tazeler (simge varlıktan üretiliyor).

## Çizim

- Kareyi hücre hücre çizme; her satırı **yatay şeritlere** böl (aynı karakterin
  ardışık dizisi) ve tek `cairo_rectangle` ile bas. 1961 çağrı yerine ~200.
  Şeritlere ayırma YÜKLEME anında bir kez yapılıyor, her repaint'te değil.
- Actor/pencere boyutu **kare başına değil ANIMASYON başına** değişiyor: kutu
  o klibin bütün karelerinin birleşimi. Sıkı kutu neredeyse her karede
  değişiyor (35 karelik `laptop_code`'da 7 ayrı kutu) ve 15 fps'de yeniden
  boyutlandırmak görünür titreme demek.
- GJS'de Cairo bağlamı elle `$dispose()` edilmezse **sızıyor**.
- Göz açık renkli bir pencerenin üstünde kaybolmasın diye şeffaf değil, `o`
  rengiyle dolu çizilir.

## AppImage paketleme

`tools/appimage.sh` başlığında adım adım yazılı. Üç şey sürprizli:

1. **`gtk4-layer-shell` GJS'de `LD_PRELOAD` istiyor.** Kütüphane libwayland
   çağrılarını shim'liyor ve `libwayland-client`'tan **önce** yüklenmek
   zorunda. Python'daki `CDLL(...)` numarasının GJS'de karşılığı yok; tek yol
   `AppRun` içindeki `LD_PRELOAD`. (`liblayer-shell-preload.so` başka bir şey.)
2. **Derleme zinciri sudo'suz.** `sudo` parola istiyor ve `libgtk-4-dev` kurulu
   değil; `tools/toolchain.sh` `apt-get download` + `dpkg-deb -x` ile
   `build/toolchain/sysroot` kuruyor. `apt-cache depends --recurse`
   KULLANILAMAZ — 473 paket / 257 MB indiriyor, iki seviye yetiyor.
   `PKG_CONFIG_SYSROOT_DIR` `g-ir-scanner`ın yolunu da kaydırdığı için
   sysroot'un `usr/bin`ine sembolik bağ gerekiyor.
3. **Alt süreçlere temiz ortam.** Hook betiği konak `python3` ile çalışıyor;
   `AppRun`'ın `LD_PRELOAD`/`LD_LIBRARY_PATH`i miras kalırsa konak python
   paketlenmiş glib'i yüklemeye çalışır. `app/entegrasyon.js::temizOrtam()`.

AppImage'ın bağlandığı dizin her açılışta değişiyor: dışarıya yazılan hiçbir
yol oraya işaret edemez. Hook betiği `~/.local/share/claude-pet/` altına
kopyalanıyor, autostart `Exec=` satırında `$APPIMAGE` kullanıyor.

## Doğrulama beklentisi

Bir işi bitirdim demeden önce:

- `make check` ve `make replay` → 110/110. `src/lib` değişmediyse bu, "iki
  sürüm aynı mantığı çalıştırıyor" iddiasının kanıtı.
- Eklentiye dokunulduysa: `make nested` içinde etkinleştir, **ekran görüntüsü
  al ve bak**, karakterin dışına tıklayıp altındaki pencerenin tıklandığını
  doğrula, `make logs`'ta hata/uyarı olmadığını gör.
- Uygulamaya dokunulduysa: **bu makinede layer-shell konuşan bir kompozitör
  yok**, yani pencere davranışı yerelde sınanamıyor. `make appimage` +
  çalıştırıp "desteklenmiyor" hatasının geldiğini görmek gjs'in, 18
  typelib'in ve altı ES modülünün yüklendiğini doğruluyor — davranışı değil.
  KDE testi `README-appimage.md` sonundaki listeyle dışarıda yapılıyor.

## Sürüm çıkarmak

Sürüm numarası **`VERSION` dosyasında** ve yayının tek tetiği o. CI her
itmede derliyor; `v<VERSION>` etiketi yoksa sürüm de yayınlıyor. Yani sürüm
çıkarmak = `VERSION`ı artırıp itmek, elle yapılacak başka bir şey yok.

`v*` bu dalın (AppImage), `ext-v*` eklentinin (`master`) — aynı numaraya
gelseler bile çakışmasınlar diye. Gerisi (runner tabanı, pakette ne
doğrulanıyor) `.github/workflows/appimage.yml` başlığında.

## Yol haritası

Fazlar bitti (0–7). Ne yapıldığı ve **neden öyle yapıldığı**
`docs/ILERLEME.md`'de faz faz yazılı — bir kararı değiştirmeden önce oraya
bak, çoğu ölçümle gerekçeli. Kararların özeti `docs/PLAN.md`, faz komutları
`prompts/`, tek komutla ilerleme akışı `UYGULA.md`.
