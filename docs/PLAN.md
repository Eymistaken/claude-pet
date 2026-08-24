# Yol haritası

**Hedef:** GNOME Shell 46 / Wayland üzerinde, ekranın üstünde duran, tamamen
şeffaf, odak almayan, girdileri altındaki pencerelere geçiren, yalnızca
maskotun kendisinin tutulabildiği bir katman. Maskot, Claude Code'un o anda ne
yaptığını gösterir.

---

## Kararlar

| Konu | Karar |
|---|---|
| Mimari | GNOME Shell eklentisi, saf GJS. Pencere yok. |
| Çizim | `St.DrawingArea` + Cairo, JSON'daki hücre ızgarasından |
| Animasyon kaynağı | `assets/animations.json` — kod değil, varlık |
| Durum kaynağı | Claude Code hook'ları → `~/.local/state/claude-pet/inbox/` |
| Konum | Sürüklenebilir, GSettings'e yazılır. Otomatik yürüme yok. |
| Paketleme | `gnome-extensions pack` → `.zip` + `Makefile` |
| UUID | `claude-pet@eymistaken.local` |

### Neden pencere değil

Wayland bir istemciye kendi penceresini konumlandırma imkânı vermiyor,
"her zaman üstte" yok, tıklama geçirgenliği pencere sınırının dışına
taşınamıyor. Mutter `wlr-layer-shell` desteklemiyor. Pencere açan her çözüm bu
duvara toslar.

Eklenti olunca pet doğrudan shell'in sahnesine giriyor ve input bölgesi
actor'ün kendi dikdörtgeni kadar oluyor — istenen davranış tam olarak bu.

### Neden parametrik poz sistemi yok

İlk plan pozları parametrik tutmaktı (bacak kaldırma miktarı, gövde eğimi,
göz kayması). Ekran kaydından 35 gerçek kare çıkınca bu gereksizleşti: kareler
zaten var, tek yapılması gereken onları çizmek.

Bu aynı zamanda maskotun "kopuk bacak" sorununu da kökten çözüyor. Maskotta
bacak diye ayrı bir parça yok — gövdenin alt kenarından yukarı yarıklar
kesilmiş, kalan sütunlar bacak olarak okunuyor. Izgara temsili bunu
kendiliğinden doğru tutuyor; bacağın gövdeden kopması yapısal olarak imkânsız.

### Ölçek

Maskotun düzgün bir piksel ızgarası yok — bacak yarıklarının genişlikleri
birbirini tutmuyor (bir kayıtta 22/20/22/40/22/20/22 piksel). Bu yüzden
otomatik ızgara tespiti güvenilmez. Ölçek bilinen bir şeye sabitlendi:
maskotun kolları açıkken eni **34 hücre**. Ayrıntı `KAYIT.md`'de.

---

## Fazlar

Her fazın Claude Code'a verilecek hazır komutu `prompts/faz-N-*.md` içinde.

### Faz 0 — İskelet ve geliştirme döngüsü ⚠️ EN ÖNEMLİ FAZ

Wayland'de gnome-shell yeniden başlatılamaz. Her değişiklikte oturum kapatıp
açmak zorunda kalırsan bu proje biter. İlk iş iterasyon döngüsünü kurmak:
`make nested` ve `make logs`.

Çıktı: ekranda sürüklenebilir düz bir dikdörtgen. Dışına tıklayınca altındaki
pencere tıklanıyor.

### Faz 1 — Sprite motoru

`assets/animations.json` yüklenir, kareler Cairo ile yatay şeritler hâlinde
çizilir, `holds` süreleriyle oynatılır. Yanında `make preview`: shell'e hiç
dokunmadan kareleri bağımsız bir pencerede gösteren araç.

### Faz 2 — Katman ayrımı ve input bölgesi

Kare iki katmana ayrılır: karakter (`#`, `o`) ve laptop (`L`). İkisi ayrı
actor olur; karakter input alır, laptop `reactive: false` ile almaz.

Actor boyutu **animasyon boyunca sabit**: o animasyonun bütün karelerindeki
katman kutularının birleşimi, laptop için ayrı bir birleşim. Kare başına
boyutlandırma bilerek yapılmıyor — bir chrome actor'ün her allocation
değişikliği kompozitöre input bölgesini yeniden hesaplatıyor ve karakterin
sıkı kutusu zaten neredeyse her karede değişiyor. Her kare kendi içeriğini
bu sabit tuvalin içinde doğru ofsetle çiziyor.

### Faz 3 — Hook'lar ve durum

`hooks/claude-pet-hook.py`: stdin'den hook JSON'ını okuyup inbox'a düşüren
yazıcı, ve `settings.json`'a işaretlenmiş girdiler ekleyen kurulum aracı
(`install` / `uninstall` / `status`). Elle yazılmış hook'lara dokunmadan.

`lib/tracker.js`: `Gio.FileMonitor` ile inbox'ı izler, oturum başına durum
tutar, hepsini tek agregat duruma indirger.

