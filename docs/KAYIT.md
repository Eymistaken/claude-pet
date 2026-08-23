# Ekran kaydından kare çıkarma

Maskotun herhangi bir animasyonunu elle çizmek yerine kaydedip otomatik
çıkarmak için: `tools/extract_frames.py`.

İlk kayıt işlendi. Sonuç `assets/animations.json` (35 kare,
53×37, 15 fps) ve poz atölyesine gömülü hâlde duruyor:
https://claude.ai/code/artifact/02fc5763-8381-4cc3-908e-1f4e4d6a1b8d

> Bu bağlantı yalnızca sana açık (özel artefakt). Repo herkese açık olacağı
> için başkası bu adresi açamaz — istersen paylaşmadan önce artefakt sayfasının
> paylaş menüsünden herkese açık hâle getir.

---

## 1. Kaydı al

GNOME'un kendi kaydedicisi (**Ctrl + Alt + Shift + R**) ya da OBS — ikisi de
olur. OBS kaydı `~/Videolar/OBS/` altına düşer.

Üç şey sonucu belirgin biçimde etkiler:

1. **Önce uygulamayı büyüt.** Claude masaüstünde `Ctrl` + `+`. Maskot ne kadar
   çok piksel kaplarsa o kadar iyi. İlk kayıtta gövde 274 piksel genişti,
   hücre başına 8 piksel düştü — bu gayet iyi bir orandı.
2. **Kayıt sırasında pencereyi oynatma.** Araç maskotun yerini ilk birkaç
   kareden bulup oraya kırpıyor.
3. **Animasyon bir kez baştan sona dönsün.** İki tur daha da iyi.

## 2. Çıkar

```sh
cd <proje kökü>
python3 tools/extract_frames.py "$HOME/Videolar/OBS/kayit.mp4" \
    -o assets/yeni.json --canvas 53x37 --preview /tmp/kontrol.png \
    --name animasyon_adi
```

`--canvas 53x37` önemli: mevcut karelerle aynı tuvale oturtur, böylece hepsi
tek belgede yan yana durabilir. Yeni ve bağımsız bir animasyonsa atlayabilirsin.

Çıktı:

```
kare atlama    : her 2 kareden biri (60 fps gereginden hizli)
maskot bolgesi : x635 y426  534x452
kaynak         : 177 kare @ 30 fps
govde          : 274 x 211 px
hucre boyutu   : 8.06 px  ->  66x56 izgara (govde eni 34 hucre)
esik           : 9 hucre farkina kadar ayni sayildi
benzersiz kare : 35   tutma: [26, 1, 2, 1, 2, ...]
onerilen fps   : 15
tuval          : 53 x 37
```

**`kontrol.png`'ye bak.** Bütün pozlar orada mı, laptop çıkmış mı? Bu adımı
atlama.

## 3. Editöre aktar

```sh
wl-copy < assets/yeni.json
```

Poz atölyesinde sağdaki JSON kutusuna yapıştır, **İçe al**'a bas. Tuval boyutu
aynıysa "yanına ekle mi, yerine mi geçsin" diye sorar.

---

## Ölçek nasıl belirleniyor

Bu kısım önemli, çünkü ilk tahminim yanlıştı.

Maskotun **düzgün bir piksel ızgarası yok.** Blok blok göründüğü için öyle
sanılıyor, ama bacak yarıklarının genişlikleri birbirini tutmuyor: ilk kayıtta
bir bacak satırı `22px bacak / 20px boşluk / 22px bacak / 40px boşluk /
22px bacak / 20px boşluk / 22px bacak` şeklindeydi. 20 ile 22 aynı hücrenin
katları değil. Yani "her renk sınırı hücre sınırına düşer" varsayımı yanlış ve
otomatik periyot araması (denedim, hem tam sayı hem Fourier ile) güvenilir
sonuç vermiyor — üst harmoniklere kayıyor.

Bunun yerine ölçek **bilinen bir şeye sabitlendi**: referans karelerde maskotun
kolları açıkken eni 34 hücre. Araç kayıttaki en geniş gövde kutusunu ölçüp 34'e
bölüyor. Sonuç editördeki diğer karelerle otomatik olarak aynı ölçekte oluyor.

Daha ince ya da daha iri blok istersen `--grid` ile değiştir:

```sh
--grid 34   # varsayılan, referansla aynı
--grid 48   # daha ayrıntılı, daha çok hücre
--grid 24   # daha iri, daha stilize
```

Kalan pürüzler zaten editörde düzeltilecek — araç mükemmel çıktı vermek zorunda
değil, iyi bir başlangıç vermesi yeterli.

## Ters giderse

| Belirti | Çare |
|---|---|
| Karakter fazla bulanık/pürüzlü | `--grid 24` ile irileştir, ya da uygulamayı büyütüp yeniden kaydet |
| Ayrıntı kayboluyor | `--grid 48` |
| Çok fazla benzersiz kare | `--tol 20` ile eşiği yükselt |
| Ayrı pozlar tek kareye kaynamış | `--tol 3` |
| Laptop kesilmiş | `--pad 0.9` ile kırpmayı genişlet |
| Arayüzden gri parçalar karışmış | `--no-laptop` |
| "Maskot cok kucuk gorunuyor" | Uygulamayı büyütüp yeniden kaydet |
| "Maskotun rengi bulunamadi" | `--no-locate` ile tüm kareyi işlet |
| Sadece bir bölüm lazım | `--start 00:00:12 --duration 5` |

## Nasıl çalışıyor

1. Maskotun yeri **renginden** bulunur, tüm kareler ffmpeg ile doğrudan o
   bölgeye kırpılarak çıkarılır.
2. Piksel sınıflandırması (gövde / göz / laptop) ve ızgaraya indirgeme
   Pillow'un C tarafında yapılır; Python yalnızca küçük ızgara üzerinde çalışır.
   1920×1080 60 fps bir kayıt bu sayede **4 saniyede** işleniyor.
3. Göz, gövdenin içinde kalıp dışarıdan ulaşılamayan koyu bölge olarak bulunur.
   Laptop, gövdenin yakınındaki küçük gri parçalar olarak — arayüzdeki gri
   şeyler ayak hizasının altında kaldıkları için elenir.
4. Benzer ardışık kareler kümelenip **hücre bazında çoğunluk oyuyla** tek
   kareye indirilir; video sıkıştırmasının titrettiği hücreler böylece silinir.
5. Kaç kaynak karesi tutulduğu `hold` olarak yazılır — animasyonun **gerçek
   ritmi korunur**. İlk kayıtta açılış duruşu 26 kare, kapanış 16 kare tutuyordu;
   aradaki hareket 1–2 karelik. Editörde `×26` gibi rozetlerle görünüyor.
