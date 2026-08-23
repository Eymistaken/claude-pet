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

## Faz 1 — Sprite motoru            2026-08-23

Yapılanlar
- `src/lib/sprite.js` — kareyi yatay şeritlere böler ve çizer. **Kabuğa
  bağımlı değil** (`St`/`Main`/`global` geçmez, ölçek parametre); önizleyici
  aynı dosyayı kullanıyor, yani iki ayrı çizim yolu yok.
- `src/lib/animations.js` — JSON'u okur, doğrular, şeritlere derler. Bozuk
  kare atlanır ve `console.warn`'lanır; dosya tamamen bozuksa boş varsayılana
  düşülür. Shell düşmez.
- `src/lib/player.js` — `holds` süreleriyle kare zamanlaması. Her kare için
  ayrı timeout kurulur (süreler farklı), id saklanır.
- `src/extension.js` — `St.Widget` yerine `St.DrawingArea`; `repaint`'te
  `sprite.js`, sonunda `cr.$dispose()`. Ölçek
  `St.ThemeContext…scale_factor` üzerinden. Sürükleme ve konum kaydı korundu.
- `tools/preview.js` + `make preview` — GTK4 önizleyici: animasyon seçici,
  oynat/duraklat, büyük oynatma alanı ve bütün karelerin ızgarası
  (her karenin altında index ve `hold`).
- `Makefile` — `install` artık `assets/`i de eklenti dizinine kopyalıyor
  (varlık `src/` dışında duruyor ama eklenti onu kendi dizininden okuyor).
  `pack` için iki `--extra-source`: `gnome-extensions pack` yalnızca bildiği
  dosyaları alıyor, `lib/` ve `assets/` açıkça verilmezse **zip sessizce
  bozuk çıkıyor** (yakalandı: ilk paket 6 dosyaydı, `lib/` yoktu; şimdi 10).

Ölçümler
- Şerit sıkıştırması: kare başına **ortalama 49 şerit**, 1961 hücreye karşı
  **38× kazanç**. Kare başına 3 renk değişimi, 3 `fill()`.
- Zamanlama: 34 geçişin tamamı ölçüldü, **ortalama mutlak sapma 0.4 ms**,
  en kötü 2 ms.

Doğrulama
- [x] `gjs tools/preview.js` pencere açıyor, 35 kare görünüyor  → ekran
      görüntüsü alındı; başlık "laptop_code · kare 1/35 · hold 26 · 15 fps ·
      6.33 sn · 51 şerit"
- [x] Karakterin dört bacağı da gövdeye bağlı  → 4× büyütülüp bakıldı;
      bacaklar gövdenin alt kenarından kesilmiş yarıklar, kopuk parça yok.
      Gözler `o` rengiyle dolu (şeffaf değil).
- [x] Laptop kareleri doğru yerde  → kare 5-31 arasında gri `L` hücreleri:
      çıkarma, havada açılma, açılı iniş, yazma boyunca solda duruyor
- [x] `make nested` içinde maskot ekranda, animasyon dönüyor  → ekran
      görüntüsü; iki ardışık çekim arasında pet bölgesinde **760 piksel
      değişti**, kontrol bölgesinde (duvar kâğıdı) **0**
- [x] Ritim doğru  → açılış duruşu **1735 ms** ölçüldü (beklenen 1733),
      hareket kareleri ortalama 107 ms → açılış hareketten **16.2× uzun**
- [x] Maskot sürüklenebiliyor, konumu korunuyor  → (1097,665) → (377,195);
      imleç (2700,400) eksi kavrama farkı (83,73) ile birebir aynı.
      **Tam kabuk yeniden başlatmasından sonra** `etkin · konum (377, 195)`
- [x] Animasyon dururken CPU sıfıra iniyor  → nested gnome-shell CPU:
      kapalı **%0.75** · etkin+tek kare (`idle`) **%0.87** · etkin+`laptop_code`
      döngüde **%2.50**. Tek karede zamanlayıcı hiç kurulmuyor; modül testi de
      `running === false` diyor.
