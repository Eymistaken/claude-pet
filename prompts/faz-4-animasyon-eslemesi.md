# Faz 4 — Durum → animasyon eşlemesi

> Bu dosyanın tamamını Claude Code'a yapıştır.

---

`CLAUDE.md`, `docs/ANIMASYON.md` ve `docs/PLAN.md`'nin Faz 4 bölümünü oku.
Faz 3 bitmiş olmalı: `tracker.js` doğru durumu biliyor.

Bu faz pet'i hayata döndürüyor.

## Ön koşul: animasyonu üçe böl

`assets/animations.json` şu an tek bir 35 karelik `laptop_code` içeriyor. Claude
kaç saniye kod yazacağı belli olmadığı için bu tek parça kullanılamaz. Üçe
bölünmesi gerekiyor:

| Klip | Kareler | loop |
|---|---|---|
| `laptop_out` | açılış — cebe uzanma, laptobun çıkışı, dönüş | hayır |
| `typing` | yazma karelerinin döngüsü | evet |
| `laptop_away` | toparlanma, nötre dönüş | hayır |

**Bu bölme işini sen yapma.** Poz atölyesinde yapılacak ve JSON güncellenecek.
Bölünmüş dosya elinde yoksa dur ve söyle; ben bölüp vereceğim. Bölünmüş dosya
varsa devam et.

## Yazılacak dosyalar

### `src/lib/states.js`

**Tek bir tablo.** `if` zinciri yazma — "şu araca şu animasyonu bağla" demek
tek satır olmalı.

```js
export const TOOL_ANIM = {
  "Edit": "laptop_out", "Write": "laptop_out", "NotebookEdit": "laptop_out",
  "Bash": "scuttle", "BashOutput": "scuttle",
  "Read": "read", "Grep": "read", "Glob": "read",
  "WebSearch": "search", "WebFetch": "search",
  // ...
};
export const STATE_ANIM = {
  IDLE: "sleep", THINKING: "think", WAITING_INPUT: "wave",
};
```

Henüz çizilmemiş animasyonlar için (`sleep`, `wave`, `think`, `read`,
`scuttle`, `search`, `shake`, `celebrate`) **bir yedek zinciri** olsun: animasyon
JSON'da yoksa nötr duruşa düş ve `console.debug` ile bir kez bildir. Eksik
animasyon pet'i durdurmasın.

### `src/lib/director.js`

Durum değişimlerini animasyon dizisine çeviren katman. Asıl iş burada:

- **Kod yazma modu YAPIŞKANDIR.** Bu fazın en önemli kuralı.

  İlk `Edit` / `Write` / `NotebookEdit` gelince `laptop_out` bir kez oynar,
  bitince `typing` döngüye girer. Ondan sonra pet **kod yazma modunda kalır**.

  Araya giren `Read`, `Grep`, `Glob`, `Bash`, `WebSearch` gibi çağrılar
  laptobu **kaldırmaz** — Claude hâlâ aynı işin içinde. Bir dosyayı okumak
  için laptobu cebe koyup geri çıkarmak hem titrek durur hem yanlış anlatır.

  `laptop_away` yalnızca gerçekten farklı bir duruma geçilince oynar:

  | Çıkış tetiği | Sonrası |
  |---|---|
  | `WAITING_INPUT` (izin isteği, soru, plan onayı) | `wave` |
  | `Stop` (tur bitti) | `celebrate` |
  | `SessionEnd` | `sleep` |
  | `sleep-timeout` kadar hiç olay gelmemesi | `sleep` |

  `PostToolUseFailure` bir istisna: `shake` bir kez oynar ve **`typing`'e geri
  döner**, laptop kalkmaz. Hata kod yazmanın parçası.

  Uygulaması: `director` içinde `codingMode` diye bir bayrak tut. Yukarıdaki
  dört tetikten biri gelmeden `false` olmasın.
- **Tek seferlik tepkiler** araya girer, sonra önceki duruma döner:
  `PostToolUseFailure` → `shake`, `Stop` → `celebrate`.
- **`WAITING_INPUT` her şeyi ezer.** Devam eden animasyonu kes, `wave`'e geç.
  Yalnızca yeni bir `UserPromptSubmit` ya da `PostToolUse` ile temizlenir.
- **Boşta uyku.** `sleep-timeout` (varsayılan 3 dk) boyunca hiçbir olay
  gelmezse `sleep`. Uykuda zamanlayıcı tamamen dursun — tek statik kare, en
  fazla 10 saniyede bir göz kırpma.

### `src/extension.js`

`tracker.changed` sinyalini `director`'a bağla, `director` da `player`'ı
sürsün. Geçici "başlangıçta laptop_code oynat" kodunu kaldır.

### Dikkat çekme (isteğe bağlı ama önerilir)

`WAITING_INPUT` ilk kez girildiğinde `Main.notify()` ile kısa bir bildirim.
Ayarla kapatılabilir olsun (Faz 5'te anahtarı eklenecek; şimdilik sabit `true`
bırak ve TODO düş).

## Kısıtlar

- Yeni animasyon **çizme**. Eksik olanları yedek zinciriyle geç.
- `tracker.js`'in durum mantığına dokunma; o Faz 3'te bitti.
- Ayarlar penceresi Faz 5.

## Bitti sayılma koşulu

Gerçek bir Claude Code oturumuyla dene, `make replay` ile değil.

- [ ] Bir dosya okut → pet `read` (ya da yedek) oynatıyor
- [ ] Bir dosya düzenlet → `laptop_out` → `typing` zinciri çalışıyor
- [ ] **Arka arkaya üç Edit yaptır** → laptop bir kez çıkıyor, üçü boyunca
      elinde kalıyor, sonunda bir kez kalkıyor
- [ ] İzin isteyen bir komut çalıştır → pet `wave`'e geçiyor ve sen cevap
      verene kadar öyle kalıyor
- [ ] Hata veren bir komut çalıştır → `shake` bir kez oynayıp önceki duruma
      dönüyor
- [ ] Tur bitince `celebrate` oynuyor
- [ ] 3 dakika bekle → `sleep`, ve gnome-shell CPU'su sıfıra iniyor
- [ ] JSON'da olmayan bir animasyon adı iste → pet nötre düşüyor, shell ayakta
- [ ] Devre dışı bırakınca bütün zamanlayıcılar sökülüyor

Bir ekran kaydı al ve izle — bu fazın çıktısı hissedilen bir şey, log değil.
