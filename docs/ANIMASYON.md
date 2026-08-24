# Maskot geometrisi ve animasyonlar

Kareler `assets/animations.json` içinde. Bu dosya onların nasıl okunacağını ve
`laptop_code` animasyonunun ritmini anlatır.

## Palet

| Karakter | Rol | Hex |
|---|---|---|
| `#` | Gövde | `#D87656` |
| `o` | Göz | `#2B2A26` |
| `L` | Laptop | `#8B8B8B` |
| `.` | Boş | — |

Gözü şeffaf bırakma. Pet açık renkli bir pencerenin üstüne geldiğinde gözler
kaybolur.

## Geometri

Tuval **53 × 37 hücre**. Nötr duruşta:

| Parça | Konum (hücre) |
|---|---|
| Gövde bloğu | x 23–45, y 12–33 → 23 geniş, 22 yüksek |
| Gözler | y 14–17, sol x 25–28, sağ x 40–43 |
| Kollar (yan çıkıntı) | y 18–22, her yanda 6 geniş |
| Bacaklar | y 29–34, gövdenin altından **kesilmiş** 4 yarık |

Kollar açıkken toplam en **34 hücre**. Ölçek referansı bu sayı; kayıttan kare
çıkarırken de bu kullanılıyor.

### Bacaklar çıkıntı değil, oyuktur

Maskotta bacak diye ayrı bir parça yok. Gövdenin alt kenarından yukarı üç yarık
kesilmiş, kalan dört sütun bacak olarak okunuyor. Bacağı gövdeye eklenen bir
dikdörtgen sanan her çizim yaklaşımı er geç bacakları gövdeden koparır.

Izgara temsili bunu kendiliğinden doğru tutuyor — bacak ayrı bir nesne değil,
gövdenin kendisi. Bacak kaldırmak, o yarığı derinleştirmek demek.

Yarıkların genişlikleri de birbirini tutmuyor (bir kayıtta ölçülen bir bacak
satırı: 22px bacak / 20px boşluk / 22px bacak / 40px boşluk / 22px bacak /
20px boşluk / 22px bacak). Yani düzgün bir alt ızgara aramanın anlamı yok.

## `laptop_code` — 35 kare, 15 fps

Ekran kaydından çıkarıldı, ritmi `holds` dizisinde korunuyor.

| Beat | Ne oluyor |
|---|---|
| duruş | Nötr, izleyiciye bakıyor. **26 kare tutuyor** |
| cebe uzanma | Gövde yatıyor, bir göz çizgiye dönüşüyor |
| çıkarma | Laptop kapalı hâlde beliriyor, havaya savruluyor |
| havada açılma | Laptop `L` biçimini alıyor |
| iniş | Laptop yere doğru, açılı |
| dönüş | Pet laptopa dönüyor, siluet daralıyor |
| yazma | Çömelmiş, kollar laptopta, gözler görünür. Döngünün gövdesi |
| toparlanma | Laptop yok, nötr duruşa dönüş. **16 kare tutuyor** |

### Üçe bölünmeli

Tek bir 35 karelik klip yanlış olur — Claude'un kaç saniye kod yazacağı belli
değil. Faz 4'te şu üçe ayrılacak:

| Klip | loop | Tetik |
|---|---|---|
| `laptop_out` | hayır | `PreToolUse` · Edit/Write/NotebookEdit |
| `typing` | **evet** | `laptop_out` bitince, araç sürdükçe |
| `laptop_away` | hayır | `PostToolUse`, ya da ~400 ms yeni Edit gelmezse |

Ardışık Edit çağrılarında laptopu her seferinde cebe koyup çıkarma.
`laptop_away`'i kısa bir gecikmeyle tetikle — bu, animasyonun tatlı durmasıyla
sinir bozucu durması arasındaki fark.

Bölme işi kod değil, editör işi: poz atölyesinde kareleri üç ayrı animasyona
dağıtıp JSON'u yeniden dışa aktar.

## Eklenecek pozlar

| Animasyon | Ne zaman |
|---|---|
| `sleep` | uzun süre boşta |
| `wake` | oturum başlıyor |
| `idle_blink` | boşta, seyrek göz kırpma |
| `think` | prompt gönderildi |
| `read` | Read / Grep / Glob |
| `scuttle` | Bash |
| `search` | WebSearch / WebFetch |
| **`waiting`** | **senin girdini bekliyor** |
| `shake` | araç hata verdi |
| `celebrate` | tur bitti |
| `exhausted` | rate limit |

`waiting` en kritik olanı. Pet'in tek gerçek işlevi Claude'un sana takıldığını
haber vermek; o pozu diğerlerinden açık ara ayır — gövde izleyiciye dönük, bir
kol yukarıda, hafif zıplama.
