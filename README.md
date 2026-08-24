# claude-pet

Claude Code'un ne yaptığını masaüstünde bir maskotla gösteren GNOME Shell
eklentisi. Kod yazarken cebinden bir laptop çıkarıp yazmaya başlar, senin
cevabını beklerken durup bekler, iş bitince laptobu kaldırır.

![claude-pet](docs/pet.gif)

> **English:** A GNOME Shell extension that shows what Claude Code is doing
> through a desktop mascot. Wayland-native — it draws into the shell instead of
> opening a window, so it stays on top, passes clicks through, and never steals
> focus.

**Hedef ortam:** GNOME Shell 46 · Wayland · Zorin OS 18 / Ubuntu 24.04

> ### KDE kullanıyorsan bu dosya sana değil
>
> Bu README GNOME Shell eklentisini anlatıyor. **KDE Plasma, Sway, Hyprland
> ve COSMIC** için aynı maskotun tek dosyalık AppImage sürümü var — aynı
> animasyonlar, aynı durum mantığı, `wlr-layer-shell` üzerinden:
> **[README-appimage.md](README-appimage.md)**.
>
> Ayrım tek bir protokole dayanıyor: GNOME'un kompozitörü Mutter
> `wlr-layer-shell` desteklemiyor, KWin ve wlroots destekliyor. İki sürüm
> `src/lib/` altındaki **aynı sekiz dosyayı** paylaşıyor.

---

## Gereksinimler

| | |
|---|---|
| GNOME Shell | **46** (`gnome-shell --version`). `metadata.json` yalnızca 46 diyor. |
| Oturum | Wayland'de geliştirildi ve ölçüldü. X11'de denenmedi. |
| Python | 3.8+ — hook betiği yalnızca standart kütüphane kullanıyor. |
| Claude Code | Hook'ları destekleyen bir sürüm (`~/.claude/settings.json`). |
| Araçlar | `make`, `zip`, `glib-compile-schemas`, `gjs` (GNOME ile birlikte gelir) |

Sudo gerekmiyor: her şey `~/.local` altına kuruluyor.

`make gif` ayrıca Python `Pillow` istiyor — yalnızca yukarıdaki GIF'i yeniden
üretmek için, kurulumun parçası değil.

## Kurulum

```sh
make check       # paket kontrolu: metadata, varlık, şema, sözdizimi
make install     # ~/.local/share/gnome-shell/extensions altına kurar
make enable      # gerçek oturumda etkinleştirir
make hooks       # Claude Code hook'larını ~/.claude/settings.json'a yazar
```

`make hooks` senin elle yazdığın hook'lara dokunmuyor: yalnızca kendi
girdilerini (komut satırında `claude-pet-hook.py` geçenler) ekliyor, önce
zaman damgalı bir yedek alıyor ve dosyayı atomik yazıyor. Ne kurulduğunu
görmek için `make hooks-status`.

Açık bir Claude Code oturumu yeni hook'ları hemen görmeyebilir; kesin yol
yeni bir oturum açmak.

Kaldırmak:

```sh
make uninstall   # eklenti + hook girdileri + olay kutusu
```

Ayarlar (konum, boyut) bilerek kalıyor; onları da silmek için:

```sh
dconf reset -f /org/gnome/shell/extensions/claude-pet/
```

## Ayarlar

Pet'e **sağ tıkla**: Duraklat · Ayarlar · Konumu sıfırla.

| Ayar | Ne yapar |
|---|---|
| **Pet** | Genel anahtar. Kapatılınca maskot hiç görünmez — Claude çalışıyor olsa bile. Süreç yoklaması da durur. |
| Boyut | Bir sprite hücresinin piksel kenarı (1–8). Tam sayı, yani büyütmek bulanıklaştırmıyor. |
| Laptop | Laptop katmanı çizilsin mi. |
| Boşta kalma süresi | Bu kadar saniye hiç olay gelmezse pet çalışmayı bırakmış sayar. 0: kapalı. |
| Girdi beklerken bildirim | Claude Code soru sorduğunda masaüstü bildirimi gönder. |
| Monitör | Pet hangi monitörde dursun. Monitör çıkarılırsa birincile düşer, geri takılınca döner. |

Pet **sürüklenerek** taşınıyor; bıraktığın yer monitöre göreli olarak
kaydediliyor, yani çözünürlük değişse de ekran dışında kalmıyor.

## Neden eklenti, neden pencere değil

Wayland bir istemciye kendi penceresini konumlandırma imkânı vermiyor,
"her zaman üstte" diye bir kavram yok, ve tıklama geçirgenliği pencerenin
sınırlarının dışına taşınamıyor. GNOME'un kompozitörü Mutter `wlr-layer-shell`
protokolünü de desteklemiyor — yani Sway ve Hyprland'de işe yarayan çözüm
burada yok.

