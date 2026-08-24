# Faz 4 — Durum → animasyon eşlemesi

> Bu dosyanın tamamını Claude Code'a yapıştır.

---

`CLAUDE.md` ve `docs/ANIMASYON.md`'yi oku. Faz 3 bitmiş olmalı: `tracker.js`
doğru durumu biliyor.

Bu faz pet'i hayata döndürüyor. Dört davranış var, fazlası yok.

## Ön koşul: animasyon varlıkları

`assets/animations.json` içinde şunlar hazır olmalı:

| Klip | loop | Ne |
|---|---|---|
| `idle` | evet | Düz duruş (zaten var) |
| `laptop_out` | hayır | Cebe uzanma, laptobun çıkışı, dönüş |
| `typing` | evet | Yazma döngüsü |
| `laptop_away` | hayır | Toparlanma, düz duruşa dönüş |
| `waiting_in` | hayır | Kutuya çökme |
| `waiting` | evet | Kutu — bekliyor (tek statik kare) |
| `waiting_out` | hayır | Uyanma, düz duruşa dönüş |

**Yedisi de `assets/animations.json` içinde hazır, doğrulandı.** Bölme işi poz
atölyesinde yapıldı; sen varlığa dokunma. Bir klip eksikse dur ve söyle.

Yapı iki üçlüden ibaret: `laptop_out → typing → laptop_away` ve
`waiting_in → waiting → waiting_out`. Her üçlüde **ortadaki döngüde döner**,
yandakiler bir kez oynar.

## `src/lib/director.js`

`tracker.changed` sinyalini dinler, `player`'ı sürer. Dört kural:

**1. `WORKING` → laptop çıkar ve kalır.**

`laptop_out` bir kez oynar, bitince `typing` döngüye girer. Ondan sonra pet
kod yazma modunda kalır. Araya giren araç çağrıları laptobu **kaldırmaz** —
Claude hâlâ aynı işin içinde, her çağrıda laptobu cebe koyup çıkarmak hem
titrek durur hem yanlış anlatır.

**2. `IDLE` → laptop kalkar, düz durur.**

`laptop_away` oynar, sonra `idle`. Zaten `IDLE`'daysa bir şey yapma.

**3. `WAITING` → bekleme pozu.**

Devam eden animasyonu kes, `laptop_away` oynat (laptop varsa), sonra `waiting_in` bir kez, ardından
`waiting` döngüsüne gir.
`WAITING` her şeyi ezer; pet'in tek gerçek işlevi Claude'un sana takıldığını
haber vermek.

**4. Animasyonu ortasından kesme.**

Durum değişince çalan klibi anında kesme — **bulunduğu turu bitirmesini bekle.**
`typing` döngüsünün ortasındayken iş biterse, o turun son karesine kadar oynasın,
sonra `laptop_away`'e geç. Aynısı `waiting` için de geçerli.

Bekleme süresi kısadır (17 karelik bir döngü 15 fps'de en fazla ~1.1 sn) ve
karşılığında hareket kopuk değil akıcı görünür. Tek istisna aşağıdaki rate limit.

**5. Rate limit → laptop aniden kaybolur.**

`tracker` `rateLimited` bayrağıyla `IDLE` verdiğinde `laptop_away`'i
**oynatma**. Laptop actor'ünü doğrudan gizle ve `idle`'a geç. Ani olması
kasıtlı: bir şey ters gitti, animasyonlu bir kapanış yanlış ton olur.

**Boşta uyku:** `sleep` klibi varlıkta varsa, `sleep-timeout` (varsayılan 3 dk)
sonunda ona geç. Yoksa `idle`'da kal. Uykuda zamanlayıcı tamamen dursun.

## `src/lib/states.js`

Durum → klip adı eşlemesi. Tek bir tablo, `if` zinciri değil:

```js
export const STATE_ANIM = {
  IDLE: 'idle',
  WORKING: 'typing',
  WAITING: 'waiting',
};
```

Klip varlıkta yoksa `idle`'a düş ve bir kez `console.debug` ile bildir. Eksik
animasyon pet'i durdurmasın.

## `src/extension.js`

`tracker` → `director` → `player` zincirini kur. Faz 1'in geçici
`GECICI_ANIMASYON` sabitini ve döngü zorlamasını kaldır.

## Kısıtlar

- Animasyon **çizme**, `assets/animations.json`'a dokunma.
- Araç adı eşlemesi yapma. `WORKING` tek bir durum.
- `tracker.js`'in mantığına dokunma, o Faz 3'te bitti.

## Bitti sayılma koşulu

Gerçek bir Claude Code oturumuyla dene.

- [ ] Claude Code kapalıyken pet düz duruyor
- [ ] Bir şey yaptır → laptop çıkıyor ve **iş bitene kadar elinde kalıyor**
      (arada birkaç farklı araç çalışsa da)
- [ ] İzin isteyen bir komut → laptop kalkıyor, pet bekleme pozuna geçiyor,
      sen cevap verene kadar öyle kalıyor
- [ ] Cevap ver → `waiting_out` bir kez oynuyor, sonra yazmaya dönüyor
- [ ] Tur bitince laptop kalkıyor, düz duruşa dönüyor
- [ ] **Yazma döngüsünün ortasında iş bitse bile animasyon yarıda kesilmiyor**,
      tur tamamlanıp öyle geçiyor
- [ ] Rate limit senaryosunu `make replay` ile tetikle → laptop **aniden**
      kayboluyor, animasyon oynamıyor
- [ ] Varlıkta olmayan bir klip iste → pet `idle`'a düşüyor, shell ayakta
- [ ] 3 dk bekle → boşta, gnome-shell CPU'su sıfır
- [ ] Devre dışı bırakınca bütün zamanlayıcılar sökülüyor

Bir ekran kaydı al ve izle — bu fazın çıktısı hissedilen bir şey, log değil.
