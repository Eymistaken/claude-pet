# Devir notu

Bu dosya **yeni bir sohbete devretmek için**. Projenin durumu, alınan kararlar
ve düşülmüş tuzaklar burada. Yeni sohbette önce bunu okut.

Tarih: 2026-08-24 · Faz 2 bitti, Faz 3 sırada.

---

## Proje nedir

GNOME Shell 46 eklentisi. Claude Code'un ne yaptığını masaüstünde bir maskotla
gösterir. Zorin OS 18.1 · Wayland · gjs 1.80.2.

Repo: `~/Belgeler/Claude_Pet/claude-pet` · GitHub'a yüklendi, herkese açık.

## Durum

| Faz | Durum |
|---|---|
| 0 — iskelet, nested geliştirme döngüsü | bitti |
| 1 — sprite motoru, Cairo çizim | bitti |
| 2 — katman ayrımı, input bölgesi | bitti |
| **3 — hook'lar ve durum** | **sırada** |
| 4 — animasyon eşlemesi | animasyonlar hazır, bekliyor |
| 5 — ayarlar · 6 — paketleme | sonra |

Ayrıntı `docs/ILERLEME.md`'de, Claude Code her faz sonunda oraya yazıyor.

## İş akışı

Kullanıcı Claude Code'a **`UYGULA.md dosyasını uygula`** diyor. O da
`docs/ILERLEME.md`'den nerede kalındığını bulup sıradaki `prompts/faz-N-*.md`
dosyasını uyguluyor, bitince durup rapor veriyor. Tek faz, sonra dur.

