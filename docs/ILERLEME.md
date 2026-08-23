# İlerleme

Her faz bitince Claude Code buraya bir bölüm ekler. Bir sonraki oturum önce
buraya bakıp nerede kalındığını anlar.

Biçim:

```markdown
## Faz N — <ad>            <tarih>

Yapılanlar
- ...

Doğrulama
- [x] <madde>  → ne görüldü

Notlar / bilinen eksikler
- ...
```

---

## Faz 0 — İskelet ve geliştirme döngüsü            2026-08-23

Yapılanlar
- `src/metadata.json`, `src/schemas/…claude-pet.gschema.xml` (`position-x`,
  `position-y`, varsayılan -1), `src/extension.js`, `Makefile`,
  `tools/nested.sh`.
- Dikdörtgen 96×96 `#D06A4B`, `addChrome(affectsStruts:false,
  affectsInputRegion:true, trackFullscreen:false)`, sağ alta yerleşiyor,
  sürüklenebiliyor, konum GSettings'e yazılıyor, ekran dışına taşarsa
  monitör içine sıkıştırılıyor.
- `disable()` grab'i bırakır, sinyalleri koparır, chrome'u söker, actor'ü
  yok eder, alanları `null`'lar.

Prompt'tan üç sapma — hepsi ölçümle gerekçeli:

1. **`Clutter.DragAction` GNOME 46'da YOK.** Prompt onu söylüyordu; Mutter'ın
   Clutter-14 çatalında sınıf tanımsız (ölçüldü: `typeof` → `undefined`;
   `ClickAction`/`PanAction` duruyor). Kabuğun kendi yolu kullanıldı:
   `global.stage.grab()` + `button-press`/`motion`/`button-release` sinyalleri,
   `grab.dismiss()` ile bırakma — `ui/screenshot.js` ve `ui/slider.js` böyle
   yapıyor.
2. **`make nested` tek satır değil, `tools/nested.sh`.** Gerekçe:
   `dbus-run-session` her koşumda ~13 yetim servis bırakıyor ve
   `fs.inotify.max_user_instances` dolunca `Gio.FileMonitor` SESSİZCE çalışmaz
   oluyor (Pcbridge'de ölçülmüş; Faz 3'ün tamamı FileMonitor üstüne kurulu).
   Betik her koşumda topluyor; ayrıca PID dosyası kullanıyor, çünkü
   `pkill -f 'gnome-shell --nested'` çağıranı öldürüyor.
3. **Nested oturum izole dconf kullanıyor** (`DCONF_PROFILE` →
   `user-db:claudepet_nested`). Paylaşılan veritabanında test edilmemiş bir
   eklentiyi etkinleştirmek gerçek masaüstünü de riske atardı.
   Not: veritabanı adında tire OLAMAZ — dconf yazıcısının D-Bus nesne yolu
   addan türüyor ve `gsettings set` tire ile kilitleniyor.

Doğrulama
- [x] `make nested` iç içe oturum açıyor  → 1280x800 sanal monitör, pencere
      ekranda; log `Using Wayland display name 'claude-pet-nested'`
- [x] Eklenti etkinleşiyor, dikdörtgen görünüyor  → `etkin · konum (1160, 680)`
      (1280−96−24, 800−96−24 ile birebir); ekran görüntüsünde sağ altta
      turuncu dikdörtgen, pikselden ölçüldü: tam 96×96, `#D06A4B`
- [x] Dışına tıklayınca altındaki pencere tıklanıyor  → pet hesap makinesinin
      "7" düğmesinin üstüne sürüklendi. Pet'in üstüne tıklandı → ekran BOŞ
      kaldı (tıklama pencereye gitmedi). Kenarından 20 px dışarıdaki "8"e
      tıklandı → ekranda **"8"** belirdi. "78" değil "8" olması iki yönü
      birden kanıtlıyor.
- [x] Dikdörtgen sürüklenebiliyor  → (1160,680) → (455,521); imleç (503,569)
      eksi (48,48) kavrama farkı = (455,521), matematik birebir tutuyor
- [x] Sürükleyip kapatıp açınca aynı yerde  → `disable`/`enable` sonrası
      `etkin · konum (455, 521)`; kabuk tamamen yeniden başlatıldığında da
      aynı satır
- [x] Tam ekran pencerede hâlâ görünüyor  → `eog --fullscreen`, nested üst
      çubuk kayboldu, pet resmin üstünde duruyor (ekran görüntüsü)
- [x] Logda eklentiyle ilgili hata/uyarı yok  → claude-pet geçen tüm satırlar:
      `etkin`, `konum kaydedildi`, `kapatıldı` — üçü de Message, tek uyarı yok
- [x] Devre dışı bırakınca kalıntı yok  → `kapatıldı`, ekran görüntüsünde
      pet gitmiş, örttüğü "C"/"7"/"4" düğmeleri geri gelmiş

Ek doğrulama (bu ortama özgü)
- [x] Gerçek masaüstü hiç etkilenmedi  → gerçek oturumun
      `enabled-extensions` listesinde claude-pet yok
- [x] Yetim servis sızıntısı yok  → `make nested-kill` 21 servis topladı,
      inotify 61/128 → 60/128 (başlangıç seviyesine döndü)

Notlar / bilinen eksikler
- **`affectsInputRegion` Wayland'de çalışmıyor.** `ui/layout.js`
  `_updateRegions()` içindeki koşul: `wantsInputRegion = … &&
  !Meta.is_wayland_compositor()`. Yani Wayland'de girdi yönlendirmesini
  sıradan Clutter *picking* yapıyor. Sonuç davranış istediğimiz gibi, ama
  mekanizma farklı — Faz 2 için önemli: laptop parçasını tıklama yutmaz
  yapan şey `reactive: false`, `affectsInputRegion: false` değil.
- Sürükleme eşiği yok: pet'e tek tıklamak da bir "sürükleme" sayılıp konumu
  (değişmemiş hâliyle) yeniden yazıyor. Zararsız ama Faz 5'te eşik eklenebilir.
- Nested'de gerçek monitör yok; çoklu monitör sıkıştırma mantığı Faz 5'te
  `MUTTER_DEBUG_NUM_DUMMY_MONITORS=2` ile ayrıca denenmeli.

<!-- Sıradaki: Faz 1 — prompts/faz-1-sprite-motoru.md -->