Kaydolunacak olaylar: `SessionStart`, `UserPromptSubmit`, `PreToolUse`,
`PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Notification`,
`Stop`, `StopFailure`, `SessionEnd`, `SubagentStart`, `SubagentStop`.

### Faz 4 — Durum → animasyon eşlemesi

`lib/states.js` içinde tek bir tablo. Ayrı `if` zincirleri değil, tablo — ki
"şu araca şu animasyonu bağla" demek tek satır olsun.

En önemlisi **girdi bekleme durumu**: `PermissionRequest` ya da
`Notification(permission_prompt | agent_needs_input)` geldiğinde pet sana
döner, bekleme pozuna geçer. Bu pet'in tek gerçek işlevi; diğerlerinden görsel olarak
açık ara ayrılsın.

### Faz 5 — Ayarlar ve kalıcılık

GSettings: `position-x`, `position-y`, `monitor-index`, `scale`,
`sleep-timeout`, `attention-notify`, `laptop-enabled`. `prefs.js` Adw ile.
Sürükleme bitince konum yazılır; monitör değişirse ekran içine geri sıkıştır.

### Faz 6 — Paketleme

`make pack` → `.zip`, `make install`, `make uninstall`. Şema derlemesi
otomatik. README'nin kurulum bölümü doğrulanır.

---

## Riskler

- **Eklenti gnome-shell içinde çalışır.** Yakalanmamış exception tüm masaüstünü
  düşürür. Her `JSON.parse`, her dosya okuması `try/catch` içinde.
- **`disable()` her şeyi sökmeli.** Timeout, sinyal, dosya monitörü, actor.
  Kilit ekranından sonra hayalet actor birikmesin.
- **Input bölgesi dikdörtgendir.** Actor'leri sıkı tut, süs parçalarını ayrı ve
  `affectsInputRegion: false` ile ekle.
- **Pil.** Boştayken zamanlayıcıyı tamamen durdur. Uyku animasyonu 3 fps'de
  dönmesin; statik kare + seyrek göz kırpma yeterli.
- **GNOME sürümü.** `metadata.json` şu an `["46"]`. Yükseltmede ESM API'leri
  kırılabilir.

---

## Sonraki fazlara notlar

Faz sırasında görülen ama o fazın kapsamına girmediği için yapılmayan işler.

### Faz 0'dan

