# Faz komutları

Her dosya, Claude Code'a olduğu gibi yapıştırılacak bir komut. Sırayla git,
atlama.

| Dosya | Ne bitiriyor |
|---|---|
| `faz-0-iskelet.md` | Sürüklenebilir dikdörtgen + `make nested` geliştirme döngüsü |
| `faz-1-sprite-motoru.md` | Kareler JSON'dan Cairo ile çiziliyor, animasyon dönüyor |
| `faz-2-katman-ve-input.md` | Karakter/laptop ayrı actor; tıklama yalnızca karakterde durur |
| `faz-3-hooks-ve-durum.md` | Claude Code hook'ları + durum makinesi |
| `faz-4-animasyon-eslemesi.md` | Pet gerçekten tepki veriyor |
| `faz-5-ayarlar.md` | Ayarlar penceresi, konum kalıcılığı, sağ tık menüsü |
| `faz-6-paketleme.md` | Temiz kurulum, `.zip`, README doğrulaması |

## Nasıl kullanılır

En kısa yol — sıradaki fazı kendi bulur:

```sh
cd <proje kökü>
claude
```
```
UYGULA.md dosyasını uygula
```

Belirli bir fazı elle vermek istersen o dosyanın içeriğini yapıştır.
`CLAUDE.md` zaten otomatik yükleniyor, o yüzden prompt dosyaları kuralları
tekrar etmiyor.

## Faz bitince

Her prompt dosyasının sonunda **"Bitti sayılma koşulu"** listesi var. Claude
Code'un o listeyi tek tek doğrulaması gerekiyor — "muhtemelen çalışıyor" kabul
edilmiyor. Doğrulamadıysa bir sonraki faza geçme.

Özellikle Faz 0 ve Faz 2'yi kendi gözünle görmeden ilerleme:

- **Faz 0** geliştirme döngüsünü kuruyor. `make nested` çalışmıyorsa her
  değişiklik için oturum kapatıp açman gerekir ve proje orada ölür.
- **Faz 2** projenin temel vaadini sağlıyor: maskotun dışındaki hiçbir piksel
  tıklama yutmuyor. Bu tutmazsa pet masaüstünde bir engel hâline gelir.

## Sanat işi ayrı

Yeni poz eklemek kod işi değil. Poz atölyesinde çizilir, JSON dışa aktarılır,
`assets/animations.json`'ın üstüne yazılır. `docs/KAYIT.md` ve
`docs/ANIMASYON.md`'ye bak.

Faz 4'ün ön koşulu var: `laptop_code` animasyonunun `laptop_out` / `typing` /
`laptop_away` diye üçe bölünmüş olması. Bu bölme atölyede yapılır.
