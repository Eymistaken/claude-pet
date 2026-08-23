# Faz 6 — Paketleme ve yayına hazırlık

> Bu dosyanın tamamını Claude Code'a yapıştır.

---

`CLAUDE.md`, `README.md` ve `docs/PLAN.md`'yi oku. Faz 5 bitmiş olmalı.

Bu faz kod yazma fazı değil, "başkasının makinesinde de çalışıyor mu" fazı.

## Paketleme

`Makefile`'ı tamamla:

| Hedef | Ne yapar |
|---|---|
| `pack` | `gnome-extensions pack` ile `claude-pet@eymistaken.local.shell-extension.zip` |
| `install` | zip'ten ya da doğrudan kurar, şemayı derler |
| `uninstall` | eklentiyi kaldırır **ve** hook girdilerini siler |
| `hooks` / `unhooks` | hook kurulumu |
| `check` | aşağıdaki kontrolleri çalıştırır |

`pack` şemayı ve `assets/`i pakete dahil etsin — `gnome-extensions pack`
varsayılan olarak her şeyi almaz, `--extra-source` gerekebilir. Paketin
içindekileri listeleyip doğrula.

## `check` hedefi

Basit ama işe yarar bir kontrol seti:

- `metadata.json` geçerli JSON, `uuid` dizin adıyla aynı
- `assets/animations.json` geçerli: her kare `h` satır, her satır `w` karakter,
  palet dışında karakter yok, `holds` uzunluğu kare sayısıyla eşit
- Şema dosyası `glib-compile-schemas --strict --dry-run` ile geçiyor
- `src/*.js` ve `src/lib/*.js` sözdizimi geçerli (`gjs -c` ya da benzeri)

## Temiz kurulum denemesi

Bu adımı atlama, paketlemenin bütün amacı bu:

1. `make uninstall` — her şeyi kaldır
2. `~/.local/share/gnome-shell/extensions/claude-pet@eymistaken.local/` gerçekten
   silinmiş mi bak
3. `~/.claude/settings.json`'da kendi hook girdilerin kalmamış, elle
   eklenenler durmuş mu bak
4. `make pack && make install && make enable && make hooks`
5. Oturumu kapat aç (iç içe oturum değil, gerçek oturum)
6. Claude Code aç, bir dosya düzenlet, pet'in tepki verdiğini gör

## README

`README.md`'nin kurulum bölümünü **gerçekten çalıştırdığın komutlarla**
karşılaştır. Yanlış olan varsa README'yi düzelt.

Şunları ekle:
- Ekran görüntüsü ya da kısa bir GIF (`tools/` altına kayıt komutu koyabilirsin)
- Gereksinimler bölümü: GNOME Shell 46, Wayland, Python 3
- Sorun giderme: eklenti görünmüyorsa, hook'lar çalışmıyorsa ne bakılır

`docs/PLAN.md`'nin sonundaki "Sonraki fazlara notlar" bölümünü gözden geçir;
oraya biriken notları ya uygula ya da README'nin "bilinen eksikler" bölümüne
taşı.

## Lisans

`LICENSE` dosyası ekle — MIT, telif satırı kullanıcının adına.

README'deki karakterle ilgili notu koru: maskot Anthropic'in Claude Code
karakteri, bu proje resmî değil, bağımsız bir hayran çalışması.

## Kısıtlar

- Yeni özellik ekleme. Bulduğun eksikleri README'ye "bilinen eksikler" olarak
  yaz.
- Sürüm numarasını `metadata.json`'da 1'de bırak; yayınlanınca artırılır.

## Bitti sayılma koşulu

- [ ] `make check` geçiyor
- [ ] `make pack` bir `.zip` üretiyor; içinde `assets/` ve derlenmiş şema var
- [ ] Temiz kaldırma sonrası sistemde eklentiden eser kalmıyor
- [ ] Sıfırdan kurulum README'deki komutlarla çalışıyor
- [ ] Gerçek oturumda (iç içe değil) pet çalışıyor
- [ ] `git status` temiz — `.gitignore` derlenmiş şemayı, zip'i ve ekran
      kayıtlarını dışarıda bırakıyor
- [ ] `README.md`'deki her komut denendi

Son adım: `git init && git add -A && git commit` ve uzak repoya bağla.
Bunu **kullanıcı istemeden yapma**, sadece hazır olduğunu söyle.