Geriye tek temiz yol kalıyor: pencere açmamak. Maskot doğrudan GNOME Shell'in
sahnesine iki Clutter actor olarak ekleniyor — biri karakter, biri laptop:

```js
Main.layoutManager.addChrome(area, {
    affectsStruts: false,       // pencere yerleşimini bozmaz
    affectsInputRegion: …,      // aşağıdaki nota bak
    trackFullscreen: false,     // tam ekranda da görünür
});
```

Laptop ayrı bir actor, çünkü karakterin epey solunda duruyor: tek actor olsaydı
aradaki şeffaf boşluk da tıklama yutardı. Laptop actor'ü hiçbir olay almıyor.

> **Ölçülmüş not:** `affectsInputRegion` Wayland'de bir şey **yapmıyor**.
> `ui/layout.js::_updateRegions()` içinde
> `wantsInputRegion = … && !Meta.is_wayland_compositor()`, yani izlenen
> actor'ler atlanıyor. Bir parçayı tıklama yutmaz yapan şey `reactive: false`.
> Bayrak niyet belgesi olarak duruyor (X11'de gerçekten input bölgesini
> belirliyor).

Sonuç: karakterin dikdörtgeni dışındaki her piksel tıklamayı altına geçiriyor,
eklenti odak almıyor, panelin ve tam ekran pencerelerin üstünde duruyor.
XWayland yok, kompozitör hilesi yok, kesirli ölçeklemede bulanıklık yok.

### Tam ekranda görünmek

Tam ekran bir pencerenin üstünde durmak yalnızca yığın sırası meselesi değil.
Mutter, ekranı tamamen kaplayan opak bir pencereyi bir süre sonra
**unredirect** ediyor: bileşiklemeyi (compositing) tamamen atlayıp pencerenin
tamponunu doğrudan ekrana basıyor. O andan sonra kabuğun sahnesindeki hiçbir
şey çizilmiyor — panel de, bildirimler de, maskot da. Belirtisi kendine has:
pencere tam ekrana geçince pet **önce görünüyor, bir an sonra kayboluyor.**

Eklenti bu yüzden `Meta.disable_unredirect_for_display()` ile unredirect'i
kapalı tutuyor (kabuk da genel bakışı açarken aynısını yapıyor) ve aktörleri
`addChrome` yerine `addTopChrome` ile ekliyor.

**Bedeli var:** tam ekran video ve oyunlar artık doğrudan ekrana basılmıyor,
bileşikleme yolundan geçiyor. Bu, oyunlarda birkaç kare/saniye demek olabilir.
Pet'i tam ekranda görmek istemiyorsan `make disable` (ya da sağ tık →
Duraklat değil, tamamen kapatmak gerekiyor) unredirect'i de geri veriyor.

## Pet ne zaman var

Pet, Claude çalışırken var; çalışmıyorken hiç yok. "Çalışmak" ekranda görünmek
değil: masaüstü uygulaması arka planda, küçültülmüş, başka pencerenin altında
olabilir — süreç ayaktaysa pet de ayakta. Terminalde açılan Claude Code de
aynı şekilde sayılıyor.

| Ayardaki anahtar | Claude | Pet |
|---|---|---|
| açık | masaüstü uygulaması (arka planda bile) | var |
| açık | terminalde `claude` | var |
| açık | ikisi birden | var |
| açık | hiçbiri | **yok** |
| **kapalı** | (fark etmez) | **yok** |

Pet yokken aktörler gizli, hiçbir zamanlayıcı kurulu değil ve unredirect geri
verilmiş. Ayardaki anahtar kapalıyken süreç yoklaması da durur — kapalı bir
pet hiçbir şey tüketmez.

Anahtar kapalıyken ekranda tıklanacak bir pet olmadığı için geri açmak da
ayarlar penceresinden: `gnome-extensions prefs claude-pet@eymistaken.local`
ya da Uzantılar uygulaması.

Ölçüt **pencere değil süreç**: `/proc` içinde `claude-desktop` ya da `claude`
adında bir süreç var mı. Pencereye bakan bir yöntem (`Shell.AppSystem`)
penceresi olmayan uygulamayı ve terminalde açılan Claude Code'u kaçırırdı.

Süreç doğumu/ölümü için ayrıcalık istemeyen bir olay kaynağı olmadığından
burada yoklama kaçınılmaz. Maliyet iki kademeli: Claude **açıkken** yalnızca
bulunan sürecin hâlâ yaşadığına bakılıyor (tek dosya, ~0.05 ms, 2 saniyede
bir); **kapalıyken** tam tarama gerekiyor (365 süreç, ~5.7 ms) ve o yüzden 8
saniyede bir soruluyor. Claude Code tarafında gecikmenin telafisi de var: ilk
hook olayı geldiği anda yoklama beklenmeden bakılıyor.

