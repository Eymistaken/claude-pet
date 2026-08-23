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
actor olur; karakter input alır, laptop `affectsInputRegion: false` ile
almaz. Her actor kendi içeriğinin sıkı kutusuna oturur, böylece tıklama
yutulan alan karakterin kendisiyle sınırlı kalır.

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
döner, el sallar. Bu pet'in tek gerçek işlevi; diğer her şeyden görsel olarak
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
