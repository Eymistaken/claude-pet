# claude-pet

Claude Code'un ne yaptığını masaüstünde bir maskotla gösteren GNOME Shell
eklentisi. Kod yazarken cebinden bir laptop çıkarıp yazmaya başlar, senin
cevabını beklerken sana döner.

> **English:** A GNOME Shell extension that shows what Claude Code is doing
> through a desktop mascot. Wayland-native — it draws into the shell instead of
> opening a window, so it stays on top, passes clicks through, and never steals
> focus.

**Hedef ortam:** GNOME Shell 46 · Wayland · Zorin OS 18 / Ubuntu 24.04

---

## Neden eklenti, neden pencere değil

Wayland bir istemciye kendi penceresini konumlandırma imkânı vermiyor,
"her zaman üstte" diye bir kavram yok, ve tıklama geçirgenliği pencerenin
sınırlarının dışına taşınamıyor. GNOME'un kompozitörü Mutter `wlr-layer-shell`
protokolünü de desteklemiyor — yani Sway ve Hyprland'de işe yarayan çözüm
burada yok.

Geriye tek temiz yol kalıyor: pencere açmamak. Maskot doğrudan GNOME Shell'in
sahnesine bir Clutter actor olarak ekleniyor:

```js
Main.layoutManager.addChrome(this._pet, {
    affectsStruts: false,
    affectsInputRegion: true,   // input bölgesi = sadece bu actor'ün dikdörtgeni
    trackFullscreen: false,     // tam ekranda da görünsün
});
```

Sonuç: maskotun dışındaki her piksel tıklamayı altına geçirir, eklenti odak
almaz, panelin ve tam ekran pencerelerin üstünde durur. XWayland yok,
kompozitör hilesi yok, kesirli ölçeklemede bulanıklık yok.

## Durum nereden geliyor

Claude Code'un hook'ları. Her olayda küçük bir Python betiği
`~/.local/state/claude-pet/inbox/` içine bir JSON dosyası bırakıyor; eklenti
`Gio.FileMonitor` ile bu dizini izliyor — yoklama yok, olay tabanlı.

| Olay | Maskot |
|---|---|
| `SessionStart` | uyanır |
| `UserPromptSubmit` | düşünür |
| `PreToolUse` · Edit/Write | laptobu çıkarır, yazar |
| `PreToolUse` · Bash | koşturur |
| `PostToolUseFailure` | titrer |
| `PermissionRequest` · `Notification` | **sana döner, el sallar** |
| `Stop` | kutlar |
| `SessionEnd` | uykuya döner |

## Animasyonlar

Kareler kod içinde değil, `assets/animations.json` içinde: her kare bir hücre
ızgarası, her hücre gövde / göz / laptop / boş. Cairo bunları yatay şeritler
hâlinde çiziyor, yani her ölçekte net ve HiDPI sorunu yok.

Yeni poz eklemek kod yazmak değil, çizmek: `tools/extract_frames.py` bir ekran
kaydından kareleri çıkarıyor, poz atölyesinde düzeltiyorsun, JSON'u geri
koyuyorsun. Ayrıntılar `docs/KAYIT.md` ve `docs/ANIMASYON.md`'de.

## Kurulum

```sh
make install     # ~/.local/share/gnome-shell/extensions altına kurar
make enable
make hooks       # Claude Code hook'larını settings.json'a yazar
```

Kaldırmak için `make uninstall`. Sudo gerekmiyor.

## Geliştirme

Wayland'de `Alt+F2` → `r` ile gnome-shell yeniden başlatılamaz. Test için:

```sh
make nested      # dbus-run-session -- gnome-shell --nested --wayland
make logs        # journalctl -f -o cat /usr/bin/gnome-shell
make preview     # kareleri shell'e hiç dokunmadan çiz
```

Yol haritası `docs/PLAN.md`'de, faz faz. Her fazın Claude Code'a verilecek
hazır komutu `prompts/` altında.

## Lisans ve karakter hakkında

Kod MIT ile lisanslı.

Maskot Anthropic'in Claude Code karakteri; bu proje onunla ilgili **resmî
değil**, bağımsız bir hayran çalışması. Karakterin görselleri üzerinde bir hak
iddia edilmiyor. Anthropic isterse kaldırılır.
