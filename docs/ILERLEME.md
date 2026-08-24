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

## Faz 3 — Hook'lar ve durum            2026-08-24

Pet'te görünür bir değişiklik yok, olmamalı da: eşleme Faz 4'ün işi. Değişen
tek şey `tracker.js`'in doğru durumu biliyor olması.

Yapılanlar
- **`hooks/claude-pet-hook.py`** — tek dosya, iki mod. Argümansız çağrılınca
  stdin'deki hook yükünden yalnızca üç alanı (`hook_event_name`,
  `notification_type`, `error_type`) alıp inbox'a bırakıyor; `install` /
  `uninstall` / `status` ile `~/.claude/settings.json`'ı yönetiyor.
  Yedi olay kaydediliyor, `PreToolUse` dışında matcher yok.
- **`src/lib/tracker.js`** — `Gio.FileMonitor` ile inbox'ı izliyor, yoklama
  yok. Tek genel durum (`IDLE`/`WORKING`/`WAITING`) + `rateLimited` bayrağı;
  oturum başına durum tutulmuyor, son gelen olay kazanıyor. Durum değişince
  `changed` sinyali yayılıyor — Faz 4 buna bağlanacak.
- **`tests/replay.js` + `make replay`** — zincirin TAMAMINI sürüyor: geçici bir
  durum dizini kurup gerçek Python hook betiğini gerçek yüklerle çalıştırıyor,
  yani test edilen şey yalnızca tracker değil, yazıcı → dosya → FileMonitor →
  durum makinesi. Gerçek inbox'a ve gerçek oturuma dokunmuyor.
- **`Makefile`** — `hooks`, `unhooks`, `hooks-status`, `replay`.
- **`src/extension.js`** — takipçi kuruluyor ve `changed` loglanıyor;
  `disable()` onu aktörlerden önce söküyor. Animasyona hiç dokunulmadı.

Prompt'tan sapmalar
1. **`SessionEnd`'de bayat dosya temizliği** (prompt'ta yok). Eklenti kapalıyken
   hook'lar yazmaya devam ediyor; kimse okumazsa inbox sınırsız büyür. Temizlik
   yalnızca `SessionEnd`'de yapılıyor — oturum başına bir `listdir`, yazma
   yolunun süresine etkisi yok.
2. **`sleep-timeout` GSettings anahtarı değil, kurucu parametresi.** Ayarlar
   Faz 5'in konusu; şimdilik `sleepTimeoutMs` (varsayılan 5 dk).
3. **Zaman aşımı `WAITING`'i temizlemiyor.** Prompt'un geçiş tablosu "olay
   gelmezse IDLE" diyor, ama `WAITING`'den çıkış listesi dört olayla sınırlı ve
   zaman aşımı o listede yok. Yapışkan okuma seçildi: pet sana soruyorsa, sen
   cevap verene kadar sormayı bırakmamalı. Sayaç zaten yalnızca `WORKING`'de
   kuruluyor — boştayken hiçbir zamanlayıcı çalışmıyor.
4. **`rateLimited` bayrağı `UserPromptSubmit`/`PreToolUse` ile düşüyor**
   (prompt ne zaman temizleneceğini söylemiyordu): iş yeniden yürüyorsa limit
   geçmiş demektir.

Ölçümler
- **Hook süresi: 19,7 ms.** 200 KB'lık gerçek boyutta bir `PreToolUse` yüküyle
  10 koşum `time` altında 0,197 s. Python yorumlayıcı açılışı dahil. Diskte
  kalan: **33 bayt** (200 KB girdiden).
- **`make replay`: 21/21.** Geçiş dizisi:
  `WORKING → WAITING → WORKING → IDLE → IDLE+rate → WORKING → IDLE`
- **inotify izleme sayısı: 16 → 17 → 16** (nested kabukta, `enable`/`disable`
  çevresinde). Takipçi tam bir izleme ekliyor ve geri veriyor.

Doğrulama
- [x] `make hooks` çalışıyor, `settings.json` geçerli JSON kalıyor, yedek var
      → gerçek dosyaya kuruldu: 13 anahtar + `hooks` = 14, `statusLine` ve
      `permissions` aynen yerinde, yedek
      `settings.json.claude-pet-yedek-20260824-132427`. Var olan
      `settings.json.bak`'a dokunulmadı (zaman damgalı ad bilerek).
- [x] Kurulumdan **önce elle bir hook ekle**; `make hooks` sonrası hâlâ orada
      → izole bir HOME'a kullanıcının gerçek settings.json'u kopyalanıp iki
      elle hook eklendi (`PreToolUse`/matcher `Bash` ve `PostToolUse`).
      Kurulumdan sonra: elle yazılan 2, claude-pet 7. İkisi AYNI olayda
      (`PreToolUse`) yan yana durabiliyor.
- [x] `make unhooks` yalnızca kendi girdilerini siliyor  → `silinen girdi: 7`;
      geriye kalan `hooks` ağacı tam olarak elle yazılmış iki girdi, komut
      satırları harfi harfine aynı. İki kez kurmak girdi çoğaltmıyor (7 kalıyor).
- [x] Gerçek bir Claude Code oturumunda bir dosya okut → durum `WORKING`
      → yeni bir `claude -p` oturumu açıldı, nested kabuğun logu:
      `durum: WORKING` (13:26:55) → `durum: IDLE` (13:27:08).
- [x] İzin isteyen bir komut → durum `WAITING`, sen cevap verene kadar öyle
      → tmux'ta etkileşimli `claude --permission-mode default`, onay isteyen
      bir `touch`. Tamamen izole bir durum dizininde ölçüldü (başka hiçbir
      oturum oraya yazamaz): `WORKING` 10:51:02 → `WAITING` 10:51:05 →
      **94 saniye boyunca hiçbir geçiş yok**, istem ekranda → cevap verilince
      `IDLE` 10:52:39.
      Ham olaylar da toplandı: `UserPromptSubmit · PreToolUse ·
      PermissionRequest · Notification(permission_prompt)` — arada `Stop` YOK,
      yani yapışkanlık yapısal olarak sağlanıyor.
- [x] `make replay` doğru geçişleri üretiyor  → 21/21, çıktı yukarıda.
- [x] Inbox'a elle bozuk JSON → pet susuyor, shell ayakta, dosya siliniyor
      → canlı nested kabukta üç tür birden atıldı: bozuk metin, ikili çöp ve
      geçerli-ama-yanlış-tipte (`[]`). Üçü de silindi, inbox 0, eklenti
      `ACTIVE`, kabuk ayakta, iki `console.warn`.
- [x] Kanarya çalışıyor  → `replay` ilk iş olarak ayrı bir dizinde izleyici
      kurup gerçekten olay aldığını doğruluyor; alamazsa `make nested-kill`
      diyen açık bir hata verip duruyor.
- [x] Devre dışı bırakınca dosya monitörü sökülüyor  → izleme sayısı 17'den
      16'ya döndü; ayrıca `disable` sonrası inbox'a yazılan olay hiçbir tepki
      üretmedi ve dosya yerinde kaldı (kimse okumuyor).
- [x] Hook süresi 50 ms altında  → 19,7 ms.

