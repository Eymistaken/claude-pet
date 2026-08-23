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

## Faz 2 — Katman ayrımı ve input bölgesi            2026-08-23

Yapılanlar
- `src/lib/sprite.js` — kare artık **katman katman** derleniyor.
  `KATMANLAR = {karakter: ['#','o'], laptop: ['L']}`; `compileLayer(rows, chars)`
  o katmanın şeritlerini **ve sıkı sınırlayıcı kutusunu** (hücre cinsinden,
  boşsa `null`) döndürüyor. `unionBox()` ile kutular birleştiriliyor,
  `drawLayer(cr, layer, colors, cell, origin)` tuval ofsetiyle çiziyor.
- `src/lib/animations.js` — her animasyon katman başına bir **birleşim kutusu**
  (`anim.boxes.karakter`, `anim.boxes.laptop`) taşıyor. Bozuk varlıkta da aynı
  biçim üretiliyor, çizim yolunda özel dal yok.
- `src/extension.js` — iki `St.DrawingArea`:

  | Actor | reactive | affectsInputRegion | Çizdiği |
  |---|---|---|---|
  | `claude-pet-laptop` | `false` | `false` | `L` |
  | `claude-pet-karakter` | `true` | `true` | `#`, `o` |

  Sahneye laptop önce ekleniyor (altta kalsın). Konumun tek kaynağı
  `_originX/_originY` — sprite ızgarasının (0,0) hücresinin sahnedeki yeri;
  her actor kendi kutusunun ofsetiyle oradan türüyor. Birlikte hareket
  etmeleri bu yüzden ayrı bir iş değil. GSettings'e yazılan da bu, yani
  Faz 1'in kaydettiği değerler aynı anlamda geçerli kalıyor.
- `tools/preview.js` — yeni API'ye taşındı, **"Kutular" anahtarı** eklendi:
  düz çizgi birleşim kutusu, kesikli çizgi o karenin sıkı kutusu (yeşil
  karakter, mavi laptop). Kutuların doğruluğunu kabuğa hiç dokunmadan
  görmenin en hızlı yolu.

Ölçümler
- **Kutu neden animasyon boyunca sabit:** karakterin sıkı kutusu
  `laptop_code`'un 35 karesinde **7 ayrı değer**, `duruslar_9`'un 9 karesinde
  **5 ayrı değer** alıyor. Yani "kutu değişmediyse `set_size` çağırma"
  koruması işe yaramazdı — kutu neredeyse her karede değişiyor.
- **Birleşimin bedeli:** karakter katmanında sıkı kutuya göre şişme
  `laptop_code` 1.62× · `duruslar_9` 1.46× · `idle` 1.00×. Kazanç yine de
  büyük: karakter actor'ü tam tuvalin **%47 / %55 / %33**'ü.
- **Boyutlandırma gerçekten animasyon başına:** nested'de 5 dk 36 sn koşum
  sonunda `kapatıldı · 1853 kare · 1 kez boyutlandı · 107 kez katman
  gizlendi/gösterildi`. Gerçek oturumda `1698 kare · 1 kez boyutlandı ·
  98 kez`. Kare sayısı bine çıkarken boyutlandırma **1**'de kalıyor.
- **Gizleme/gösterme sayısı tesadüf değil:** `laptop_code`'da laptop koşuları
  `YOK 0-4 · VAR 5-31 · YOK 32-34`, yani döngü başına 2 geçiş.
  1853/35 = 52.9 döngü → beklenen 106 + 1 açılış = **107**; ölçülen 107.
  Gerçek oturumda 1698/35 = 48.5 → beklenen 97 + 1 = **98**; ölçülen 98.
- Modül testi 18/18: katmanlar birbirine sızmıyor (45 karede 0), sıkı kutular
  ham JSON'dan bağımsız hesapla birebir (90 kutu), birleşim bütün kareleri
  kapsıyor ve her kenarına en az bir kare değiyor, çizim ofseti tuvale
  taşmıyor ve kapladığı hücreler ham veriyle birebir (5 kare × katman).

Doğrulama
- [x] Laptop görünürken karakterin solundaki boşluğa tıklayınca altındaki
      pencere tıklanıyor  → nested'de hesap makinesi maskotun altına alındı.
      **(a)** Laptobun ÇİZİLİ pikselinin üstüne tıklandı → "4" bastı.
      **(b)** Karakterin üstüne tıklandı → ekran "4"te kaldı, tıklama yutuldu
      (logda `konum kaydedildi` satırı: olayı pet aldı).
      **(c)** Laptop actor'ünün şeffaf kısmına tıklandı → "7" bastı.
      **(d)** Faz 1'de tam tuvalin yuttuğu, karakterin SAĞINDAKİ şeride
      tıklandı → "9" bastı. Sonuç ekranda **479**.