- **`affectsInputRegion` Wayland'de bir şey yapmıyor.** `ui/layout.js`
  `_updateRegions()`: `wantsInputRegion = … && !Meta.is_wayland_compositor()`.
  Girdi yönlendirmesi sıradan Clutter picking'iyle oluyor. Davranış istediğimiz
  gibi ama **Faz 2 buna göre yazılmalı**: laptop parçasını tıklama yutmaz yapan
  şey `reactive: false`. `affectsInputRegion: false` niyet belgesi olarak
  kalsın (X11'de ve ileride işe yarar), ama ona güvenilmesin.
- **`Clutter.DragAction` GNOME 46'da yok.** Sürükleme `global.stage.grab()` +
  el ile olay takibiyle yapılıyor. Yeni bir sürüklenebilir parça gerekirse
  `src/extension.js` içindeki `_onPress`/`_onMotion`/`_endDrag` üçlüsü örnek.
- **Kabuğun içinden ölçüm modülü.** Pcbridge'in `selftest.js`'i gibi bir
  `lib/selftest.js`: `get_actor_at_pos(PickMode.REACTIVE, …)` ile hangi
  aktörün tıklanacağını, ana döngü gecikmesini ve animasyon ölçeğini kabuğun
  içinden raporlar. Faz 0'da bir kez geçici olarak yazıldı ve sorunu anında
  buldu; kalıcı hâli Faz 1'de işe yarar.
- **Ölçek (`scale_factor`).** Faz 0 dikdörtgeni 96 px sabit. Faz 1'de çizim
  `St.ThemeContext.get_for_stage(global.stage).scale_factor` üzerinden
  ölçeklenmeli; `PET_SIZE`/`MARGIN` sabitleri de ona bağlanmalı.
- **`monitors-changed`.** Şu an sıkıştırma yalnızca açılışta ve sürükleme
  bitince yapılıyor. Monitör takılıp çıkarıldığında pet ekran dışında
  kalabilir — Faz 5'in işi.
- **Sürükleme eşiği.** Tek tıklama da "sürükleme bitti" sayılıp konumu
  yeniden yazıyor. Zararsız; Faz 5'te birkaç piksellik eşik eklenebilir.
- **`gnome-extensions enable` tuzağı.** Kabuk eklentiyi henüz taramamışsa
  D-Bus üzerinden hata veriyor (Pcbridge `install.sh` bunu belgelemiş).
  Gerçek oturumda `make enable` patlarsa yedek yol `gsettings` ile
  `enabled-extensions` listesini düzenlemek.
- **Symlink ile kurulum.** `make install` kopyalıyor. Pcbridge symlink
  kullanıyor; ESM önbelleği yüzünden her iki durumda da kabuk yeniden
  başlaması gerektiği için kazanç sınırlı, ama Faz 6'da düşünülebilir.
- **Test kurgusu notu.** pcbridge ile sürükleme denerken `hold` doğrudan
  çağrılırsa imleç hedefe varmadan basılıyor ve basma ESKİ konuma düşüyor.
  Önce `move`, sonra `hold`.

### Faz 1'den

- **Kabuk `enabled-extensions`/`disabled-extensions`'ın sahibi.** Kabuk
  ayaktayken bu iki anahtarı dconf'tan yazmak sessizce geri alınıyor. Eklentiyi
  açıp kapatmanın tek güvenilir yolu kabuğun D-Bus'ı. `tools/nested.sh` bunu
  açılış sonrası doğrulayıp gerekirse kendisi düzeltiyor.
- **İzole dconf'a tek yazıcı değmeli.** Nested kabuk açıkken host tarafından
  `gsettings` yazmak nested'in yazdıklarını eziyor. Test komutlarında hep
  `DBUS_SESSION_BUS_ADDRESS="$(tools/nested.sh --bus)"` kullan.
- **Bozuk varlıkta pet görünmez oluyor.** `animations.js` boş varsayılana
  düşüp `console.warn` basıyor; ekranda hiçbir şey yok. Faz 5'te görünür bir
  "varlık bozuk" göstergesi (tek renk kare, farklı renk) düşünülebilir.
- **`sprite.js` bilerek kabuktan bağımsız.** Yeni çizim kodu eklerken bu
  ayrımı bozma: `St`, `Main`, `global` o dosyaya girmemeli, yoksa
  `make preview` çalışmaz hâle gelir ve sanat iterasyonu `make nested`'e
  düşer (çok daha yavaş).
- **GJS Cairo'da `ImageSurface.create` yok**, `new Cairo.ImageSurface(...)`
  var. PNG'ye çizen bir araç yazarken (kontak sayfası, poz atölyesi) gerekli.
- **Ölçek tek yerden.** `BASE_CELL × scale_factor` yalnızca `extension.js`'te
  hesaplanıyor ve `sprite.js`'e parametre olarak giriyor. Faz 5'te
  `scale` ayarı eklenince de bu tek nokta değişsin.

### Faz 2'den

- **`notify::allocation` her chrome actor'ünde `_queueUpdateRegions` tetikliyor.**
  `layout.js::_trackActor` (46.0) `notify::visible` ve `notify::allocation`
  sinyallerini `affectsInputRegion` ne olursa olsun bağlıyor. Yani bir chrome
  actor'ünü kare başına boyutlandırmak/taşımak, `affectsInputRegion: false`
  olsa bile her karede bir `BEFORE_REDRAW` later kuruyor. Wayland'de o later
  bizim actor'lerimizi atlıyor (`wantsInputRegion` false), ama X11'de doğrudan
  `set_stage_input_region` demek. Sabit tuval bu yüzden yalnızca titreme değil,
  taşınabilirlik meselesi.
- **Zamansal titreme hâlâ ölçülmedi.** Kare zamanlaması `GLib.timeout_add`
  (`PRIORITY_DEFAULT`) ile uyanıp `queue_repaint` çağırıyor; uyanışın
  kompozitörün kare saatine göre nereye düştüğü kontrol edilmiyor. 15 fps
  (66.7 ms) 60 Hz'in (16.67 ms) tam katı olduğu için teoride bölünme temiz,
  ama nested'de çıkış llvmpipe ile yazılım render ediliyor ve 60 Hz garanti
  değil. Görünür bir judder kalırsa doğru çözüm zamanlayıcıyı bırakıp
  `Clutter.frame-clock` / `laters` üzerinden sürmek.
- **Ekran görüntüsüyle ölçüm için renk toleransı gerekiyor.** Gerçek oturumun
  yakalamasında `#D87656` → `#d87858` çıkıyor (nested'de birebir). Piksel
  karşılaştıran bir test yazılırsa tolerans şart.
- **Katman eklemek tek satır.** `sprite.js::KATMANLAR`'a yeni bir karakter,
  `extension.js::KATMAN_AYARI`'na `reactive`/`affectsInputRegion` satırı; kutu,
  birleşim, gizleme ve konumlandırma kendiliğinden geliyor. Gölge ya da
  düşünce baloncuğu böyle eklenmeli — asla karakter actor'üne çizilerek değil,
  yoksa tıklama yutulan alan büyür.
- **Sürükleme eşiği (Faz 0'dan devam).** Karakterin üstüne tek tıklamak hâlâ
  "sürükleme bitti" sayılıp konumu yeniden yazıyor; Faz 2 doğrulamasında bu
  bir kez logda göründü. Zararsız ama Faz 5'te birkaç piksellik eşik.
