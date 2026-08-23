# Faz 5 — Ayarlar ve kalıcılık

> Bu dosyanın tamamını Claude Code'a yapıştır.

---

`CLAUDE.md`'yi ve `docs/PLAN.md`'nin Faz 5 bölümünü oku. Faz 4 bitmiş olmalı:
pet Claude Code'a tepki veriyor.

Bu faz kullanılabilirlik fazı. Yeni davranış yok, var olanı ayarlanabilir
yapıyor.

## Şema

`src/schemas/org.gnome.shell.extensions.claude-pet.gschema.xml`:

| Anahtar | Tip | Varsayılan | Ne yapar |
|---|---|---|---|
| `position-x`, `position-y` | `i` | -1 | Kayıtlı konum (-1 = sağ alt) |
| `monitor-index` | `i` | -1 | Hangi monitör (-1 = birincil) |
| `scale` | `i` | 3 | Hücre boyutu (1–8) |
| `sleep-timeout` | `i` | 180 | Kaç saniye boştan sonra uyusun |
| `attention-notify` | `b` | true | Girdi beklerken bildirim gönderilsin mi |
| `laptop-enabled` | `b` | true | Laptop katmanı çizilsin mi |
| `paused` | `b` | false | Pet duraklatıldı mı |

Şema değişikliği geriye dönük uyumlu olsun; var olan anahtarların tipini
değiştirme.

## `src/prefs.js`

`resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js` içindeki
`ExtensionPreferences`'tan türet, Adw ile yaz.

Üç grup yeter:
- **Görünüm** — boyut, laptop açık/kapalı
- **Davranış** — uyku süresi, girdi beklerken bildirim
- **Konum** — hangi monitör, "konumu sıfırla" düğmesi

Ayarlar anlık uygulansın; `settings.bind` kullanabildiğin yerde kullan.

## `src/extension.js`

- Şema anahtarlarına bağlan, değişince canlı uygula. `scale` değişince
  actor'ler yeniden boyutlansın, şerit ön-hesabı yeniden yapılsın.
- **Bütün `connect()` id'lerini sakla ve `disable()`'da kes.** Ayar
  dinleyicileri sızıntının en sık kaynağı.

## Konum mantığı

Bu kısım göründüğünden zor, dikkatli yaz:

- Sürükleme bitince konumu yaz — sürükleme *sırasında* her karede yazma.
- Konum, kaydedildiği monitöre göre **göreli** saklansın; monitör değişince
  ya da çözünürlük değişince pet ekran dışında kalmasın.
- `Main.layoutManager.connect('monitors-changed')` ile ekran sınırlarına geri
  sıkıştır.
- Kaydedilmiş monitör artık yoksa birincil monitöre düş.
- "Konumu sıfırla" düğmesi sağ alta geri koysun.

## Sağ tık menüsü

Karakter actor'üne sağ tık menüsü ekle (`PopupMenu`):
- Duraklat / Devam et (`paused` anahtarını değiştirir)
- Ayarlar (prefs penceresini açar)
- Konumu sıfırla

Menü açıkken pet'in animasyonu dursun. Menü bir chrome actor'ün üstünde
açıldığından konumlandırmayı test et.

`paused` true iken: pet nötr karede kalır, tracker dinlemeye devam eder ama
animasyon oynatılmaz, zamanlayıcı kurulmaz.

## Kısıtlar

- Yeni animasyon, yeni durum, yeni hook yok.
- `assets/animations.json`'a dokunma.

## Bitti sayılma koşulu

- [ ] `make install && make enable` sonrası ayarlar penceresi açılıyor
- [ ] Boyutu değiştir → pet anında büyüyor/küçülüyor, bulanıklaşmıyor
- [ ] Laptobu kapat → laptop actor'ü kayboluyor ve input yutmuyor
- [ ] Duraklat → animasyon duruyor, CPU sıfır; devam et → kaldığı yerden
- [ ] Pet'i sürükle, oturumu kapat aç → aynı yerde
- [ ] İkinci bir monitör bağla/çıkar (ya da çözünürlük değiştir) → pet ekran
      içinde kalıyor
- [ ] "Konumu sıfırla" çalışıyor
- [ ] Sağ tık menüsü açılıyor, menü açıkken sol tık hâlâ altına geçiyor mu
      kontrol et
- [ ] Ayarları birkaç kez değiştirip eklentiyi kapat aç → log temiz, sızıntı yok

Ekran kilidini kilitle ve aç (`disable`/`enable` tetiklenir), sonra
`make logs`'a bak: uyarı olmamalı, ekranda tek bir pet olmalı.