Notlar / bilinen eksikler
- **Tek genel durum, çoklu oturumun bedeli.** Bu ölçüm sırasında canlı olarak
  görüldü: tmux'taki oturum izin istemi gösterirken `WAITING`'deyken, BAŞKA
  bir Claude Code oturumunun (bu sohbetin) turu bitti, `Stop` yazdı ve durum
  `IDLE`'a düştü — istem hâlâ ekrandaydı. Prompt'un "oturum başına durum
  tutma, son gelen olay kazanır" kararının doğrudan sonucu ve tasarım gereği.
  Aynı anda iki oturum çalıştıran biri için pet yanıltıcı olabilir. Faz 4'te
  bilinsin; çözüm gerekirse `WAITING`'i oturum kimliğine bağlamak olur.
- **Açık oturumlar hook'ları ne zaman görüyor.** Kurulumdan sonra ZATEN AÇIK
  olan bir oturumun da (~1 dk içinde) olay yazmaya başladığı görüldü, yani
  Claude Code `settings.json`'ı yeniden okuyor. Ama buna güvenilmemeli;
  kurulum çıktısı "kesin yol yeni oturum" diyor.
- **`hooks/` ve `tests/` pakete girmiyor.** `gnome-extensions pack` yalnızca
  `src/` ve açıkça verilen ek kaynakları alıyor. Hook betiği kullanıcının
  makinesinde depodan çalışıyor; Faz 6'da dağıtım düşünülürken bu ayrım
  yeniden ele alınmalı (kurulu eklenti dizinine kopyalanması gerekebilir).
- `docs/PLAN.md`'ye bu fazın notları BİLEREK yazılmadı — kullanıcı Faz 3/4
  özet satırlarının güncelliğini yitirdiğini, prompt dosyalarının esas
  olduğunu söyledi.

## Faz 4 — Durum → animasyon eşlemesi            2026-08-24

Pet hayata döndü. `tracker` ne olduğunu söylüyor, `states.js` hangi kliplerin
oynayacağını, `director.js` sırayı ve zamanlamayı kuruyor.

Yapılanlar
- **`src/lib/states.js`** — üç tablo, tek satırlık bir kural:
  `dizi(A → B) = ÇIKIS[A] + GIRIS[B] + DONGU[B]`. `STATE_ANIM` prompt'taki
  hâliyle duruyor; yanına `ENTER_ANIM` (WORKING: `laptop_out`, WAITING:
  `waiting_in`) ve `EXIT_ANIM` (WORKING: `laptop_away`, WAITING:
  `waiting_out`) eklendi. `resolve()` eksik klipte `idle`'a düşüyor ve
  klip başına BİR KEZ `console.debug` basıyor.
- **`src/lib/director.js`** — `tracker.changed` → klip dizisi. Dizinin son
  klibi döngüde döner, öncekiler bir kez oynar; `loop` bayrağı varlıktan
  değil dizideki sıradan geliyor.
- **`src/lib/player.js`** — `onCycle` geri çağrısı eklendi: bir klip tam bir
  turu bitirince haber veriyor. Ayrıca döngü olmayan klibin **son karesi
  artık kendi `hold` süresince duruyor** (önceden son karede zamanlayıcı hiç
  kurulmuyordu, yani klibin bitiş pozu görünmeden kesiliyordu).
- **`src/extension.js`** — Faz 1'in `GECICI_ANIMASYON` sabiti ve döngü
  zorlaması kaldırıldı; zincir `tracker → director → player → sprite`.
- **`tests/director.js` + `make replay`** — koreografi testi (sahte player,
  gerçek tablolar). **`make replay-canli SENARYO=tur|izin|ratelimit`** —
  gerçek inbox'a yazıp ÇALIŞAN pet'i sürüyor; rate limit'i tetiklemenin yolu.

Tasarım: neden `ÇIKIS + GIRIS + DONGU`

Varlığın dikişleri ölçüldü ve tam olarak bu modeli istiyor
(kare kare karşılaştırma, farklı hücre sayısı):

| Dikiş | Fark |
|---|---|
| `laptop_away` son → `waiting_in` ilk | **aynı kare** |
| `waiting_out` son → `laptop_out` ilk | **aynı kare** |
| `laptop_away` son → `idle` ilk | **aynı kare** |
| `waiting_out` son → `idle` ilk | **aynı kare** |
| `idle` son → `laptop_out` / `waiting_in` ilk | **aynı kare** |
| `typing` son → `waiting_in` ilk | **322 hücre** |

Yani doğru sıra kurulunca geçişler görünmez oluyor; yanlış sıra göze batıyor.
`typing`'den doğrudan `waiting_in`'e atlamak 322 hücre zıplatıyor — laptobun
önce kalkması şart, ve bu koddaki bir `if` değil tablodaki bir satır.

Prompt'tan sapmalar
1. **Kural 3 ile kural 4 çelişiyordu.** Kural 3 "`WAITING`: devam eden
   animasyonu kes" diyor, kural 4 "durum değişince klibi anında kesme, turunu
   bitir — aynısı `waiting` için de geçerli, tek istisna rate limit". Kural 4
   daha spesifik ve istisnayı açıkça sayıyor, o yüzden `WAITING` de turu
   bekliyor. Ölçüldü: en uzun bekleme 1.51 sn.
2. **"laptop varsa `laptop_away` oynat" koşulu tabloya çevrildi.** Laptop tam
   olarak `WORKING`'den çıkarken elde oluyor, o yüzden `EXIT_ANIM.WORKING`
   yeterli — ayrı bir "laptop var mı" bayrağı tutmaya gerek kalmadı.
3. **Rate limit'te laptop actor'ü elle gizlenmiyor.** Gerek yok: `idle`
   klibinde laptop katmanı hiç bulunmuyor, Faz 2'nin "katman boşsa actor'ü
   gizle" yolu işi kendiliğinden yapıyor. Ölçüldü: `laptop_away` 0 kez oynadı.