Pet kapalıyken **unredirect de geri veriliyor**, yani Claude açık değilken tam
ekran oyunun bileşikleme bedeli de yok.

## Durum nereden geliyor

Claude Code'un hook'ları. Her olayda küçük bir Python betiği
`~/.local/state/claude-pet/inbox/` içine bir JSON dosyası bırakıyor; eklenti
`Gio.FileMonitor` ile bu dizini izliyor — yoklama yok, olay tabanlı.

Yedi olay, üç durum. Araç adına bakılmıyor: **herhangi bir araç çağrısı
"çalışıyor" demek.**

| Hook olayı | Durum |
|---|---|
| `UserPromptSubmit`, `PreToolUse` | **WORKING** — laptop çıkar, yazar |
| `PermissionRequest`, `Notification`¹ | **WAITING** — laptobu kaldırır, bekler |
| `Stop`, `SessionEnd` | **IDLE** — laptobu kaldırır, düz durur |
| `StopFailure` (rate limit) | **IDLE** — laptop *animasyonsuz*, aniden kaybolur |

¹ yalnızca `permission_prompt`, `idle_prompt`, `agent_needs_input` tipleri.

Durum → klip eşlemesi bir tablo (`src/lib/states.js`), `if` zinciri değil:

```
dizi(A → B) = ÇIKIŞ[A] + GİRİŞ[B] + DÖNGÜ[B]
```

İki davranış kuralı: kod yazma modu **yapışkan** (araya giren Read/Bash
laptobu kaldırmıyor) ve animasyon **ortasından kesilmiyor** (bulunduğu turu
bitiriyor; tek istisna rate limit).

Aynı anda birden fazla Claude Code oturumu varsa tek bir genel durum tutuluyor:
**son gelen olay kazanır.** Ekranda tek maskot var.

## Animasyonlar

Kareler kod içinde değil, `assets/animations.json` içinde: her kare bir hücre
ızgarası, her hücre gövde / göz / laptop / boş. Cairo bunları yatay şeritler
hâlinde çiziyor (53×37'lik bir karede 1961 hücre yerine ~50 dikdörtgen), yani
her ölçekte net ve HiDPI sorunu yok.

Yeni poz eklemek kod yazmak değil, çizmek: `tools/extract_frames.py` bir ekran
kaydından kareleri çıkarıyor, poz atölyesinde düzeltiyorsun, JSON'u geri
koyuyorsun. Ayrıntılar `docs/KAYIT.md` ve `docs/ANIMASYON.md`'de.

## Sorun giderme

**Pet ekranda yok.**

```sh
gnome-extensions info claude-pet@eymistaken.local   # Durum: ACTIVE olmalı
journalctl -o cat /usr/bin/gnome-shell | grep claude-pet
```

- `Durum: INITIALIZED` → kurulu ama etkin değil: `make enable`.
- `gnome-extensions enable` "yok" diyorsa kabuk yeni kurulumu henüz
  taramamıştır; birkaç saniye bekleyip tekrar dene.
- Log'da `etkin · ızgara (x, y)` satırı varsa pet çiziliyor ama ekran dışında
  kalmış olabilir: sağ tık menüsünden **Konumu sıfırla**, ya da
  `dconf reset -f /org/gnome/shell/extensions/claude-pet/`.
- Log'da `animasyonlar yüklenemedi` varsa varlık dosyası bozuk; o durumda pet
  **hiç görünmüyor** (aşağıdaki bilinen eksiklere bak).

**"Uzantının tercihleri yok" diyor, ayarlar penceresi açılmıyor.**

Kabuk `hasPrefs` bilgisini eklentiyi **ilk taradığı anda** (oturum açılışında)
hesaplıyor ve bir daha güncellemiyor. `prefs.js` sonradan geldiyse — ya da
kurulum sırasında kabuk yarım bir dizin gördüyse — bu bayrak `false` takılı
kalıyor. `disable`/`enable` düzeltmiyor.

```sh
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
  --method org.gnome.Shell.Extensions.GetExtensionInfo claude-pet@eymistaken.local
```

Çıktıda `'hasPrefs': <false>` ama diskte `prefs.js` varsa: **oturumu kapatıp
aç.** Wayland'de kabuğu yeniden başlatmanın başka yolu yok.

**Pet var ama tepki vermiyor.**

```sh
make hooks-status          # 7 girdi ve inbox'ta bekleyen olay var mı
ls ~/.local/state/claude-pet/inbox/
```

- Girdi sayısı 0 ise `make hooks`.
- Açık bir Claude Code oturumu eski ayarları okumuş olabilir; yeni oturum aç.
- inbox'ta dosyalar birikiyor ama pet kımıldamıyorsa `Gio.FileMonitor`
  kurulamamış olabilir: `cat /proc/sys/fs/inotify/max_user_instances` ve
  logda `inbox izleyicisi kurulamadı` satırı. Limit dolduğunda izleyici
  **sessizce** çalışmıyor.
- Pet duraklatılmış olabilir: sağ tık → Devam et.

**Kod değiştirdim, yansımıyor.** GNOME 45+ ESM modüllerini önbelleğe alıyor;
`disable`/`enable` JS'i yeniden okumuyor (ölçüldü: `make install` sonrası
kapat/aç, logda hâlâ eski sürümün satırlarını basıyor). Kabuk modülü
eklentiyi **ilk etkinleştirdiğinde** okuyor; o andan sonra değişen dosya
ancak oturum yeniden açılınca geçerli oluyor. Geliştirme bu yüzden iç içe
oturumda yapılıyor: `make nested`.

