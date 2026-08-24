# claude-pet — AppImage (KDE ve diğer Wayland masaüstleri)

Bu depoda maskotun **iki sürümü** var. İkisi de aynı animasyonları ve aynı
durum mantığını kullanıyor; farkları maskotu ekrana nasıl koyduklarında.

| Masaüstün | Kullanacağın şey |
|---|---|
| **GNOME** (Wayland) | GNOME Shell eklentisi — [README.md](README.md) |
| **KDE Plasma** (Wayland) | **bu AppImage** |
| Sway · Hyprland · COSMIC | **bu AppImage** |
| X11 oturumu (herhangi bir masaüstü) | ikisi de değil — aşağıya bak |

Sebep tek bir protokol: `wlr-layer-shell`. KWin, wlroots ve Smithay bunu
konuşuyor, GNOME'un kompozitörü Mutter konuşmuyor. Eklenti GNOME'da bu
protokolün yokluğunu kabuğun içine çizerek aşıyor; AppImage ise protokolü
olduğu gibi kullanıyor.

---

## Kurulum

1. [Sürümler](https://github.com/Eymistaken/claude-pet/releases) sayfasından
   `Claude_Pet-x86_64.AppImage` dosyasını indir.
2. Çalıştırılabilir yap ve çalıştır:

```bash
chmod +x Claude_Pet-x86_64.AppImage && ./Claude_Pet-x86_64.AppImage
```

İlk çalıştırmada üç şey kendiliğinden kuruluyor — üçü de ayarlar
penceresinden geri alınabiliyor:

- **Claude Code hook'ları** (`~/.claude/settings.json`). Pet'in Claude'un ne
  yaptığını duymasının tek yolu bu. Betik `~/.local/share/claude-pet/` altına
  kopyalanıyor, çünkü AppImage'ın bağlandığı dizin her açılışta değişiyor.
- **Otomatik başlatma** (`~/.config/autostart/claude-pet.desktop`). Oturum
  açılınca pet arka planda hazır oluyor.
- **Menü girdisi** ve simge.

> Açık bir Claude Code oturumu yeni hook'ları hemen görmeyebilir; kesin yol
> yeni bir oturum açmak.

## Kullanım

**AppImage'ı ikinci kez çalıştırmak ayarları açıyor.** İkinci bir pet
açılmıyor: çalışan örneğe gidip ayarlar penceresini açtırıyor. Otomatik
başlatma `--daemon` ile çalıştığı için oturum açılışında pencere gelmiyor.

Pet'e **sağ tıkla**: Duraklat · Ayarlar · Konumu sıfırla · Çık.
Pet **sürüklenerek** taşınıyor; bıraktığın yer monitöre göreli kaydediliyor.

| Ayar | Ne yapar |
|---|---|
| **Pet** | Genel anahtar. Kapatılınca maskot hiç görünmez ve süreç yoklaması durur. |
| Boyut | Bir sprite hücresinin piksel kenarı (1–8). |
| Laptop | Laptop katmanı çizilsin mi. |
| Boşta kalma süresi | Bu kadar saniye hiç olay gelmezse pet çalışmayı bırakmış sayar. 0: kapalı. |
| Girdi beklerken bildirim | Claude Code soru sorduğunda masaüstü bildirimi gönder. |
| Monitör | Pet hangi monitörde dursun. |
| Sistemle birlikte başlat | Otomatik başlatma girdisi. |
| Uygulama menüsünde göster | Menü girdisi ve simge. |
| Claude Code hook'ları | Kurulu mu, kur / kaldır. |

Ayarlar **dconf'ta değil**, düz metin olarak `~/.config/claude-pet/ayarlar.conf`
içinde. Bu bilinçli: KDE kurulumlarında dconf'un varlığı garanti değil.

## Gereksinimler

| | |
|---|---|
| Oturum | **Wayland.** X11'de çalışmıyor (aşağıya bak). |
| Kompozitör | `wlr-layer-shell` desteği: KWin (Plasma 5.20+), Sway, Hyprland, COSMIC, Mir |
| glibc | **≥ 2.39** |
| Python | 3.8+ — hook betiği için, yalnızca standart kütüphane |
| FUSE | **gerekmiyor** — AppImage statik runtime ile paketlendi |

glibc 2.39 tabanı şunları kapsıyor: Arch, Fedora 40+, Ubuntu 24.04+,
KDE neon 24.04, Debian 13, openSUSE Tumbleweed.
**Kapsamıyor:** Debian 12, Ubuntu 22.04, Linux Mint 21.

GTK4, libadwaita, gjs ve `gtk4-layer-shell` paketin içinde — hiçbirini
kurman gerekmiyor.

## Neden X11 yok

Layer-shell bir Wayland protokolü. X11'de aynı işi yapmak
override-redirect pencere + `XShapeCombineRectangles` ile input shape
demek; GTK4 ikisini de doğrudan vermiyor ve XID üzerinden Xlib'e inmek
gerekiyor. Bu sürümün kapsamı dışında bırakıldı. Plasma 6 Wayland'i
varsayılan yapıyor; Plasma 5'te oturum seçicisinden "Plasma (Wayland)".

## Eklentiden farkları

Aynı olan: animasyonlar (`assets/animations.json` birebir aynı dosya), durum
makinesi, klip zamanlaması, konum aritmetiği — hepsi `src/lib/` altındaki
**aynı sekiz dosya**, kopya değil.

Farklı olan:

- **Tam ekranda bedelsiz.** Eklenti, GNOME'un tam ekran pencereleri
  "unredirect" etmesini engellemek zorundaydı ve bu tam ekran oyunlara
  birkaç fps'e mal oluyordu. Layer-shell'in `overlay` katmanında böyle bir
  şey yok.
- **Tıklama geçirgenliği daha keskin.** Eklentide Wayland'de giriş bölgesi
  hiç uygulanmıyordu; laptop ile karakter arasındaki boşluk tıklama yutuyordu.
  Burada giriş bölgesi tam olarak karakterin dikdörtgeni.
- **HiDPI.** Ölçek ayarı ekranın kendi ölçeğiyle çarpılmıyor; GTK4 mantıksal
  piksele çiziyor ve ölçeklemeyi kendisi yapıyor.

## Kaldırmak

Ayarlar penceresinden üç anahtarı da kapat (hook'lar, otomatik başlatma, menü
girdisi), sonra AppImage dosyasını sil. Elle:

```bash
rm -f ~/.config/autostart/claude-pet.desktop
rm -f ~/.local/share/applications/io.github.eymistaken.ClaudePet.desktop
rm -rf ~/.local/share/claude-pet ~/.local/state/claude-pet
rm -f ~/.config/claude-pet/ayarlar.conf
python3 ~/.local/share/claude-pet/claude-pet-hook.py uninstall   # silmeden ÖNCE
```

## Sorun giderme

**"bu kompozitör wlr-layer-shell protokolünü desteklemiyor"** — GNOME
kullanıyorsun. Eklentiyi kur: [README.md](README.md).

**"Wayland oturumu bulunamadı"** — X11 oturumundasın.

**Pet yok ama hata da yok.** Pet yalnızca Claude çalışırken var. Terminalden
çalıştırıp logu izle:

```bash
./Claude_Pet-x86_64.AppImage --daemon
```

`claude KAPALI (pet gizli)` yazıyorsa ölçüt sağlanmamış: `/proc` içinde
`claude` ya da `claude-desktop` adında bir süreç aranıyor.

**Pet var ama tepki vermiyor.** Ayarlarda "Claude Code hook'ları" satırına
bak; 0 girdi diyorsa **Kur**'a bas ve yeni bir Claude Code oturumu aç.

## Kaynaktan derlemek

```bash
make appimage
```

`tools/appimage.sh` sırayla: sudo'suz bir yerel sysroot kurar
(`apt-get download` + `dpkg-deb -x`), `gtk4-layer-shell`i kaynaktan derler,
AppDir'i kurar, `ldd` kapanışını toplar, `appimagetool` çağırır. Sisteme
hiçbir şey yazmıyor; her şey `build/` altında kalıyor.

## Durum

**Pencere davranışı KDE'de henüz sınanmadı.** Bu sürüm kod düzeyinde
doğrulandı (110 birim testi, paket kontrolü, bağımlılık kapanışı) ve
GNOME'da beklendiği gibi "desteklenmiyor" deyip çıktığı görüldü — ama
tıklama geçirgenliği, tam ekran, sürükleme ve sağ tık menüsü gerçek bir
KWin oturumunda denenmedi. Sorun görürsen issue aç.
