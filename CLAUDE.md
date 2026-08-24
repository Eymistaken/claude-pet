# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# claude-pet

GNOME Shell 46 eklentisi. Claude Code'un durumunu masaüstünde bir maskotla
gösterir.

> **`appimage` dalı.** Aynı maskotun KDE Plasma / Sway / Hyprland / COSMIC
> sürümü ayrı bir dalda duruyor: `wlr-layer-shell` üzerinde çalışan bağımsız
> bir GTK4 uygulaması ve tek dosyalık AppImage. **`src/lib/` ve
> `assets/animations.json`ı bu dalla PAYLAŞIYOR** — aşağıdaki 2. kural bu
> yüzden pazarlık konusu değil.

## Ortam

Zorin OS 18.1 (Ubuntu 24.04) · GNOME Shell 46.0 · **Wayland** · gjs 1.80.2

Eklenti kimliği: `claude-pet@eymistaken.local`
Şema: `org.gnome.shell.extensions.claude-pet`

## Mutlak kurallar

1. **Bu kod gnome-shell process'inin İÇİNDE çalışır.** Yakalanmamış bir
   exception ya da sonsuz döngü kullanıcının tüm masaüstünü düşürür. Dosya
   okuma ve `JSON.parse` her zaman `try/catch` içinde. Bozuk veri pet'i
   susturur, shell'i değil.

2. **`src/lib/` KABUĞA BAĞIMLI OLAMAZ.** Sekiz modülün hiçbirinde `St`,
   `Main`, `global`, `Meta` geçmiyor; yalnızca GLib/Gio/GObject. Üç tüketicisi
   var: `src/extension.js`, `tools/preview.js` ve `appimage` dalındaki GTK4
   uygulaması. Oraya kabuğa bağlı tek bir satır eklemek son ikisini kırar.
   Kabuğa özgü kod `src/extension.js`e.

3. **`disable()` her şeyi söker.** Kurulan her `GLib.timeout_add`,
   `connect()`, `Gio.FileMonitor` ve chrome actor `disable()` içinde
   kaldırılmalı ve referansı `null`'lanmalı. Kilit ekranı `disable()`/`enable()`
   çağırır; sızıntı orada hayalet actor olarak birikir.

4. **Wayland'de gnome-shell yeniden başlatılamaz.** `Alt+F2` → `r` yok.
   Test için `make nested`; asıl oturumu bozma.

