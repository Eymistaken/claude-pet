# Faz 3 — Hook'lar ve durum

> Bu dosyanın tamamını Claude Code'a yapıştır.

---

`CLAUDE.md`'yi ve `docs/PLAN.md`'nin Faz 3 bölümünü oku. Faz 2 bitmiş olmalı.

Bu fazda maskot Claude Code'un ne yaptığını öğreniyor. Henüz **tepki vermiyor**
— eşleme Faz 4'ün işi. Bu fazın çıktısı: doğru çalışan bir durum makinesi ve
onu doğrulayan bir test.

## Yazılacak dosyalar

### `hooks/claude-pet-hook.py`

Tek dosya, iki mod.

**Yazıcı modu** (argümansız çalıştırıldığında): stdin'den hook JSON'ını okur,
işe yarayan alanları alıp
`~/.local/state/claude-pet/inbox/<nanosaniye>-<olay>.json` olarak yazar, biter.

- **Claude Code'u yavaşlatmamalı.** Ağır import yok, ağ yok, kilit yok.
  Milisaniyeler içinde bitsin.
- Sakladığın alanlar: `session_id`, `hook_event_name`, `tool_name`,
  `notification_type`, `error_type`, `agent_type`. Gerisini at — bazı hook
  yükleri megabaytlarca olabiliyor.
- Her şey `try/except`. Hata olursa **sessizce çık (exit 0)**; hook'un
  başarısızlığı Claude Code'un işini bozmamalı.
- `$CLAUDE_PET_STATE_DIR` tanımlıysa onu kullan (test için gerekli).

**Kurulum modu**: `install`, `uninstall`, `status` alt komutları.
`~/.claude/settings.json` içine hook girdileri ekler/çıkarır.

- Girdiler bir işaretle tanınsın (komut satırında sabit bir dize), ki
  `uninstall` yalnızca kendi eklediklerini silsin.
- **Elle yazılmış hook'lara asla dokunma.** Var olan `hooks` ağacını koru,
  yalnızca kendi girdilerini ekle/çıkar. Sıfırdan yazma.
- Dosyayı yazmadan önce yedekle, geçerli JSON ürettiğini doğrula, atomik
  yaz (geçici dosya + `rename`).
- `status`, hangi olayların kayıtlı olduğunu ve inbox'ın durumunu göstersin.

Kaydolunacak olaylar:

| Olay | Matcher |
|---|---|
| `SessionStart` | — |
| `UserPromptSubmit` | — |
| `PreToolUse` | `*` |
| `PostToolUse` | `*` |
| `PostToolUseFailure` | `*` |
| `PermissionRequest` | `*` |
| `Notification` | — |
| `Stop` | — |
| `StopFailure` | — |
| `SessionEnd` | — |
| `SubagentStart` | — |
| `SubagentStop` | — |

Kurmadan önce `claude --help` ya da dokümandan bu olay adlarının ve matcher
desteğinin güncel olduğunu doğrula; biri kabul edilmezse onu atla ve
kullanıcıya söyle, hepsini iptal etme.

`Makefile`'a `hooks` ve `unhooks` hedefleri ekle.

### `src/lib/tracker.js`

- `Gio.File.monitor_directory()` ile inbox'ı izler. **Yoklama yok.**
- Yeni dosya gelince oku, `JSON.parse` et, uygula, **dosyayı sil**.
- Her okuma `try/catch`. Bozuk dosyayı sil ve devam et; shell'i düşürme.
- Oturum başına durum tut: `{state, tool, lastSeen}`. Durumlar:
  `IDLE`, `THINKING`, `WORKING`, `WAITING_INPUT`.
- Hepsini tek bir agregat duruma indirge. Kural: **en son güncellenen oturum
  kazanır**, ama `WAITING_INPUT` her şeyi ezer — sen bloke ediyorsan pet onu
  göstermeli.
- Uzun süredir sesi çıkmayan oturumları düşür (10 dakika).
- Inbox şişerse (uygulama kapalıyken hook'lar yazmaya devam etmiştir) açılışta
  eski dosyaları temizle: belirli bir yaştan eski olanları sil.
- Durum değişince bir sinyal yay (`changed`); Faz 4 buna bağlanacak.

### `tests/replay.js` (ya da `.py`)

Kayıtlı hook olaylarını inbox'a zamanlamalı olarak döken bir test aracı.
Claude Code çalıştırmadan bütün durum makinesini denemeyi sağlar.

- Örnek bir olay dizisi yaz: oturum başlar → prompt → birkaç araç → izin
  isteği → devam → biter.
- İki oturumun aynı anda çalıştığı bir senaryo da olsun.
- `Makefile`'a `replay` hedefi.

## Kısıtlar

- Animasyona, `states.js`'e, actor'lere bu fazda dokunma.
- Pet'in görünüşü değişmeyecek. Değişen tek şey: `tracker.js` doğru durumu
  biliyor olacak.

## Bitti sayılma koşulu

- [ ] `make hooks` çalışıyor, `~/.claude/settings.json` geçerli JSON kalıyor
- [ ] Kurulumdan önce elle bir hook ekle; `make hooks` sonrası **hâlâ orada**
- [ ] `make unhooks` yalnızca kendi girdilerini siliyor, elle eklenen duruyor
- [ ] Gerçek bir Claude Code oturumu açıp bir dosya okut: inbox'a dosya
      düşüyor ve `tracker.js` durumu `WORKING` yapıyor
- [ ] `make replay` senaryosu doğru durum geçişlerini üretiyor, çıktıyı yazdır
- [ ] İki oturumlu senaryoda `WAITING_INPUT` diğerini eziyor
- [ ] Inbox'a elle bozuk bir JSON dosyası koy: pet susuyor, shell ayakta,
      dosya siliniyor
- [ ] Devre dışı bırakınca dosya monitörü sökülüyor

Hook betiğinin süresini ölç (`time`); 50 ms'nin altında olmalı.
