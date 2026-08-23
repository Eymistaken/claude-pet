# claude-pet

GNOME Shell 46 eklentisi. Claude Code'un durumunu masaüstünde bir maskotla
gösterir.

Yol haritası: `docs/PLAN.md`. Her fazın hazır komutu: `prompts/faz-N-*.md`.
Bir faza başlamadan önce o fazın prompt dosyasını ve PLAN.md'nin ilgili
bölümünü oku.

## Ortam

Zorin OS 18.1 (Ubuntu 24.04) · GNOME Shell 46.0 · **Wayland** · gjs 1.80.2

Eklenti kimliği: `claude-pet@eymistaken.local`
Şema: `org.gnome.shell.extensions.claude-pet`

## Mutlak kurallar

1. **Bu kod gnome-shell process'inin İÇİNDE çalışır.** Yakalanmamış bir
   exception ya da sonsuz döngü kullanıcının tüm masaüstünü düşürür. Dosya
   okuma ve `JSON.parse` her zaman `try/catch` içinde. Bozuk veri pet'i
   susturur, shell'i değil.

2. **`disable()` her şeyi söker.** Kurulan her `GLib.timeout_add`,
   `connect()`, `Gio.FileMonitor` ve chrome actor `disable()` içinde
   kaldırılmalı ve referansı `null`'lanmalı. Kilit ekranı `disable()`/`enable()`
   çağırır; sızıntı orada hayalet actor olarak birikir.

3. **Wayland'de gnome-shell yeniden başlatılamaz.** `Alt+F2` → `r` yok.
   Test için `make nested`; asıl oturumu bozma.

4. **Girdi geçirgenliği pazarlık konusu değil.** Karakterin dikdörtgeni dışında
   hiçbir piksel tıklama yutmayacak. Görsel bir parça eklerken (laptop, gölge,
   baloncuk) mutlaka ayrı bir actor olarak ve `affectsInputRegion: false`,
   `reactive: false` ile ekle.

5. **Türkçe yaz.** Kod yorumları, commit mesajları ve açıklamalar Türkçe.
   Değişken ve fonksiyon adları İngilizce kalsın.

6. **Faz dışına çıkma.** Prompt dosyası hangi dosyalara dokunulacağını
   söylüyor. Başka bir yerde iyileştirme fırsatı görürsen yap deme, not düş.

## Mimari

```
Claude Code hook'ları
        │  her olayda bir JSON dosyası
        ▼
~/.local/state/claude-pet/inbox/<ns>-<olay>.json
        │  Gio.FileMonitor — yoklama YOK
        ▼
   lib/tracker.js      oturum başına durum → tek agregat durum
        ▼
   lib/states.js       durum + tool_name → animasyon adı (TABLO, if zinciri değil)
        ▼
   lib/player.js       kare zamanlaması, hold süreleri
        ▼
   lib/sprite.js       Cairo ile kareyi çizer
        ▲
   assets/animations.json
        ▼
Main.layoutManager.addChrome(...)   karakter: input alır · laptop: almaz
```

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
- Ölçek `St.ThemeContext.get_for_stage(global.stage).scale_factor` üzerinden.
- Göz açık renkli bir pencerenin üstünde kaybolmasın diye şeffaf değil, `o`
  rengiyle dolu çizilir.

## Geliştirme döngüsü

```sh
make nested     # iç içe test oturumu, asıl masaüstüne dokunmaz
make logs       # journalctl -f -o cat /usr/bin/gnome-shell
make preview    # kareleri shell'e hiç dokunmadan bağımsız pencerede çiz
make install    # ~/.local/share/gnome-shell/extensions altına kur
make pack       # dağıtılabilir .zip
```

Sanat üzerinde çalışırken `make preview`, `make nested` değil — çok daha hızlı.

## Doğrulama beklentisi

Bir fazı bitirdim demeden önce:

- `make nested` içinde eklentiyi etkinleştir, ekran görüntüsü al ve **bak**
- Karakterin dışına tıklayıp altındaki pencerenin tıklandığını doğrula
- Eklentiyi devre dışı bırak, `make logs` çıktısında hata/uyarı olmadığını
  doğrula
- Prompt dosyasındaki "Bitti sayılma koşulu" maddelerini tek tek işaretle