4. **`make replay-canli` eklendi.** Prompt "rate limit senaryosunu `make
   replay` ile tetikle" diyor, ama `replay` bilerek izole bir dizinde
   çalışıyor (gerçek oturuma dokunmasın diye). Canlı kip ayrı bir hedef.
5. **`tests/director.js` eklendi** (istenmemişti). Koreografi tablo tabanlı
   ve sessizce yanlış olabilir; 36 madde onu sabitliyor.

Ölçümler
- **Turu bekleme:** `typing` sürerken gelen 9 durum değişiminin hepsi turun
  bitmesini bekledi — ortalama **0.60 sn**, en uzun **1.51 sn**. Bir `typing`
  turu 1.73 sn, yani hiçbiri turu aşmadı. `IDLE`'dan gelen geçişler
  (`idle` tek kare, zamanlayıcı yok) **0.001 sn**'de başlıyor.
- **Rate limit:** `typing` → doğrudan `idle`, **0.000 sn**, arada klip yok.
- **CPU (nested gnome-shell):** boşta **%0.18** ve **%0.10** (60'ar sn),
  `typing` döngüsünde **%3.26**. `disable` sonrası %0.40 → temel seviye.
- **Kapanış sayacı:** `kapatıldı · 530 kare · 7 kez boyutlandı · 4 kez katman
  gizlendi/gösterildi` — boyutlandırma klip başına, kare başına değil.

Doğrulama (gerçek Claude Code oturumu + canlı senaryolar)
- [x] Claude Code kapalıyken pet düz duruyor  → açılışta
      `tuval · idle · laptop: yok`
- [x] Bir şey yaptır → laptop çıkıyor ve iş bitene kadar elinde kalıyor
      → gerçek oturum (Read + Bash + Edit): tek `yönetmen: IDLE → WORKING ·
      laptop_out → typing` satırı, üç aracın arasında **hiç klip değişimi
      yok**, sonra tek `WORKING → IDLE`. Canlı `tur` senaryosunda da üç
      `PreToolUse` sıfır klip değişimi üretti.
- [x] İzin isteyen bir komut → laptop kalkıyor, bekleme pozuna geçiyor, cevap
      verene kadar öyle  → `WORKING → WAITING · laptop_away → waiting_in →
      waiting`; `waiting` tek kare olduğu için zamanlayıcı bile durmuş
      hâlde bekliyor.
- [x] Cevap ver → `waiting_out` bir kez, sonra yazmaya dönüyor
      → `WAITING → WORKING · waiting_out → laptop_out → typing`
- [x] Tur bitince laptop kalkıyor, düz duruşa dönüyor
      → `WORKING → IDLE · laptop_away → idle`
- [x] Yazma döngüsünün ortasında iş bitse bile animasyon yarıda kesilmiyor
      → yukarıdaki 9 ölçüm; ortalama 0.60 sn beklendi
- [x] Rate limit `make replay-canli SENARYO=ratelimit` ile tetiklendi →
      `typing` → `idle`, `laptop_away` sayısı **0**, gecikme 0.000 sn
- [x] Varlıkta olmayan bir klip → pet `idle`'a düşüyor, shell ayakta
      → KURULU kopyadan `typing` çıkarıldı (depo varlığına dokunulmadı):
      `laptop_out` oynadı, ardından `typing` yerine `idle`; kabuk ayakta,
      hata yok. Sonra `make install` ile geri alındı.
- [x] 3 dk boşta → CPU sıfır  → yukarıdaki ölçüm; `idle` tek kare olduğu için
      zamanlayıcı hiç kurulmuyor
- [x] Devre dışı bırakınca bütün zamanlayıcılar sökülüyor  → CPU %2.66 →
      %0.40; `disable` sonrası inbox'a yazılan olay hiçbir klip değişimi
      üretmedi
- [x] Gözle bakıldı  → `typing` pozu ekran görüntüsüyle doğrulandı (pet öne
      eğilmiş, gri laptop önünde), `waiting` pozu da ayrıca çekildi.

Not / bilinen eksikler
- **`waiting` pozu şu an düz bir dikdörtgen.** Varlıktaki `waiting` klibi
  21×15 hücrelik, tamamen dolu bir kutu: göz, kol, bacak yok (kontrol edildi,
  tek `#` bloğu). Prompt'un özet tablosu bu durumu "el sallar, yanında soru
  işareti" diye tarif ediyor ve pet'in tek gerçek işlevi bu durumu haber
  vermek. Ekranda 63×45 piksellik turuncu bir dikdörtgen olarak okunuyor.
  Varlık kesinleşti dendiği için dokunulmadı; poz atölyesinde değiştirilmek
  istenirse kodda hiçbir şey değişmesi gerekmiyor.
- **Nadir yarış durumu.** Durum, bir geçiş klibi oynarken değişirse kalan dizi
  bırakılıp yeniden planlanıyor; bu iki dikişte görünür bir sıçrama bırakıyor:
  `laptop_out` son → `laptop_away` ilk (87 hücre) ve `waiting_in` son →
  `waiting_out` ilk (12 hücre). Yalnızca 0.5–1.3 sn'lik geçiş klipleri
  sırasında durum değişirse oluşuyor.
- **Uyku kodu şu an ölü.** Varlıkta `sleep` klibi yok, o yüzden zamanlayıcı
  hiç kurulmuyor ve pet `idle`'da kalıyor. Klip eklenirse kendiliğinden
  devreye giriyor (birim testi sentetik bir `sleep` klibiyle doğruladı).
  `sleep-timeout` hâlâ kurucu parametresi; GSettings anahtarı Faz 5.
- `docs/PLAN.md`'ye yine dokunulmadı (kullanıcı isteği).

## Faz 5 — Ayarlar ve kalıcılık            2026-08-24

Yapılanlar
- **Şema yedi anahtara çıktı** (`src/schemas/…claude-pet.gschema.xml`):
  `position-x/y`, `monitor-index`, `scale` (1–8), `sleep-timeout` (0–3600),
  `attention-notify`, `laptop-enabled`, `paused`. Var olan iki anahtarın
  tipi değişmedi; anlamı değişti (aşağıya bak).