## Bilinen eksikler

- **Bozuk varlık dosyasında pet hiç görünmüyor.** `animations.js` boş
  varsayılana düşüp `console.warn` basıyor; ekranda görünür bir uyarı yok.
- **Uyku pozu yok.** `sleep-timeout` ayarı pet'in "çalışıyor" saymayı
  bırakmasını sağlıyor, ama varlıkta `sleep` klibi olmadığı için pet uyumuyor,
  düz duruşta kalıyor. Klip eklenirse kod tarafında değişiklik gerekmiyor.
- **Claude açıkken unredirect kapalı tutuluyor**, yani tam ekran oyun/video
  doğrudan ekrana basılamıyor. Görünürlüğün bedeli bu. Claude kapalıyken
  bedel de yok.
- **Pet'in Claude kapalıyken de görünmesini isteyenler için ayar yok.**
  Ayardaki anahtar pet'i tamamen kapatıyor, "her zaman göster" diye bir
  seçenek yok: ölçüt sabit, Claude çalışmıyorsa pet yok.
- **Ekran ölçeği (`scale_factor`) canlı izlenmiyor.** Ekran ölçeğini
  %100 → %200 yaparsan pet, bir sonraki ayar değişikliğine kadar eski hücre
  boyutunda kalıyor.
- **Geçiş klibi sırasında durum değişirse küçük bir sıçrama** olabiliyor
  (0.5–1.3 sn'lik pencere). Kalan dizi bırakılıp yeniden planlanıyor.
- **Sağ tık menüsü açıkken sol tık altına geçmiyor**, menüyü kapatıyor. Bu
  GNOME'un kendi menü davranışı (modal grab), eklentinin kısıtı değil.
- **X11'de denenmedi.**

## Geliştirme

İki test kancası:

```sh
CLAUDE_PET_STATE_DIR=/tmp/pet-test   # hook'ların olay bıraktığı dizin
CLAUDE_PET_PROCESSES=sleep           # "Claude açık mı" ölçütünü değiştirir
```

İkincisi olmadan bu özelliği denemek, deneyen kişinin kendi Claude'unu
kapatmasını gerektirirdi — ki Claude Code'un kendisi de o Claude.

```sh
make nested      # izole test oturumu (gerçek masaüstüne dokunmaz)
make nested-log  # o oturumun logu
make preview     # kareleri kabuğa hiç dokunmadan bağımsız pencerede çiz
make replay      # hook → durum → klip → konum mantığını izole olarak sına
make check       # paket kontrolü
make pack        # dağıtılabilir .zip
make gif         # docs/pet.gif'i yeniden üret
```

Sanat üzerinde çalışırken `make preview`, `make nested` değil — çok daha hızlı.

Yol haritası `docs/PLAN.md`'de, faz faz. Her fazın Claude Code'a verilecek
hazır komutu `prompts/` altında, ne yapıldığı `docs/ILERLEME.md`'de.

Çalışmaya başlamak için Claude Code'a tek cümle yeter:

```
UYGULA.md dosyasını uygula
```

Nerede kalındığını `docs/ILERLEME.md`'den okur, sıradaki fazı uygular, biter
ve durur.

## Lisans ve karakter hakkında

Kod MIT ile lisanslı — `LICENSE`.

Maskot Anthropic'in Claude Code karakteri; bu proje onunla ilgili **resmî
değil**, bağımsız bir hayran çalışması. Karakterin görselleri üzerinde bir hak
iddia edilmiyor. Anthropic isterse kaldırılır.
