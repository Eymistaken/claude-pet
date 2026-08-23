# Faz 1 — Sprite motoru

> Bu dosyanın tamamını Claude Code'a yapıştır.

---

`docs/PLAN.md`, `docs/ANIMASYON.md` ve `CLAUDE.md` dosyalarını oku. Faz 0
bitmiş olmalı: sürüklenebilir dikdörtgen çalışıyor.

Bu fazda dikdörtgenin yerini maskot alıyor. `assets/animations.json` yükleniyor,
kareler Cairo ile çiziliyor, `holds` süreleriyle oynatılıyor.

## Yazılacak dosyalar

**`src/lib/sprite.js`** — bir kareyi çizer.

- Kare, `h` tane `w` uzunluğunda satır dizisi. Karakterler `#` `o` `L` `.`.
- **Hücre hücre çizme.** Her satırı yatay şeritlere böl (aynı karakterin
  ardışık dizisi) ve şerit başına tek `cr.rectangle()` çağır. 53×37'lik bir
  karede bu 1961 yerine ~200 çağrı demek.
- Şeritleri karaktere göre grupla ki `cr.setSourceRGBA` sık sık değişmesin:
  önce bütün `#` şeritleri, sonra `o`, sonra `L`.
- Ölçek: hücre boyutu = `baseCell * St.ThemeContext.get_for_stage(global.stage).scale_factor`.
  `baseCell` şimdilik sabit 3 olsun.
- Kareleri yüklerken bir kez ön-hesap yap (şerit listesi çıkar) ve sakla;
  her repaint'te yeniden hesaplama.

**`src/lib/animations.js`** — `assets/animations.json` yükleyici.

- Eklenti dizininden oku (`this.path` / `Gio.File`).
- `try/catch`; dosya bozuksa boş bir varsayılan animasyonla devam et ve
  `console.warn` ile bildir. Shell'i düşürme.
- `holds` yoksa hepsini 1 varsay.
- Her animasyon için toplam süreyi ve şerit ön-hesabını hazırla.

**`src/lib/player.js`** — kare zamanlaması.

- `play(name)`, `stop()`, `currentFrame()`.
- Kare süresi = `1000 / fps * holds[i]` milisaniye.
- `GLib.timeout_add` kullan, `requestAnimationFrame` yok.
- **Boştayken zamanlayıcı tamamen dursun.** Tek karelik ya da bittiği yerde
  duran bir animasyonda timeout kurma.
- `loop: false` biten animasyon son karesinde kalsın.
- Her timeout'un id'sini sakla; `stop()` ve `disable()` hepsini kaldırsın.

**`src/extension.js`** — güncelle.

- Geçici `St.Widget` yerine `St.DrawingArea`; `repaint` sinyalinde
  `sprite.js`'i çağır, sonunda `cr.$dispose()`.
- Actor boyutu = kare boyutu × hücre. Sürükleme ve konum kaydı korunsun.
- Başlangıçta `laptop_code` animasyonunu döngüde oynat (geçici, Faz 4'te
  durum makinesi devralacak).

**`tools/preview.js`** — bağımsız önizleyici. `Makefile`'a `preview` hedefi.

- `gjs` ile çalışan, GTK4 penceresi açan küçük bir program.
- `assets/animations.json`'daki bütün animasyonları ızgara hâlinde çizsin,
  bir de seçili animasyonu oynatsın.
- Aynı çizim mantığını kullansın — `sprite.js`'i kopyalama, içeri al
  (gerekiyorsa çizim fonksiyonunu shell'e bağımlı olmayacak şekilde ayır:
  ölçek faktörünü parametre olarak al, `global.stage`'e dokunma).
- **Bu araç sanat iterasyonunun tamamını taşıyacak.** `make nested` yavaş;
  poz kontrolü buradan yapılacak. Düzgün çalıştığından emin ol.

## Kısıtlar

- `assets/animations.json`'ı **değiştirme**. O bir varlık, kod değil.
- Hook'lara, duruma, laptop katmanına bu fazda girme.
- PNG üretme, sprite sheet yazma. Çizim doğrudan JSON'dan.

## Bitti sayılma koşulu

- [ ] `gjs tools/preview.js` bir pencere açıyor ve 35 kare görünüyor
- [ ] Önizleyicideki karakterin dört bacağı da gövdeye bağlı
- [ ] Laptop kareleri (`L` hücreleri) doğru yerde çiziliyor
- [ ] `make nested` içinde maskot ekranda, animasyon dönüyor
- [ ] Animasyonun ritmi doğru: açılış duruşu belirgin biçimde uzun duruyor
      (26 kare), hareket kısmı hızlı akıyor
- [ ] Maskot sürüklenebiliyor, konumu korunuyor
- [ ] Animasyon dururken (tek kare) CPU kullanımı sıfıra iniyor —
      `top` ya da `htop` ile gnome-shell'e bak
- [ ] Devre dışı bırakınca kalıntı ve log uyarısı yok

Önizleyicinin ekran görüntüsünü al ve `docs/ANIMASYON.md`'deki beat tablosuyla
karşılaştır: bütün beat'ler orada mı?