- **`src/prefs.js`** (yeni) — Adw, üç grup: Görünüm (boyut, laptop),
  Davranış (boşta kalma süresi, bildirim), Konum (monitör, konumu sıfırla).
  Uygula düğmesi yok: her satır `settings.bind` ile bağlı, tek istisna
  monitör listesi (ayar -1'i "birincil" diye kullanıyor, `ComboRow.selected`
  ise 0'dan sayıyor).
- **`src/lib/layout.js`** (yeni) — konum aritmetiğinin tamamı: monitör seçimi,
  göreli↔global çevrim, ekran içine sıkıştırma, varsayılan yerleşim.
  `sprite.js` gibi kabuktan bağımsız, o yüzden `tests/layout.js` gnome-shell
  açmadan sınıyor (26 iddia).
- **Konum artık monitöre GÖRELİ.** `position-x/y`, `monitor-index`
  monitörünün sol üst köşesine olan uzaklık. Monitör çıkarılırsa birincile
  düşülüyor ama **ayar yeniden yazılmıyor**, yani geri takılınca pet oraya
  dönüyor. Kaydedilmedi işareti tek bir -1 değil **ikisinin birden** -1
  olması: ızgara başlangıcı karakterin solunda kaldığı için göreli konum
  meşru olarak eksi olabiliyor.
- **Sağ tık menüsü** (`PopupMenu`): Duraklat/Devam et · Ayarlar · Konumu
  sıfırla. Menü açıkken `player.freeze()` kareyi donduruyor (`stop()` değil:
  menü kapanınca klip baştan değil **kaldığı kareden** sürüyor) ve yönetmen
  yeni klip başlatmıyor.
- **Duraklatma** (`director.setPaused`): pet nötr poza (`idle`) geçiyor,
  hiçbir zamanlayıcı kurulmuyor, takip sürüyor. `_current` nötr sayıldığı
  için devam edilince `sequence(IDLE → hedef)` doğru geçişi kendiliğinden
  kuruyor — ayrı bir "devam" yolu yazmak gerekmedi.
- **Sürükleme eşiği** (Faz 0'dan beri duran pürüz): 4 pikselin altındaki
  hareket tıklama sayılıyor, pet kımıldamıyor ve ayarlara yazılmıyor.
- `player.js`: `freeze()`/`thaw()` ve `_finished` bayrağı (biten bir klibi
  çözmek ikinci bir tur bildirimi üretiyordu). `tracker.js`/`director.js`:
  `setSleepTimeout()`.

Doğrulama
- [x] `make install && make enable` sonrası ayarlar penceresi açılıyor
      → menüden "Ayarlar", pencere nested oturumda açıldı; üç grup da
      göründü, logda tek bir gjs uyarısı yok.
- [x] Boyutu değiştir → pet anında büyüyor/küçülüyor, bulanıklaşmıyor
      → `scale 3 → 6 → 3 → 4`, her seferinde `tuval · … · hücre Npx`
      satırı ve ekran görüntüsü. Hücre tam sayı olduğu için kenarlar
      piksel sınırında.
- [x] Laptobu kapat → laptop actor'ü kayboluyor ve input yutmuyor
      → `laptop katmanı kapalı`, ekran görüntüsünde laptop yok. Actor zaten
      `reactive: false`, ayrıca `visible: false` oluyor.
- [x] Duraklat → animasyon duruyor, CPU sıfır; devam et → kaldığı yerden
      → duraklatılmış **%0.06**, `typing` (hücre 4px) **%3.53**. Devam
      edilince `IDLE → WORKING · laptop_out → typing`.
- [x] Menü açıkken animasyon duruyor → menü açık 15 sn boyunca CPU **%0**.
- [x] Pet'i sürükle, oturumu kapat aç → aynı yerde
      → sürükleme `konum kaydedildi · monitör 0 · (405, 168)`, iki kez
      `disable`/`enable`, ikisinde de `etkin · ızgara (405, 168)`.
- [x] İkinci bir monitör bağla/çıkar → pet ekran içinde kalıyor
      → **canlı** yapıldı (`org.gnome.Mutter.DisplayConfig.ApplyMonitorsConfig`):
      `monitörler değişti · 1 monitör · pet monitör 0 · (608, 400)` (karakterin
      sağ kenarı tam 800 = ekranın kenarı), geri takılınca
      `2 monitör · pet monitör 1 · (1408, 400)`. Ayar hep `monitor-index=1`
      kaldı.
      Ayrıca çözünürlük düşürme: kayıt (700,400) iken 640×480 tek monitörle
      açıldı → `ızgara (448, 344)`, elle hesaplanan değerin aynısı.
- [x] "Konumu sıfırla" çalışıyor → hem menüden hem prefs'ten; pet bulunduğu
      monitörün sağ altına döndü, prefs'teki alt yazı "Kayıtlı konum yok"a
      döndü.
- [x] Sağ tık menüsü açılıyor; menü açıkken sol tık altına GEÇMİYOR
      → nested'de hesap makinesi açıldı: menü açıkken "7" tuşuna tıklandı,
      ekranda hiçbir şey belirmedi (tık yalnızca menüyü kapattı); menü
      kapalıyken aynı tık "7" yazdı. Bu GNOME'un kendi menü davranışı
      (PopupMenu modal grab alıyor), bizim eklediğimiz bir kısıt değil.
- [x] Ayarları birkaç kez değiştirip eklentiyi kapat aç → log temiz
      → 15 ayar değişikliği + 2 kapat/aç turu; `kapatıldı · N kare · …`
      satırları düzgün, claude-pet'ten tek uyarı yok, ekranda tek pet.
- [x] `sleep-timeout` gerçekten bağlı → 5 sn'ye çekildi, `PreToolUse`
      gönderildi, 6.5 sn sonra `WORKING → IDLE`.
- [x] `attention-notify` → açıkken "Claude Code / Girdi bekleniyor."
      banner'ı çıktı, kapalıyken yeni bir WAITING geçişinde çıkmadı.
- [x] `make replay` → 21/21 + 50/50 + 26/26.

Ölçüm bir hata yakaladı
- **`g_settings_apply()` nesneyi gecikmeli moddan geri DÖNDÜRMÜYOR.** Üç
  konum anahtarını atomik yazmak için `this._settings.delay()`/`apply()`
  kullanmıştım. `changed` sinyali yazan process'e eşzamanlı geliyor
  (ölçüldü: `yazmadan önce → handler(x) → x yazıldı → handler(y)`), yani
  ayrı ayrı yazmak aradaki dinleyiciye yarım bir üçlü gösteriyor. Ama
  `delay()` **kalıcı**: `undelay` diye bir şey yok. Sonuç canlı ölçüldü —
  bir kez sürükledikten sonra menüden "Duraklat" dendi, pet duraklatıldı
  ama `paused` dconf'a hiç ULAŞMADI; prefs'te de "Sıfırla"ya bastıktan
  sonra boyut değişikliği artık yazılmıyordu. Düzeltme: toplu yazma tek
  kullanımlık bir GSettings nesnesinden geçiyor (`_writeInts`), bağların ve
  dinleyicilerin durduğu nesne anında yazan modda kalıyor. İki tarafta da
  yeniden ölçüldü.

Notlar / bilinen eksikler
- **Ayarlar penceresi pet'in ÜSTÜNDE çiziliyor**, normal pencereler altında.
  Ölçüldü (piksel sayımı): prefs açıkken pet'in dikdörtgeninde 0 turuncu
  piksel, hesap makinesi üstündeyken 2703. Sebep `layout.js::addChrome`:
  chrome actor'leri `global.top_window_group`'un ALTINA koyuyor ve prefs
  penceresi oraya düşüyor. GNOME'un kendi katman kuralı, bizim hatamız
  değil; ama ayar değiştirirken pet'i görmek isteyen pencereyi kenara
  çekmeli.
- **`sleep-timeout` iki yeri birden besliyor**: tracker'ın "bu kadar süredir
  hook gelmiyor, çalışma bitmiş say" sayacı ve yönetmenin uyku klibi sayacı.
  Tek anahtar isteniyordu ve `tracker.js` zaten bunu bekliyordu; uyku klibi
  varlıkta olmadığı için yalnız yönetmene bağlansaydı anahtar hiçbir şey
  yapmayan bir düğme olurdu.
- **`scale` değişince şerit ön-hesabı YENİDEN YAPILMIYOR** — gerekmiyor.
  Şeritler ızgara hücresi cinsinden saklanıyor, piksel çarpanı yalnızca
  çizim anında uygulanıyor (`drawLayer(…, cell, …)`). Prompt bunu istiyordu
  ama tasarım zaten ondan bağımsız.
- **Ekranın kendi ölçek katsayısı (`scale_factor`) hâlâ bir kez okunuyor.**
  `changed::scale`'de yeniden okunuyor, ama kullanıcı ekran ölçeğini
  %100→%200 yaparsa pet bir sonraki ayar değişikliğine kadar eski hücre
  boyutunda kalır. `St.ThemeContext` üzerinde `notify::scale-factor`
  dinlemek tek satır; Faz 6'ya not.
- **Duraklatma bildirimleri susturmuyor.** "Duraklat" pet'in animasyonunu
  durduruyor; girdi bekleme bildirimi ayrı anahtarla kapatılıyor. Bilinçli:
  pet'i susturmak isteyenin haber alma yolunu da kapatmak sürpriz olurdu.
- **Faz 6'ya iki paket notu** (bu fazda bilerek dokunulmadı): `make pack`
  çıktısında (a) `assets/animations.yedek*.json` de yer alıyor — depoya
  girmiyorlar ama zip'e giriyorlar, 297 KB; (b) `schemas/` içinde yalnızca
  `.xml` var, `gschemas.compiled` yok. Kurulum `make install` ile yapılınca
  sorun çıkmıyor (derlenmiş şema `src/schemas/` içinden kopyalanıyor), zip'ten
  kurulumda prefs şemayı bulamayabilir.
- `docs/PLAN.md`'ye yine dokunulmadı (kullanıcı isteği).

## Faz 6 — Paketleme ve yayına hazırlık            2026-08-24

Yapılanlar
- **`make check`** (`tools/kontrol.py`): metadata/UUID tutarlılığı (uuid =
  Makefile UUID = kurulum dizini adı, shell-version 46, settings-schema
  gerçekten şemada tanımlı), `animations.json` biçimi (her kare `h` satır,
  her satır `w` karakter, palet dışı karakter yok, `holds` uzunluğu kare
  sayısına eşit, fps > 0, eklentinin aradığı yedi klip mevcut),
  `glib-compile-schemas --strict --dry-run`, JS ve Python sözdizimi.
- **`make pack`** artık gerçekten dağıtılabilir bir zip üretiyor: `check`e
  bağlı, varlıkları bir sahne dizininden alıyor (yedekler pakete girmiyor) ve
  **derlenmiş şemayı** elle ekliyor.
- **`make uninstall`** üç yeri birden temizliyor: eklenti dizini, hook
  girdileri, olay kutusu. GSettings anahtarları bilerek kalıyor; silme komutu
  ekrana yazılıyor.
- **`make gif`** (`tools/gif.py` + `tools/kayit.js`): README'deki
  `docs/pet.gif`. Ekran kaydı değil — kareler doğrudan `src/lib/sprite.js` ile
  çiziliyor, yani belgedeki görüntü kabuğun çizdiğinin aynısı; kare süreleri
  varlığın kendi `holds`/`fps` değerleri.
- **`README.md` baştan yazıldı.** Gereksinimler, doğrulanmış kurulum komutları,
  ayarlar tablosu, sorun giderme, bilinen eksikler, GIF.
- **`LICENSE`** (MIT, Eymistaken) + karakterin Anthropic'e ait olduğu ve bu
  projenin resmî olmadığı notu.

README'de düzeltilen iki yanlış
- **Hook tablosu Faz 3 öncesinden kalmış.** 12 olay ve araç adı eşlemesi
  (`PreToolUse · Bash → koşturur`) yazıyordu; gerçek yedi olay ve üç durum,
  araç adına hiç bakılmıyor. Tablo yeniden yazıldı.
- **`affectsInputRegion: true // input bölgesi = sadece bu actor`** yorumu
  yanıltıcıydı: Faz 2'de ölçüldü, Wayland'de bu bayrak hiçbir şey yapmıyor.
  Tıklama yutmayı engelleyen şey `reactive: false`. README artık ölçümü
  yazıyor.

Doğrulama
- [x] `make check` geçiyor  → 5 bölüm, hepsi TAMAM. Sınandı da: `layout.js`'e
      geçici olarak `const bozuk = {;` eklendi, kontrol `HATA` verip 1 ile
      çıktı, dosya geri alındı.
- [x] `make pack` zip üretiyor; içinde `assets/` ve derlenmiş şema var
      → 40 KB, 17 girdi: `assets/animations.json` (yedekler YOK), `lib/` (7),
      `schemas/` (xml + `gschemas.compiled`), `prefs.js`, `extension.js`,
      `metadata.json`.
- [x] Temiz kaldırma sonrası iz kalmıyor  → `make uninstall` sonrası eklenti
      dizini yok, durum dizini yok, `settings.json`'daki 7 girdi silinmiş.
      Kalan tek iz `~/.config/ibus/bus/…-claude-pet-nested` — o eklentinin
      değil, `make nested`'in ibus artığı.
- [x] **Elle yazılmış hook'a dokunulmuyor** (kaldırmada da)  → önce elle bir
      `SessionStart` hook'u eklendi, `make uninstall` sonrası claude-pet
      girdileri 0, elle yazılan 1 olarak duruyor. Test sonrası kaldırıldı;
      kullanıcının `settings.json`'ı hook dışında bit bit aynı.
- [x] Sıfırdan kurulum README'deki komutlarla çalışıyor  → `make install`
      (kabuk kendiliğinden `INITIALIZED` gördü) → `make enable` (`ACTIVE`) →
      `make hooks`.
- [x] **Gerçek oturumda (iç içe değil) pet çalışıyor**  → gerçek kabuğun
      logunda `etkin · ızgara (3672, 954) · monitör 0 · hücre 3px`, ardından
      bu oturumun araç çağrılarıyla `durum: WORKING` ve
      `yönetmen: IDLE → WORKING · laptop_out → typing`. Ekran görüntüsüyle
      de bakıldı: pet sağ alt köşede, laptop önünde.
      Ayrıca kullanıcı doğrulama sırasında pet'i kendisi kullandı ve gerçek
      oturumun logunda göründü: `konum kaydedildi · monitör 0 · (1752, 926)`
      (sürükleme), `yönetmen: duraklatıldı · nötr kare` → `yönetmen: devam ·
      hedef WORKING`, `boşta kalma süresi 180 sn`, `laptop katmanı açık`.
- [x] Zip'ten kurulum (yabancının yolu) çalışıyor  → `gnome-extensions install
      --force` ile kuruldu, ağaç 13 dosya, `gschemas.compiled` yerinde,
      yedek varlık sızmamış. TAZE bir kabukta (`make nested`) `ACTIVE` ve
      `etkin` satırı; ayarlar penceresi de o kopyadan açıldı, logda hata yok.
      `gsettings --schemadir <kurulum>/schemas` yedi anahtarı da okuyor.
- [x] `README.md`'deki her komut denendi  → `make check/install/enable/hooks/
      hooks-status/uninstall/pack/gif/preview/replay/nested`,
      `gnome-shell --version`, `gnome-extensions info`, `journalctl … | grep`,
      `ls ~/.local/state/claude-pet/inbox/`,
      `cat /proc/sys/fs/inotify/max_user_instances`,
      `dconf reset -f /org/gnome/shell/extensions/claude-pet/`.
- [x] `git status` temiz; `.gitignore` derlenmiş şemayı, zip'i ve
      `build/`i dışarıda bırakıyor.

Yapılmayan tek adım
- **Oturum kapatılıp açılmadı.** Prompt'un temiz kurulum listesinde "oturumu
  kapat aç" var; bu, bu Claude Code oturumunu ve kullanıcının açık
  uygulamalarını kapatmak demek. Onun yerine aynı şeyin ölçülebilir kısmı
  yapıldı: paketlenmiş kopya **taze bir gnome-shell process'inde** (nested)
  sıfırdan yüklendi ve `ACTIVE` oldu; gerçek oturumda da eklenti kurulup
  etkinleştirildi ve çalışıyor. Doğrulanmamış tek şey, oturum açılışında
  kabuğun eklentiyi kendiliğinden yüklemesi — ki nested oturum tam olarak
  o yolu kullanıyor.

Notlar
- **`node --check` işe yaramıyor.** Node 24 ESM algılamasıyla `const a = {;`
  içeren bir dosyaya 0 dönüyor. Sözdizimi kontrolü gjs'in SpiderMonkey'ine
  yaptırılıyor: `Reflect.parse(kaynak, {target: 'module'})` ayrıştırır,
  çalıştırmaz, import'ları çözmez. gjs zaten her GNOME kurulumunda var.
- **`gnome-extensions pack` derlenmiş şemayı koymuyor** (ölçüldü: zip
  listesinde yalnızca `.gschema.xml` vardı). Oysa `getSettings()` →
  `SettingsSchemaSource.new_from_directory()` derlenmiş dosyayı arıyor.
  `pack` artık onu `zip` ile ekliyor.
- **`--extra-source` mutlak yol istiyor.** Göreli verilince sessizce hiçbir
  şey eklemiyor: `assets/` bir pakette tamamen eksik çıktı, hata yok.
- **`docs/PLAN.md`'ye yine dokunulmadı.** Faz 6 prompt'u "Sonraki fazlara
  notlar"ı gözden geçirip taşımayı istiyor; kullanıcının duran talimatı ise
  PLAN.md'yi güncellememek. Notlar okundu, kullanıcıyı ilgilendirenler
  README'nin "Bilinen eksikler" ve "Sorun giderme" bölümlerine taşındı
  (bozuk varlıkta pet görünmüyor, `gnome-extensions enable` tuzağı, uyku
  klibi yok, prefs penceresinin pet'in üstünde açılması, `scale_factor`
  canlı izlenmiyor, geçiş klibi yarışı). Geliştiriciyi ilgilendirenler
  (Clutter.DragAction yok, sprite.js kabuktan bağımsız kalsın, GJS Cairo
  tuzağı) zaten ilgili dosyaların başlığında yazıyor. PLAN.md tarihsel
  kayıt olarak olduğu gibi duruyor.

## Faz sonrası — tam ekran ve ayarlar penceresi            2026-08-24

Kullanıcı iki şey bildirdi: ayarlar penceresi açılmıyor, ve tam ekran YouTube
açılınca pet "önce bir görünüp sonra arkada kalıyor".

### Tam ekran: sebep yığın sırası DEĞİL

İlk hipotez `addChrome`'un aktörü `global.top_window_group`'un altına
koymasıydı. **Kontrol turu bunu çürüttü:** nested'de tam ekran bir GTK
penceresi açıldı, `addTopChrome` ile de `addChrome` ile de pet pencerenin
ÜSTÜNDE çizildi. Yani nested bu hatayı hiç üretmiyor — çünkü sebep başka.

Asıl sebep **unredirect**: Mutter ekranı tamamen kaplayan opak bir pencereyi
bir süre sonra doğrudan ekrana basıyor, bileşiklemeyi atlıyor. O anda kabuğun
sahnesindeki hiçbir şey çizilmiyor. Kullanıcının tarifindeki **gecikme** bunun
imzası; yığın sırası olsaydı pencere tam ekrana geçtiği anda kaybolurdu.
Nested'in dummy arka ucu doğrudan basma yapmadığı için orada hiç görünmüyor.

Çözüm `enable()`'da `Meta.disable_unredirect_for_display(global.display)`,
`disable()`'da dengeleyen `enable_unredirect_for_display()`. Dengelenmezse
eklenti kapandıktan sonra da bütün oturum boyunca unredirect kapalı kalır.
`addTopChrome` de korundu (kabuğun ekran klavyesi için kullandığı yol).

Bedeli açık: tam ekran oyun/video artık doğrudan basılmıyor. README'ye yazıldı.

### Ayarlar penceresi: kabuğun kaydı bayat

`gnome-extensions prefs` "uzantının tercihleri yok" diyordu, oysa `prefs.js`
diskte duruyordu. Kabuğa soruldu:

```
GetExtensionInfo → 'hasPrefs': <false>
```

`hasPrefs` eklenti NESNESİ yaratılırken hesaplanıyor — yani oturum açılışında,
dizin ilk tarandığında — ve bir daha güncellenmiyor. Bu oturumun kabuğu
11:25'te başlamış; o saatte kurulu ağaç Faz 4'tü ve `prefs.js` yoktu.
`disable`/`enable` bunu düzeltmiyor (denendi).

Aynı ölçüm ikinci bir şeyi de gösterdi: kabuk eklenti modülünü **ilk
etkinleştirmede** okuyor. `make install` sonrası kapat/aç yeni JS'i
YÜKLEMİYOR — logda hâlâ eski sürümün satırları çıkıyor. Yani kod değişikliği
gerçek oturumda ancak oturum yeniden açılınca geçerli oluyor.

Yan düzeltme: `make install` artık `metadata.json`'ı EN SON kopyalıyor. Kabuk
bir dizini ancak içinde `metadata.json` varsa eklenti sayıyor; önce o
giderse kabuk yarım bir ağaç görüp `hasPrefs`i yanlış hesaplayabiliyor.
Zip'in içinde de `metadata.json` `prefs.js`'ten önce geliyor — muhtemelen
`hasPrefs: false` ilk oraya böyle takıldı.

Doğrulama
- [x] `addTopChrome` GNOME 46'da var → nested logu `etkin · addTopChrome`
- [x] `Meta.disable/enable_unredirect_for_display` GNOME 46 typelib'inde
      modül düzeyinde fonksiyon (MetaCompositor'da değil)
- [x] Nested'de kapat/aç turu: `unredirect kapatıldı` satırı iki kez, hata yok
- [x] `make check` geçiyor
- [ ] **Tam ekranda gerçek doğrulama yapılamadı**: unredirect nested'de hiç
      devreye girmiyor, gerçek oturum ise yeni JS'i ancak oturum yeniden
      açılınca okuyor. Kullanıcının çıkış-giriş sonrası tam ekran YouTube ile
      bakması gerekiyor. Logda `tam ekran: unredirect kapatıldı` satırı
      görünüyorsa yol devrede demektir.

## Faz sonrası — pet'in var olma şartı            2026-08-24

Kullanıcı: "Claude uygulaması açık değilse pet kapansın, açıksa açılsın —
açık olmaktan kastım ekranda olmak değil. Terminalde Claude Code açılınca da
çıksın, kapanınca (uygulama da kapalıysa) kapansın."

Yapılanlar
- **`src/lib/presence.js`** (yeni): `/proc` üzerinden "Claude çalışıyor mu"
  sorusunu cevaplayıp değişince `changed` yayan GObject.
- `director.js`: üçüncü tutamak `setAbsent()`. Duraklatmayla aynı davranış
  (nötr kare, sıfır zamanlayıcı), farklı sebep. `_paused`, `_menuOpen` ve
  `_absent` tek bir `_held` içinde toplanıyor.
- `extension.js`: varlık aktörlerden hemen sonra, animasyondan ÖNCE
  kuruluyor — Claude kapalıyken pet tek kare bile görünmüyor. Görünürlük
  hesabına tek koşul eklendi. Unredirect tutamağı da varlığa bağlandı.
- `tests/presence.js` (13 iddia) ve `make replay`'e eklendi.

Kararlar ve ölçümler
- **Pencere değil SÜREÇ.** İlk akla gelen `Shell.AppSystem` (olay tabanlı,
  bedava) ama uygulamaları PENCERELERİNDEN tanıyor: penceresi olmayan bir
  uygulamayı ve terminalde açılan `claude`'u (penceresi terminal emülatörünün)
  kaçırırdı. Kullanıcı "ekranda olmak değil" dediği için ölçüt süreç oldu.
- **Ölçüldü: iki `comm` değeri yetiyor** — `claude-desktop` (uygulama ve bütün
  alt süreçleri) ve `claude` (hem terminaldeki hem uygulamanın içindeki Claude
  Code; bu oturumun kendi süreci `~/.config/Claude/claude-code/2.1.237/claude`
  olarak göründü). İkisi de `comm`un 15 karakter sınırına sığıyor.
- **Yoklama kaçınılmaz** (proc connector CAP_NET_ADMIN istiyor), o yüzden
  ucuzlatıldı: bulunan pid önbelleğe alınıyor. Claude açıkken kontrol tek
  dosya (~0.05 ms, 2 sn'de bir), kapalıyken tam tarama (365 süreç, ~5.7 ms,
  8 sn'de bir → tek çekirdeğin ~%0.07'si). Pahalı hal, pet'in zaten gizli
  olduğu hal.
- **Zombi ayrımı.** İlk sürüm `/proc/<pid>/comm` okuyordu; test şunu yakaladı:
  öldürülmüş ama ebeveyni tarafından toplanmamış bir süreç `/proc`'ta adıyla
  durmaya devam ediyor, yani "Claude kapandı" olayı hiç gelmeyebiliyordu.
  Artık `/proc/<pid>/stat` okunuyor — aynı maliyetle ad VE durum veriyor,
  `Z`/`X` olanlar sayılmıyor.
- **Test kancası `CLAUDE_PET_PROCESSES`.** Bu özelliğin "kapalı" hâlini gerçek
  kabukta denemek, deneyeni kendi Claude'unu kapatmaya zorlardı.

Doğrulama (nested, `CLAUDE_PET_PROCESSES=sleep`)
- [x] Hiç süreç yokken pet **yok** → ekran görüntüsü boş, log
      `claude kapalı · pet çekildi` + `pet gizlendi`
- [x] Süreç doğunca pet **var** (≤8 sn) → `claude açık · sleep (pid …)` +
      `pet görünür` + `unredirect kapatıldı`; ekran görüntüsünde maskot yerinde
- [x] Süreç ölünce pet yine **yok** → `pet gizlendi · claude kapalı`
- [x] Açılışta Claude kapalıysa pet hiç çizilmiyor (aktörler `visible: false`
      doğuyor, ilk kare bile görünmüyor)
- [x] `make replay` 21/21 · 50/50 · 26/26 · 13/13
- [x] `make check` geçiyor

Notlar
- Gerçek adlarla (`claude-desktop`, `claude`) doğrulama gerçek oturumda,
  oturum yeniden açıldıktan sonra yapılabilir: kabuk eklenti modülünü yalnızca
  ilk etkinleştirmede okuyor.
- Pet'i Claude kapalıyken de görmek isteyen için ayar YOK; istenirse
  `laptop-enabled` gibi bir anahtar bir saatlik iş.

## Faz sonrası — genel açma/kapama anahtarı            2026-08-24

Kullanıcı: "Ayarlarına genel bir on/off switch ekler misin, kapatırsam Claude
açıkken de pet görünmesin."

Yapılanlar
- Şemaya `enabled` (b, varsayılan true). Açıklamasında `paused` ile farkı
  yazıyor: o pet'i ekranda bırakıp dondurur, bu tamamen kaldırır.
- `prefs.js`: en üstte, kendi grubunda bir `Adw.SwitchRow`. Ötekilerle aynı
  sırada değil çünkü ötekilerin üstünde — kapalıyken aşağıdakilerin hiçbirinin
  gözle görülür etkisi yok. Alt yazısı geri açmanın buradan olduğunu söylüyor
  (ekranda tıklanacak pet kalmıyor).
- `extension.js`: görünürlüğün TEK uygulama noktası `_applyGorunurluk()`.
  İki sebep (ayar, Claude'un varlığı) `_gosterilsin` içinde birleşiyor, yani
  biri ötekini ezemiyor. Anahtar kapatılınca süreç yoklaması da duruyor;
  açılınca `start()` ilk cevabı hemen verdiği için pet o anda geliyor.

Doğrulama (nested, `CLAUDE_PET_PROCESSES=cpetsahte`) — dört hâlin dördü
- [x] anahtar kapalı + Claude açık → `unredirect geri verildi` + `pet kapalı
      (ayar)`; pet yok
- [x] anahtar kapalı + Claude öldürüldü → **hiçbir satır yok** (yoklama
      gerçekten durmuş)
- [x] anahtar açık + Claude yok → yalnızca `pet açık (ayar)`; `pet görünür`
      YOK, unredirect kapatılmıyor
- [x] anahtar açık + Claude geri geldi → `claude açık` + `unredirect
      kapatıldı` + `pet görünür (cpetsahte)`
- [x] `make check`, `make replay` (21/50/26/13)

Test kendi hatasını iki kez gösterdi
- **`sleep` sahte Claude olarak kullanılamaz.** Sistemde her an başka birinin
  `sleep`i çalışıyor olabiliyor — testi süren kabuğun kendisi bile. Bir
  doğrulama turu bu yüzden yanlış "Claude açık" okudu. Artık `sleep` benzersiz
  bir ada kopyalanıyor.
- **`comm` 15 karaktere kırpılıyor.** İlk benzersiz ad `cpet-sahte-12345`
  (16 karakter) idi ve süreç hiç bulunamadı; test, koddaki kuralı kendi
  üstünde doğrulamış oldu. Ad kısaltıldı.

<!-- Proje fazları bitti. Yayın: metadata.json'daki version 1'de bırakıldı. -->

---

## Faz 7 — KDE / AppImage sürümü            2026-08-24

Kullanıcı: "Bu uygulamayı başka distrolarda da kurabilmek için bir AppImage
yap. Animasyonlar ve çalışma mantığı aynı olsun, KDE'de de çalışsın. Sistemle
birlikte başlayan hafif bir şey olsun, tek görevi pet'i koymak; ayarlar için
AppImage'ı açmak yetsin."

Branch: `appimage`.

### Dayanak

İki gerçek bu fazı bir yeniden yazım olmaktan çıkardı:

1. **`src/lib/` zaten kabuktan bağımsızdı.** Sekiz modülün hiçbirinde `St`,
   `Main`, `global`, `Meta` geçmiyor. Faz 1'den beri dosya başlıklarında
   yazılı olan bu kural, burada karşılığını verdi: yeni uygulama o dosyaları
   **kopyalamadan** import ediyor. Regresyon kalkanı da hazır geldi —
   `tests/` altındaki 110 iddia iki sürümü birden sınıyor.
2. **KWin `wlr-layer-shell` konuşuyor.** `overlay` katmanı tam ekranın
   üstünde, `set_input_region` gerçekten uygulanıyor, margin ile piksel
   piksel konumlanıyor. Eklentideki üç hilenin (addTopChrome, unredirect
   kapatma, laptobu ayrı `reactive: false` actor yapma) hiçbirine gerek yok.

Yeniden yazılan tek şey `extension.js`'in işi. 901 satırın karşılığı 392
satır (`app/pencere.js`) + 357 satır (`app/main.js`).

Yapılanlar
- `app/` ağacı: `main.js` (tek örnek, zincir kurulumu), `pencere.js`
  (layer-shell + çizim + sürükleme + menü), `tercihler.js` (Adw ayarlar),
  `ayarlar.js` (şema + keyfile arka uç), `ekran.js` (Gdk → layout.js köprüsü),
  `entegrasyon.js` (hook / autostart / menü girdisi).
- `tools/appimage.sh`: sudo'suz sysroot → gtk4-layer-shell derlemesi → AppDir
  → `ldd` kapanışı → appimagetool. `tools/toolchain.sh`, `tools/ikon.js`.
- `Makefile`: `app`, `app-run`, `appimage`, `ikon`.
- `README-appimage.md`, ana README'ye yönlendirme, CLAUDE.md'ye ortak kod
  sözleşmesi.

### Eklentiden dört bilinçli sapma

1. **İki actor yerine tek pencere + giriş bölgesi.** Eklentide laptop ayrı bir
   actor'dü çünkü Wayland'de `affectsInputRegion` atlanıyordu. Layer-shell'de
   `Gdk.Surface.set_input_region()` gerçekten uygulanıyor; tek pencere iki
   katmanı çiziyor, giriş bölgesi yalnızca karakter kutusu. Sonuç eklentiden
   **daha iyi**: laptop ile karakter arasındaki boşluk artık tıklama yutmuyor.
2. **`cell` artık `scale_factor` ile çarpılmıyor.** `St` fiziksel piksele
   çiziyordu, GTK4 mantıksal piksele. Aynı formül HiDPI'da pet'i iki katına
   çıkarırdı. İki sürüm arasındaki en sessiz fark; koda yorum düşüldü.
3. **Ayarlar dconf'ta değil.** `Gio.keyfile_settings_backend_new` ile düz
   metin `~/.config/claude-pet/ayarlar.conf`. Sebep: KDE kurulumunda dconf'un
   varlığı garanti değil. Şema da sisteme kurulmuyor,
   `SettingsSchemaSource.new_from_directory` ile paketin içinden okunuyor.
   Anahtarlar birebir aynı, yani `prefs.js` neredeyse birebir taşındı.
4. **Sürükleme artımlı.** `origin += ofset`, basma noktası sabit. Kümülatif
   model (`yeni = başlangıç + ofset`) burada titrerdi: yüzey margin ile
   taşındığı için kompozitör düzeltici bir motion olayı gönderiyor ve o
   olayda ofset ~0 oluyor.

### Ölçülmüş engeller

- **`sudo` parola istiyor**, `libgtk-4-dev` kurulu değil. Çözüm: `apt-get
  download` + `dpkg-deb -x` ile `build/toolchain/sysroot`. Sisteme hiçbir şey
  yazılmadı. `apt-cache depends --recurse` KULLANILAMAZ: 473 paket ve 257 MB
  (qemu-user ve i386 dahil) indiriyor. İki seviye yetiyor.
- **`PKG_CONFIG_SYSROOT_DIR` `g-ir-scanner`ın yolunu da kaydırıyor.** meson
  "distributor issue" diye durdu. Sysroot'un `usr/bin`ine sembolik bağ.
- **`pkill -f toolchain.sh` çağıranı öldürüyor** — `tools/nested.sh` için Faz
  0'da düşülen notun aynısı, bu kez toolchain betiğinde yaşandı.
- **gtk4-layer-shell GJS'de `LD_PRELOAD` istiyor.** Kütüphane libwayland
  çağrılarını shim'liyor ve `libwayland-client`'tan önce yüklenmek zorunda;
  Python'daki `CDLL(...)` numarasının GJS'de karşılığı yok. AppRun'da
  ayarlanıyor. `liblayer-shell-preload.so` başka bir şey (rastgele Wayland
  uygulamaları için genel hack), o değil.
- **Alt sürece temiz ortam.** Hook betiği konak `python3` ile çalışıyor;
  AppRun'ın `LD_PRELOAD`/`LD_LIBRARY_PATH`i miras kalırsa konak python bizim
  glib kopyamızı yüklemeye çalışır. `GLib.environ_unsetenv` ile temizleniyor.

Doğrulama (kod düzeyi — canlı pencere testi YAPILMADI)
- [x] `gjs -m tests/{replay,director,layout,presence}.js` → 21/50/26/13,
      **110/110**. `src/lib` değişmediği için bu, "aynı mantık" iddiasının
      kanıtı.
- [x] `make check` → 17 JS + 4 Python dosyası, 0 uyarı. (Kontrol betiği yeni
      `app/*.js` dosyalarını da ayrıştırdı.)
- [x] AppImage üretildi: **44 MB**, 108 kütüphane, 18 typelib.
- [x] Bağımlılık kapanışı tam: `ldd` ile tek bir "not found" yok; `libgtk-4`in
      45 bağımlılığının tamamı AppDir içinden çözülüyor, konak GTK'sına
      sızıntı yok.
- [x] AppImage GNOME'da çalıştırıldı → `is_supported()` false, anlaşılır hata
      ve çıkış kodu 2. Bu tek koşum gjs'in paketten açıldığını, 18 typelib'in
      yüklendiğini, altı ES modülünün ayrıştırıldığını ve GTK'nın
      başladığını da doğruluyor.

Notlar / bilinen eksikler
- **Pencere davranışı KDE'de sınanmadı.** Tıklama geçirgenliği, tam ekran,
  sürükleme, sağ tık menüsü ve monitör seçimi gerçek bir KWin oturumunda
  denenmedi — kullanıcı yerel kompozitör kurulmamasını istedi, test
  `oneauraaa`ya bırakıldı. Kontrol listesi `README-appimage.md` sonunda.
- **X11 yok.** Bilinçli: layer-shell bir Wayland protokolü, X11 karşılığı
  override-redirect + XShape ve GTK4 ikisini de doğrudan vermiyor.
- **glibc 2.39 tabanı** (Zorin 18'de derlendi). Debian 12 / Ubuntu 22.04 /
  Mint 21 kapsam dışı; Arch, Fedora 40+, KDE neon 24.04, Debian 13 kapsamda.
  Konteyner aracı kurulu olmadığı için daha eski bir tabanda derlenmedi.
- **`sleep` klibi hâlâ yok**, dolayısıyla uyku pozu bu sürümde de yok.
- **libadwaita ayarlar penceresi** KDE'de GNOME'lu duruyor. `src/prefs.js`i
  yeniden yazmamak için kabul edildi.
