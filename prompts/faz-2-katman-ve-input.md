# Faz 2 — Katman ayrımı ve input bölgesi

> Bu dosyanın tamamını Claude Code'a yapıştır.

---

`CLAUDE.md`'yi ve `docs/PLAN.md`'nin Faz 2 bölümünü oku. Faz 1 bitmiş olmalı:
maskot çiziliyor ve animasyon dönüyor.

## Sorun

Şu an tek bir actor var ve boyutu 53×37 hücrelik tuvalin tamamı. GNOME chrome
actor'lerinin input bölgesi **actor'ün dikdörtgeni** kadar olduğu için, tuvalin
şeffaf köşeleri de tıklama yutuyor. Laptop karakterin epey solunda durduğundan
bu alan hiç de küçük değil.

Projenin temel vaadi "maskotun dışındaki hiçbir piksel tıklama yutmayacak"
idi. Bu faz onu gerçekten sağlıyor.

## Yapılacak

**Kareyi iki katmana ayır.** Bu bedava, çünkü karakterler zaten ayrı:
- karakter katmanı: `#` ve `o`
- laptop katmanı: `L`

**`src/lib/sprite.js`** — çizim fonksiyonu hangi karakterleri çizeceğini
parametre olarak alsın. Her katman için ayrı şerit ön-hesabı ve **ayrı sıkı
sınırlayıcı kutu** (o katmanda dolu hücrelerin en küçük dikdörtgeni) çıkar.
Kutular hücre cinsinden, kare başına saklanır.

**`src/extension.js`** — iki actor:

| Actor | reactive | affectsInputRegion | Ne çizer |
|---|---|---|---|
| karakter | `true` | `true` | `#`, `o` |
| laptop | `false` | `false` | `L` |

Her ikisi de `Main.layoutManager.addChrome(...)` ile, `trackFullscreen: false`.

Her kare değişiminde:
- iki actor'ü de o karedeki kendi sıkı kutularına göre **yeniden boyutlandır ve
  konumlandır**
- konumlar ortak bir çıpaya göre hesaplansın: pet'in kaydedilmiş konumu tuvalin
  referans noktası olsun, actor'ler ona göre kaydırılsın. Karakter kare kare
  yerinden oynamamalı.
- bir katman o karede boşsa actor'ü gizle (`hide()`), yok etme

**Sürükleme** karakter actor'ünde kalsın. Laptop actor'ü hiçbir olay almasın.

**Sürükleme sırasında** iki actor birlikte hareket etsin.

## Dikkat

- Actor'lerin sık sık yeniden boyutlanması input bölgesinin yeniden
  hesaplanmasına yol açar. Kutu bir önceki kareyle aynıysa `set_size` /
  `set_position` çağırma — gereksiz iş ve titreme sebebi.
- `hide()` edilmiş bir actor input bölgesine girmemeli; girmediğini doğrula.
- Karakter kutusu her karede biraz değişiyor (kollar, bacaklar). Bu normal;
  önemli olan karakterin ekrandaki yerinin sabit görünmesi.

## Kısıtlar

- Hook'lara, duruma, ayarlar penceresine girme.
- `assets/animations.json`'a dokunma.

## Bitti sayılma koşulu

- [ ] Laptop görünürken bile, karakterin **sol tarafındaki boşluğa** tıklayınca
      altındaki pencere tıklanıyor
- [ ] Karakterin üstüne tıklayıp sürükleyince ikisi birlikte hareket ediyor
- [ ] Animasyon boyunca karakter ekranda titremiyor, yerinden kaymıyor
- [ ] Laptop olmayan karelerde laptop actor'ü gizli ve input yutmuyor
- [ ] Devre dışı bırakınca iki actor de sökülüyor, kalıntı yok

Doğrulamayı gözle yap: iç içe oturumda maskotun altına bir metin düzenleyici aç,
laptobun bulunduğu bölgeye tıkla, imlecin düzenleyiciye gittiğini gör.

## Not düş, yapma

Bu faz sırasında animasyonda düzeltilmesi gereken bir şey fark edersen
`docs/PLAN.md`'nin sonuna not düş. Kareler poz atölyesinde düzeltilir, kodda
değil.
