# UYGULA

> Kullanım: Claude Code'a **"UYGULA.md dosyasını uygula"** de. Başka bir şey
> söylemene gerek yok.

---

Sen bu projede fazlar hâlinde ilerleyen bir geliştiricisin. Bu dosya sana
nerede olduğunu bulmayı, tek bir fazı bitirmeyi ve durup rapor vermeyi
söyler.

## 1. Önce oku

Bu sırayla, tamamını:

1. `CLAUDE.md` — mutlak kurallar ve mimari
2. `docs/PLAN.md` — kararlar ve fazların özeti
3. `docs/ILERLEME.md` — hangi fazlar bitti (yoksa hiçbiri bitmemiş demektir)

Sonra sıradaki fazın komut dosyasını oku ve **onu uygula**:

| Sıradaki faz | Dosya |
|---|---|
| 0 | `prompts/faz-0-iskelet.md` |
| 1 | `prompts/faz-1-sprite-motoru.md` |
| 2 | `prompts/faz-2-katman-ve-input.md` |
| 3 | `prompts/faz-3-hooks-ve-durum.md` |
| 4 | `prompts/faz-4-animasyon-eslemesi.md` |
| 5 | `prompts/faz-5-ayarlar.md` |
| 6 | `prompts/faz-6-paketleme.md` |

`docs/ILERLEME.md` yoksa ya da boşsa Faz 0'dan başla.

## 2. Tek faz, sonra dur

**Bir seferde yalnızca bir faz uygula.** Bitince dur, rapor ver, bir sonrakine
geçme. Fazların doğrulaması gözle yapılıyor ve o iş bende; senin devam etmen
için benim onaylamam gerekiyor.

Faz komut dosyasındaki "Kısıtlar" bölümü hangi dosyalara dokunacağını söyler.
Başka bir yerde iyileştirme fırsatı görürsen **yapma** — `docs/PLAN.md`'nin
sonundaki "Sonraki fazlara notlar" başlığı altına yaz.

## 3. Doğrulama disiplini

Her faz komut dosyasının sonunda "Bitti sayılma koşulu" listesi var.

- Her maddeyi **kendin çalıştır ve sonucu gör.**
- "Muhtemelen çalışıyor", "çalışması lazım", "kod doğru görünüyor" kabul değil.
- Görsel maddeler için ekran görüntüsü al ve **görüntüye bak.** Aldım demek
  yetmiyor, bakman gerekiyor.
- Bir madde tutmuyorsa fazı bitti sayma. Düzelt, ya da düzeltemiyorsan dur ve
  neyin tutmadığını söyle.

Bu proje `gnome-shell` process'inin içinde çalışıyor. Yanlış bir satır
kullanıcının bütün masaüstünü düşürür. Emin olmadan ilerleme.

## 4. Takılırsan

Tahmin etme, dur ve sor. Özellikle şu durumlarda:

- Bir GNOME 46 API'sinin davranışından emin değilsen
- Bir faz komut dosyası, kodda gördüğünle çelişiyorsa
- Bir doğrulama maddesi iki kez denemene rağmen tutmuyorsa
- Bir faz, bir önceki fazın çıktısını değiştirmeni gerektiriyorsa

Ne denediğini, ne olduğunu ve hangi seçenekleri gördüğünü yaz. Sessizce
başka bir yoldan gitme.

## 5. Faz bitince

Sırayla şunları yap:

**a)** `docs/ILERLEME.md`'ye bir bölüm ekle:

```markdown
## Faz N — <ad>            <tarih>

Yapılanlar
- ...

Doğrulama
- [x] <madde>  → ne gördüğün
- [x] <madde>  → ne gördüğün

Notlar / bilinen eksikler
- ...
```

**b)** Bana kısa bir özet ver: ne yaptın, neyi doğruladın, nerede tereddüt
ettin. Uzun olmasın.

**c)** Bir commit mesajı **öner**, ama commit atma. Ben istediğimde atarsın.

## Kurallar özeti

`CLAUDE.md`'de ayrıntısı var, burada hatırlatma:

1. Her `JSON.parse` ve dosya okuması `try/catch` içinde. Bozuk veri pet'i
   susturur, shell'i değil.
2. `disable()` kurduğun her timeout'u, sinyali, dosya monitörünü ve actor'ü
   söker. Bu projede birinci sınıf hata.
3. Wayland'de `Alt+F2` → `r` yok. Test `make nested` ile.
4. Karakterin dikdörtgeni dışında hiçbir piksel tıklama yutmayacak.
5. `assets/animations.json` bir varlıktır, kod değil. Dokunma; yeni poz
   gerekiyorsa söyle, ben çizip vereceğim.
6. Türkçe yaz — yorumlar, commit mesajları, açıklamalar. Değişken ve fonksiyon
   adları İngilizce.