- [x] Karakteri sürükleyince ikisi birlikte hareket ediyor  → sürükleme
      öncesi/sonrası piksel ölçümü: gövde (1427,852)→(792,687), laptop
      (1400,885)→(765,720). İki katmanın kayması da **birebir (−635, −165)**,
      ızgara farkının tam kendisi. Log: `konum kaydedildi (477, 509)` —
      hesaplanan hedefle piksel piksel aynı.
- [x] Animasyon boyunca karakter titremiyor, yerinden kaymıyor  → aşağıda
      ayrı başlık.
- [x] Laptop olmayan karelerde laptop actor'ü gizli ve input yutmuyor
      → laptopsuz karelerde ekranda tek bir `#8B8B8B` piksel yok (ölçüldü,
      `n=0`); gizleme/gösterme sayacı beklenen değeri birebir tutuyor (yukarı).
      Wayland'de input bölgesi zaten hiç sorulmuyor (aşağıdaki not), o yüzden
      laptobu zararsız kılan şey `reactive: false` — dört tıklama testinin
      hepsi bunu doğruluyor. X11 tarafını kabuğun kendi kaynağı garanti
      ediyor: `layout.js:1076` input dikdörtgenini eklemeden önce
      `actor.get_paint_visibility()` soruyor.
- [x] Devre dışı bırakınca iki actor de sökülüyor, kalıntı yok  → nested'de
      1280×800'lük alanın TAMAMINDA maskot rengi `n=0`; gerçek oturumda sağ
      alt köşede `n=0`. İki ortamda da logda claude-pet ile ilgili tek bir
      uyarı/hata yok. Yeniden etkinleştirince aynı ızgara konumunda geliyor.

Titreme raporu (prompt'un istediği iki ortam)
- **Yöntem.** Her ekran görüntüsünde katmanların piksel sınırları ölçülüp,
  varlıktaki kare kutularının `ızgara + kutu×hücre` ile hesaplanan ekran
  karşılığıyla karşılaştırıldı. Kayma varsa bu eşleşme bozulur.
- **(a) Nested:** 2 dakikaya yayılmış 4 bağımsız örnek. Dördü de **tek bir
  sabit ofsette** varlıktaki karelere birebir oturdu — hem karakter hem
  laptop, aynı anda. Alt piksel kayması yok, ızgara kayması yok.
- **(b) Gerçek oturum:** eklenti gerçek kabukta etkinleştirildi
  (`ızgara (3672, 954)` — birincil monitörün sağ altı, hesapla birebir),
  3 örnek alındı, üçü de varlıktaki karelere birebir oturdu.
- **Sonuç:** geometri kaynaklı titreme her iki ortamda da yok; actor'ler
  animasyon boyunca ne boyutlanıyor ne yer değiştiriyor (ölçüm: 1853 karede
  1 boyutlandırma). Geriye kalan tek olası kaynak **zamansal** olurdu —
  `GLib.timeout` ile uyanan `queue_repaint`'in kompozitörün kare saatine
  hangi karede düştüğü. Onu ekran görüntüsüyle ölçmek mümkün değil; nested'in
  llvmpipe ile yazılım render etmesi bunu gerçek oturuma göre daha görünür
  kılabilir. Not olarak `PLAN.md`'ye düşüldü.

Not / bilinen eksikler
- **Renk yönetimi kayması.** Gerçek oturumun ekran yakalamasında maskot
  `#D87656` değil `#d87858` çıkıyor (nested'de tam eşleşiyor). Ölçüm
  toleransla yapıldı; kod tarafında bir sorun değil, ama ileride piksel
  karşılaştırması yapan bir test yazılırsa bilinsin.
- Birleşim kutusu karakterin sıkı kutusundan 1.5 kat büyük olduğu için,
  karakterin hemen çevresindeki birkaç hücrelik şeffaf alan hâlâ tıklama
  yutuyor. Prompt bunu açıkça kabul ediyor; daha ileri gitmek kare başına
  boyutlandırmayı geri getirir.

<!-- Sıradaki: Faz 3 — prompts/faz-3-hooks-ve-durum.md -->