Bu sohbetteki (Cowork'teki) rol farklı: **plan ve prompt'ları yazmak, kararları
tartışmak, animasyon varlıklarını hazırlamak, Claude Code'un sorduğu sorulara
ne cevap verileceğini söylemek.** Kod yazmıyor.

## Animasyon boru hattı

```
poz atölyesi (tarayıcı)  →  JSON  →  assets/animations.json  →  make install  →  kurulu kopya
```

- Atölye: `tools/poz-atolyesi.html`, kopyası `~/Masaüstü/clawd-poz-atolyesi.html`
- Dışa aktarma: **Panoya kopyala** → `wl-paste > assets/animations.json`
- Akış **tek yönlü**. Repodaki dosyayı editöre geri yüklersen tarayıcıdaki
  düzenlemeler gider.
- Kurulu kopya ayrı bir dizinde (`~/.local/share/gnome-shell/extensions/...`).
  `make install` yapmadan eklenti eski kareleri oynatır — `make preview` repo
  kopyasını okur, bu ikisi ayrışabilir.

`tools/extract_frames.py`: ekran kaydından kare çıkarır. `docs/KAYIT.md`.

## Animasyon varlıkları — KESİNLEŞTİ, DOKUNMA

`assets/animations.json`, 53×37 hücre. Eklentinin aradığı yedi klip:

| Klip | Kare | Tür |
|---|---|---|
| `idle` | 1 | döngü |
| `laptop_out` | 12 | bir kez |
| `typing` | 17 | **döngü** |
| `laptop_away` | 6 | bir kez |
| `waiting_in` | 8 | bir kez |
| `waiting` | 1 | döngü (statik) |
| `waiting_out` | 9 | bir kez |

İki üçlü: her üçlüde **ortadaki döngüde döner**, yandakiler bir kez oynar.

Dosyada ayrıca `laptop_code`, `duruslar_9`, `idle_ham`, `waiting_ham` var —
kullanıcının ham çizimleri ve kaynakları. Kullanılmıyorlar ama **silme.**
Yedek: `assets/animations.yedek.json`.

Palet: gövde `#D87656`, göz `#2B2A26`, laptop `#8B8B8B`.
Karakterler: `#` gövde, `o` göz, `L` laptop, `.` boş.

## İstenen davranış

```
Claude çalışıyor  →  laptop_out  →  typing ↻
sana soru sordu   →  laptop_away →  waiting_in →  waiting ↻
sen cevap verdin  →  waiting_out →  laptop_out →  typing ↻
iş bitti          →  laptop_away →  idle ↻
rate limit        →  laptop ANİDEN kaybolur (animasyon yok) →  idle
```

- **Kod yazma modu yapışkan.** Araya giren Read/Bash/Grep laptobu kaldırmaz.
- **Animasyon ortasından kesilmez**, bulunduğu turu bitirir. Tek istisna rate
  limit.
- El sallama, titreme, kutlama gibi ekstralar **istenmedi**, eklenmeyecek.

## Kararlar ve gerekçeleri

**Neden eklenti, pencere değil.** Wayland istemciye pencere konumlandırma
vermiyor, "always on top" yok, tıklama geçirgenliği pencere sınırının dışına
taşınamıyor. Mutter `wlr-layer-shell` desteklemiyor. Tek yol shell'in sahnesine
Clutter actor koymak.

**Neden parametrik poz sistemi yok.** Ekran kaydından 35 gerçek kare çıkınca
gereksizleşti. Kareler ızgara olarak saklanıyor, Cairo yatay şeritler çiziyor.

**Bacaklar oyuk, çıkıntı değil.** Maskotta bacak diye ayrı parça yok; gövdenin
altından yarıklar kesilmiş. Izgara temsili bunu kendiliğinden doğru tutuyor.

**Ölçek 34 hücreye sabit.** Maskotun ızgarası düzgün değil — bir bacak satırı
22/20/22/40/22/20/22 piksel ölçüldü. Otomatik periyot tespiti (tam sayı ve
Fourier, ikisi de) üst harmoniklere kayıyor. Kolları açıkken en = 34 hücre
referans alınıyor.

## Düşülmüş tuzaklar — tekrar düşme

**inotify tükenmesi.** Her nested koşum ~13 yetim servis bırakıyor;
`fs.inotify.max_user_instances` (128) dolunca `Gio.FileMonitor` **sessizce**
çalışmaz oluyor. Belirtisi: testler kodda hiçbir şey değişmeden düşüyor.
`tools/nested.sh` her koşumda temizliyor. Faz 3'ün tamamı FileMonitor üstünde —
prompt'ta kanarya maddesi var, atlatma.

**`pkill -f 'gnome-shell --nested'` çağıranı öldürür.** Desen betiği çalıştıran
kabuğun komut satırına da uyuyor. `^` ile bağlı, PID dosyası var.

**dconf veritabanı adında tire olmaz.** `claude-pet-nested` → dconf abort
ediyor (`object_path` assertion), çünkü D-Bus nesne yolunda `-` geçersiz.
`claude_pet_nested` çalışıyor. Nested oturum izole dconf kullanıyor; ayarlara
dokunan **her** komutta `DCONF_PROFILE` export edilmeli.

**Kare başına actor yeniden boyutlandırma titretir.** `affectsInputRegion: true`
olan chrome actor'ün her `set_size` çağrısı Mutter'a input bölgesini yeniden
hesaplatıyor. Çözüm: actor boyutu animasyon boyunca sabit (o animasyondaki
kutuların birleşimi), sadece animasyon değişince yeniden boyutlanır.

**Bölme adı çakışması.** Poz atölyesinde bölmenin teknik adı `waiting`, kullanıcı
da çizimini `waiting` diye adlandırmıştı; × düğmesi bölmeyi değil çizimi sildi.
Düzeltildi: bölmeler sahiplik takip ediyor, kullanıcının animasyonuna
dokunamıyor, "Geri getir" var. Benzer bir tasarım yaparken dikkat.

## Sıradaki adım

Kullanıcı Claude Code'a Faz 3'ü verecek. `prompts/faz-3-hooks-ve-durum.md`
yeniden yazıldı (12 hook → 7, oturum başına durum yok, araç adı eşlemesi yok).
Claude Code eski planını hatırlıyorsa **prompt dosyasını yeniden okutmak şart.**

`docs/PLAN.md`'deki Faz 3–4 özet satırları güncel değil; **prompt dosyaları
esastır**, PLAN.md güncellenmesin.

Faz 3 bitince pet'te **görünür değişiklik olmayacak** — bu normal.

## Kullanıcı hakkında

Türkçe konuşuyor, cevaplar Türkçe olmalı. Aşırı detaydan hoşlanmıyor, kısa ve
net açıklama istiyor. Kendi araçlarını yazıyor (`pcbridge` MCP köprüsü ve iki
GNOME eklentisi onun). Mekanik işleri (kare çıkarma, bölme, zamanlama) devretmeyi
tercih ediyor; sanata ve tasarım kararlarına kendisi karar veriyor — çizimlerine
ve gözlere izinsiz dokunma.
