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

**Actor boyutu kare başına DEĞİŞMEZ.** Bu önemli, sebebi aşağıda.

- Her animasyon için, o animasyonun **bütün karelerindeki** karakter
  katmanının sınırlayıcı kutularının **birleşimini** hesapla. Laptop katmanı
  için ayrı bir birleşim. Bu iki kutu o animasyon boyunca sabit actor
  boyutlarıdır.
- Actor'ler yalnızca **animasyon değişince** yeniden boyutlanır — saniyede
  15 kez değil, birkaç saniyede bir.
- Her kare, kendi içeriğini bu sabit tuvalin içinde doğru ofsetle çizer.
  Karakter ekranda yerinden oynamaz, çünkü tuval oynamıyor.
- Bir katman o karede boşsa actor'ü gizle (`hide()`), yok etme. Gizli actor
  input bölgesine girmemeli.

**Sürükleme** karakter actor'ünde kalsın. Laptop actor'ü hiçbir olay almasın.

**Sürükleme sırasında** iki actor birlikte hareket etsin.

## Dikkat

- **Neden kare başına boyutlandırmıyoruz:** `affectsInputRegion: true` olan
  bir chrome actor'ün her `set_size` / `set_position` çağrısı Mutter'a input
  bölgesini yeniden hesaplatır. Bu kompozitör düzeyinde bir iş; animasyon
  hızında yapılırsa görünür titremeye yol açar. Karakterin sıkı kutusu ise
  kollar ve bacaklar oynadığı için neredeyse her karede değişir — yani
  "değişmediyse çağırma" koruması burada işe yaramaz. Çözüm kutuyu animasyon
  boyunca sabitlemek.
- Birleşim kutusu en sıkı kutudan birkaç hücre büyük olur. Kabul edilebilir:
  laptobu ve tuvalin boş kenarlarını dışarıda bıraktığı sürece tıklama yutulan
  alan hâlâ karakterin kendisi kadar.
- `hide()` edilmiş bir actor input bölgesine girmemeli; girmediğini doğrula.

## Kısıtlar

- Hook'lara, duruma, ayarlar penceresine girme.
- `assets/animations.json`'a dokunma.

## Bitti sayılma koşulu

- [ ] Laptop görünürken bile, karakterin **sol tarafındaki boşluğa** tıklayınca
      altındaki pencere tıklanıyor
- [ ] Karakterin üstüne tıklayıp sürükleyince ikisi birlikte hareket ediyor
- [ ] Animasyon boyunca karakter ekranda titremiyor, yerinden kaymıyor.

      **Bilinen durum:** Faz 1 sonunda nested kabukta hafif bir titreme
      gözlendi. `make preview` ile ölçüldü — **orada titreme YOK.** Yani
      kaynağı kareler ya da zamanlama değil; actor/repaint yolu veya nested'in
      render'ı. Faz 2 bu yolu zaten yeniden yazıyor.

      Bu maddede iki şeyi ayrı ayrı raporla: (a) sabit tuval yaklaşımından
      sonra nested'de titreme kaldı mı, (b) gerçek oturumda (nested değil)
      titreme var mı. İkisi farklı çıkarsa sorun nested'in sanal çıkışıdır,
      kodun değil.
- [ ] Laptop olmayan karelerde laptop actor'ü gizli ve input yutmuyor
- [ ] Devre dışı bırakınca iki actor de sökülüyor, kalıntı yok

Doğrulamayı gözle yap: iç içe oturumda maskotun altına bir metin düzenleyici aç,
laptobun bulunduğu bölgeye tıkla, imlecin düzenleyiciye gittiğini gör.

## Not düş, yapma

Bu faz sırasında animasyonda düzeltilmesi gereken bir şey fark edersen
`docs/PLAN.md`'nin sonuna not düş. Kareler poz atölyesinde düzeltilir, kodda
değil.