- [x] Devre dışı bırakınca kalıntı ve log uyarısı yok  → ekran görüntüsünde
      maskot yok; logda claude-pet geçen tek satırlar `etkin` ve `kapatıldı`

Beat karşılaştırması (`docs/ANIMASYON.md` tablosu)
35 karenin tamamı gerçek `sprite.js` ile kontak sayfasına basıldı. Sekiz
beat de yerinde: duruş (kare 0, hold 26) · cebe uzanma (1-4, sol göz çizgiye
dönüyor) · çıkarma (5-7) · havada açılma (6-9) · iniş (9-11) · dönüş (10-13) ·
yazma (14-30) · toparlanma (31-34, son kare hold 16).

Geliştirme döngüsünde düzeltilenler (hepsi `tools/nested.sh`)
1. **`disabled-extensions` `enabled-extensions`'ı eziyor.**
   `gnome-extensions disable` UUID'yi o listeye yazıyor ve kabuk, orada
   gördüğü bir UUID'yi enabled listesinden anında siliyor. Belirtisi çok kafa
   karıştırıcı: log tertemiz, hata yok, ama pet ekranda yok
   (`Durum: INITIALIZED`). Artık her koşumda `dconf reset` ediliyor.
2. **Log koşuma özel dosyaya yazılıyor.** Önceki koşumdan kalan servisler log
   dosyasını açık tutuyor ve kendi konumlarından yazmaya devam ediyor; sabit
   bir dosyayı `>` ile kısaltınca yeni kabuğun satırlarının **üzerine
   yazıyorlar**. Bir kez `[claude-pet] etkin` satırı logdan kayboldu ve kabuk
   çökmüş gibi göründü — çökme yoktu.
3. **Yetim bus daemon'ları toplanıyor.** `oturum_temizle` onları kaçırıyordu:
   dbus-daemon'ın kendi `DBUS_SESSION_BUS_ADDRESS`'i ebeveynden miras kaldığı
   için **gerçek** oturumu gösteriyor. Altı tane birikmişti. Artık `ss -lxp`
   ile soket→pid eşlenip, üzerinde canlı nested kabuk olmayanlar kapatılıyor
   (başka bir nested oturum açıksa ona dokunmaz). 6 → 1.
4. **`--bus` seçeneği.** Kabuk her yeniden başladığında D-Bus adresi
   değişiyor; eski adrese gönderilen `gnome-extensions` komutları sessizce ölü
   bir veriyoluna gidiyor. Bu bir kez yaşandı ve `disable`/`enable` hiç
   uygulanmadı.
5. **Açılış sonrası doğrulama.** Eklenti `ACTIVE` değilse kabuğun kendi
   D-Bus'ından etkinleştirilip tekrar sorulur, sonuç ekrana basılır.

Notlar / bilinen eksikler
- **GNOME Shell `enabled-extensions`/`disabled-extensions`'ın sahibidir.**
  Kabuk ayaktayken bu iki anahtarı dışarıdan yazmak sessizce geri alınıyor
  (ölçüldü: `gsettings set` 0 dönüyor, değer değişmiyor). Doğru yol kabuğa
  D-Bus'tan söylemek.
- **İzole dconf'a iki yazıcı değmesin.** Nested kabuk açıkken host tarafından
  `gsettings` ile yazmak, nested'in yazdıklarını eziyor (konum anahtarları iki
  kez böyle kayboldu). Test sırasında hep
  `DBUS_SESSION_BUS_ADDRESS="$(tools/nested.sh --bus)"` kullan.
- Bozuk varlık dosyasında pet **görünmez** oluyor (boş varsayılan kare) —
  yalnızca `console.warn` var. Görünür bir "kırık" göstergesi düşünülebilir.
- `laptop_code` varlıkta `loop: false`; Faz 1'de döngü koddan zorlanıyor.
  Faz 4'te üçe bölününce bu zorlama kalkacak.
- Ölçek açılışta bir kez okunuyor; `scale_factor` değişimini izlemek Faz 5.

<!-- Sıradaki: Faz 2 — prompts/faz-2-katman-ve-input.md -->