5. **Girdi geçirgenliği pazarlık konusu değil.** Karakterin dikdörtgeni dışında
   hiçbir piksel tıklama yutmayacak. Görsel bir parça eklerken (laptop, gölge,
   baloncuk) mutlaka ayrı bir actor olarak ve `affectsInputRegion: false`,
   `reactive: false` ile ekle. Wayland'de geçirgenliği sağlayan şey ikincisi;
   birincisi **hiçbir şey yapmıyor** (ölçüldü — `README.md`'deki nota bak).

6. **Türkçe yaz — ama README İNGİLİZCE.** Kod yorumları, commit mesajları,
   `docs/`, `prompts/` ve bu dosya Türkçe. Değişken ve fonksiyon adları
   İngilizce kalsın. `README.md` **tamamen İngilizce** (dışarıya bakan yüz);
   onu Türkçeye çevirme. İçinde geçen Türkçe log satırları alıntıdır —
   koddaki gerçek metin o, çevrilmez.

7. **Faz dışına çıkma.** Prompt dosyası hangi dosyalara dokunulacağını
   söylüyor. Başka bir yerde iyileştirme fırsatı görürsen yap deme, not düş.

## Komutlar

```sh
# --- doğrulama (her değişiklikten sonra) ---
make check              # paket kontrolü: metadata, varlık biçimi, şema --strict,
                        #   tüm JS'in gjs Reflect.parse'ı, Python sözdizimi
make replay             # dört test dosyası: 21 + 50 + 26 + 13 = 110 iddia
gjs -m tests/director.js # TEK test dosyası (replay|director|layout|presence)

# --- geliştirme döngüsü ---
make nested             # izole test oturumu (gerçek masaüstüne dokunmaz)
make nested-log         # o oturumun logu        make nested-kill
make preview            # kareleri kabuğa dokunmadan bağımsız pencerede çiz
make gif                # docs/pet.gif (Pillow ister)

# --- gerçek oturum ---
make install            # ~/.local/share/gnome-shell/extensions altına kur
make enable / disable   # GERÇEK oturum          make prefs
make logs               # gerçek oturumun gnome-shell logu
make pack               # dağıtılabilir .shell-extension.zip

# --- hook'lar ---
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
Main.layoutManager.addTopChrome(...)   karakter: input alır · laptop: almaz
```

`lib/presence.js` bu zincirin dışında ve pet'in **var olma şartı**: `/proc`
içinde `claude` ya da `claude-desktop` süreci var mı. Pencereye bakan bir
yöntem (`Shell.AppSystem`) terminalde açılan Claude Code'u kaçırırdı. Yoklama
iki kademeli (açıkken tek dosya ~0.05 ms / 2 sn, kapalıyken tam tarama
~5.7 ms / 8 sn).

`lib/layout.js` konum aritmetiğinin tamamı: monitör seçimi, monitöre göreli
kayıt, ekran içine sıkıştırma. Monitörleri düz `{x, y, width, height}` olarak
alıyor, yani kabuk açmadan sınanabiliyor (`tests/layout.js`).

**`addTopChrome`, `addChrome` değil** ve **unredirect kapalı tutuluyor** — tam
ekranda görünmenin iki şartı bu, ikisi de ölçülerek bulundu. Gerekçesi
`src/extension.js::_holdUnredirect` başlığında ve `README.md`'de.

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

## Çizim

- Kareyi hücre hücre çizme; her satırı **yatay şeritlere** böl (aynı karakterin
  ardışık dizisi) ve tek `cairo_rectangle` ile bas. 1961 çağrı yerine ~200.
  Şeritlere ayırma YÜKLEME anında bir kez yapılıyor, her repaint'te değil.
- Actor boyutu **kare başına değil ANIMASYON başına** değişiyor: kutu o klibin
  bütün karelerinin birleşimi. Sıkı kutu neredeyse her karede değişiyor (35
  karelik `laptop_code`'da 7 ayrı kutu) ve her allocation değişikliği
  `_queueUpdateRegions()` tetiklediği için 15 fps'de görünür titreme demek.
- Ölçek `St.ThemeContext.get_for_stage(global.stage).scale_factor` üzerinden.
  `St` FİZİKSEL piksele çiziyor — bu, `appimage` dalındaki GTK4 sürümünden
  ayrıldığı noktalardan biri (GTK4 mantıksal piksele çiziyor).
- GJS'de Cairo bağlamı elle `$dispose()` edilmezse **sızıyor**.
- Göz açık renkli bir pencerenin üstünde kaybolmasın diye şeffaf değil, `o`
  rengiyle dolu çizilir.

## Doğrulama beklentisi

Bir işi bitirdim demeden önce:

- `make check` ve `make replay` → 110/110.
- `make nested` içinde eklentiyi etkinleştir, **ekran görüntüsü al ve bak**.
- Karakterin dışına tıklayıp altındaki pencerenin tıklandığını doğrula.
- Eklentiyi devre dışı bırak, `make logs` çıktısında hata/uyarı olmadığını
  doğrula.
- Prompt dosyasındaki "Bitti sayılma koşulu" maddelerini tek tek işaretle.
- `src/lib/`e dokunulduysa `appimage` dalını da düşün: orası aynı dosyaları
  kullanıyor.

## Yol haritası

Fazlar (0–6) bitti; sonrasında iki ekleme yapıldı (tam ekran görünürlüğü ve
genel açma/kapama anahtarı). Ne yapıldığı ve **neden öyle yapıldığı**
`docs/ILERLEME.md`'de faz faz yazılı — bir kararı değiştirmeden önce oraya
bak, çoğu ölçümle gerekçeli. Kararların özeti `docs/PLAN.md`, faz komutları
`prompts/`, tek komutla ilerleme akışı `UYGULA.md`.
