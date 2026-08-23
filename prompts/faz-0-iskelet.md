# Faz 0 — İskelet ve geliştirme döngüsü

> Bu dosyanın tamamını Claude Code'a yapıştır.

---

`docs/PLAN.md` ve `CLAUDE.md` dosyalarını oku, sonra Faz 0'ı uygula.

Bu fazın amacı maskot değil. Amaç iki şey: (1) ekranda duran, sürüklenebilen,
etrafı tıklama geçiren bir dikdörtgen; (2) **her değişikliği oturum kapatmadan
görebileceğim bir geliştirme döngüsü.** İkincisi olmadan proje ilerlemez, o
yüzden onu önce kur ve önce doğrula.

## Yazılacak dosyalar

**`src/metadata.json`**
```json
{
  "uuid": "claude-pet@eymistaken.local",
  "name": "Claude Pet",
  "description": "Claude Code'un durumunu masaüstünde bir maskotla gösterir.",
  "shell-version": ["46"],
  "settings-schema": "org.gnome.shell.extensions.claude-pet",
  "version": 1
}
```

**`src/schemas/org.gnome.shell.extensions.claude-pet.gschema.xml`**
Şimdilik yalnızca `position-x` ve `position-y` (integer, varsayılan -1 =
"henüz konmadı, sağ alta yerleştir").

**`src/extension.js`** — GNOME 45+ ESM biçimi:
```js
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
```
`export default class extends Extension { enable() {...} disable() {...} }`

`enable()` içinde:
- 96×96 boyutunda, `#D06A4B` arka planlı, köşeleri hafif yuvarlatılmış bir
  `St.Widget` oluştur (bu geçici — Faz 1'de yerini çizim alanı alacak)
- `reactive: true`
- Sahneye ekle:
  ```js
  Main.layoutManager.addChrome(this._pet, {
      affectsStruts: false,
      affectsInputRegion: true,
      trackFullscreen: false,
  });
  ```
- Kaydedilmiş konuma yerleştir; konum yoksa birincil monitörün sağ altına
- `Clutter.DragAction` ile sürüklenebilir yap; sürükleme bitince konumu
  GSettings'e yaz
- Ekran dışına düşerse monitör sınırlarına geri sıkıştır

`disable()` içinde: sinyal bağlantılarını kes, `Main.layoutManager.removeChrome`
çağır, actor'ü `destroy()` et, bütün alanları `null` yap. Hiçbir şey arkada
kalmasın.

**`Makefile`** — şu hedeflerle:

| Hedef | Ne yapar |
|---|---|
| `nested` | `dbus-run-session -- gnome-shell --nested --wayland` |
| `logs` | `journalctl -f -o cat /usr/bin/gnome-shell` |
| `install` | şemayı derle, `src/`i `~/.local/share/gnome-shell/extensions/claude-pet@eymistaken.local/` altına kopyala |
| `enable` / `disable` | `gnome-extensions enable/disable` |
| `uninstall` | eklenti dizinini sil |
| `pack` | `gnome-extensions pack` ile `.zip` üret |

`install` şemayı `glib-compile-schemas` ile derlesin. Sudo kullanma.

## Kısıtlar

- Yalnızca yukarıdaki dosyalara dokun. `src/lib/`, `hooks/`, `assets/`
  bu fazda boş kalıyor.
- Maskot çizme, animasyon yapma, hook'lara bakma. Sadece dikdörtgen.
- `disable()` sızıntısı bu projede birinci sınıf hata; baştan doğru yaz.

## Bitti sayılma koşulu

Aşağıdakileri **kendin çalıştırıp gördükten sonra** bitti de. Her biri için ne
gördüğünü yaz.

- [ ] `make nested` iç içe bir GNOME oturumu açıyor
- [ ] Eklenti o oturumda etkinleştirilebiliyor, dikdörtgen görünüyor
- [ ] Dikdörtgenin **dışına** tıklayınca altındaki pencere tıklanıyor
      (iç içe oturumda bir pencere aç ve dene)
- [ ] Dikdörtgen fareyle sürüklenebiliyor
- [ ] Sürükleyip eklentiyi kapatıp açınca aynı yerde beliriyor
- [ ] Tam ekran bir pencere açıkken dikdörtgen hâlâ görünüyor
- [ ] `make logs` çıktısında eklentiyle ilgili hata veya uyarı yok
- [ ] Eklentiyi devre dışı bırakınca ekranda kalıntı yok, logda uyarı yok

Ekran görüntüsü al ve bak. "Muhtemelen çalışıyor" kabul edilmez.

## Not düş, yapma

Bu faz sırasında iyileştirme fırsatı görürsen uygulama — `docs/PLAN.md`'nin
sonuna "Sonraki fazlara notlar" başlığı altına yaz.
