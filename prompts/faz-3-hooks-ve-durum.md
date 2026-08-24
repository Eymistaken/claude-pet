# Faz 3 — Hook'lar ve durum

> Bu dosyanın tamamını Claude Code'a yapıştır.

---

`CLAUDE.md`'yi oku. Faz 2 bitmiş olmalı.

Bu fazda pet Claude Code'un ne yaptığını öğreniyor. **Tepki vermiyor** — eşleme
Faz 4'ün işi. Faz 3 bitince pet'te görünür bir değişiklik olmayacak; değişen
tek şey `tracker.js`'in doğru durumu biliyor olması.

## İstenen davranış (hedef)

Karmaşık bir durum makinesi istemiyoruz. Dört durum yeter:

| Durum | Pet ne yapar |
|---|---|
| `IDLE` | Düz durur |
| `WORKING` | Laptop çıkar, yazar |
| `WAITING` | El sallar, yanında soru işareti |
| (rate limit) | Laptop **aniden** kaybolur, `IDLE`'a döner |

## `hooks/claude-pet-hook.py`

Tek dosya, iki mod.

**Yazıcı modu** (argümansız): stdin'den hook JSON'ını okur,
`~/.local/state/claude-pet/inbox/<nanosaniye>-<olay>.json` yazar, biter.

- Sakladığın alanlar sadece: `hook_event_name`, `notification_type`,
  `error_type`. Başka bir şeye ihtiyaç yok, hook yükleri megabaytlarca
  olabiliyor.
- Her şey `try/except`, hata olursa **sessizce exit 0**. Hook'un başarısızlığı
  Claude Code'un işini bozmamalı.
- Milisaniyeler içinde bitsin. Ağır import yok.
- `$CLAUDE_PET_STATE_DIR` tanımlıysa onu kullan (test için).

**Kurulum modu**: `install` / `uninstall` / `status`.

Kaydolunacak olaylar — **yedi tane, hepsi matcher'sız** (`PreToolUse` hariç,
o `*` alır):

| Olay | Ne için |
|---|---|
| `UserPromptSubmit` | işe başladı |
| `PreToolUse` (`*`) | çalışıyor |
| `PermissionRequest` | sana soruyor |
| `Notification` | sana soruyor / dikkat |
| `Stop` | bitti |
| `StopFailure` | rate limit ve diğer API hataları |
| `SessionEnd` | kapandı |

`PostToolUse`, `SubagentStart/Stop`, `PreCompact` gibi olaylara **gerek yok**,
kaydetme.

### settings.json'a dokunma kuralları — bunlar kırpılamaz

`~/.claude/settings.json` kullanıcının gerçek yapılandırması; 13 anahtarı ve
kendi statusline betiği var.

- Yazmadan önce **yedekle**.
- Var olan `hooks` ağacını koru; **elle yazılmış hook'lara asla dokunma**,
  yalnızca kendi girdilerini ekle/çıkar. Girdileri sabit bir işaretle tanı ki
  `uninstall` yalnızca kendininkileri silsin.
- Geçerli JSON ürettiğini doğrula, **atomik yaz** (geçici dosya + `rename`).

`Makefile`'a `hooks` ve `unhooks` hedefleri ekle.

## `src/lib/tracker.js`

- `Gio.File.monitor_directory()` ile inbox'ı izler. **Yoklama yok.**
- Yeni dosya gelince oku, uygula, **sil**. Her okuma `try/catch`; bozuk dosyayı
  sil ve devam et.
- **Oturum başına durum tutma.** Tek bir genel durum yeter — son gelen olay
  kazanır. Tek istisna: `WAITING` yapışkandır, aşağıdaki kurallar dışında
  temizlenmez.

Geçiş tablosu:

| Gelen | Yeni durum |
|---|---|
| `UserPromptSubmit`, `PreToolUse` | `WORKING` |
| `PermissionRequest` | `WAITING` |
| `Notification` (`permission_prompt`, `idle_prompt`, `agent_needs_input`) | `WAITING` |
| `Notification` (diğer tipler) | değişmez |
| `Stop`, `SessionEnd` | `IDLE` |
| `StopFailure` | `IDLE` + `rateLimited` bayrağı (`error_type === 'rate_limit'`) |
| `sleep-timeout` kadar hiç olay gelmemesi | `IDLE` |

- `WAITING`'den çıkış: yalnızca `UserPromptSubmit`, `PreToolUse`, `Stop` ya da
  `SessionEnd`.
- Durum değişince `changed` sinyali yay; Faz 4 buna bağlanacak.
- Açılışta inbox'ta birikmiş eski dosyaları temizle (uygulama kapalıyken
  hook'lar yazmaya devam etmiş olabilir).

## `tests/replay.js`

Kayıtlı olayları inbox'a döken küçük bir test aracı. `Makefile`'a `replay`.

Tek senaryo yeter: prompt → birkaç araç → izin isteği → devam → bitiş.
Ayrıca bir `StopFailure(rate_limit)` durumu.

**Kanarya:** teste başlamadan önce bir `Gio.FileMonitor` kurup gerçekten olay
aldığını doğrula. Alamıyorsa `inotify limiti dolmuş olabilir, make nested-kill
çalıştır` diye açık bir hata ver ve dur. Bu limit dolduğunda FileMonitor
**sessizce** çalışmaz oluyor ve mantık hatası gibi görünüyor.

## Kısıtlar

- Animasyona, actor'lere, `states.js`'e dokunma. Pet'in görünüşü değişmeyecek.
- Araç adı eşlemesi yapma (`Bash` şu, `Read` bu diye). Faz 4'te bile
  gerekmiyor — herhangi bir araç çağrısı `WORKING` demek.

## Bitti sayılma koşulu

- [ ] `make hooks` çalışıyor, `settings.json` geçerli JSON kalıyor, yedek var
- [ ] Kurulumdan **önce elle bir hook ekle**; `make hooks` sonrası hâlâ orada
- [ ] `make unhooks` yalnızca kendi girdilerini siliyor, elle eklenen duruyor
- [ ] Gerçek bir Claude Code oturumunda bir dosya okut → durum `WORKING`
- [ ] İzin isteyen bir komut → durum `WAITING`, sen cevap verene kadar öyle
- [ ] `make replay` doğru geçişleri üretiyor, çıktıyı yazdır
- [ ] Inbox'a elle bozuk bir JSON koy → pet susuyor, shell ayakta, dosya siliniyor
- [ ] Kanarya çalışıyor: FileMonitor ölüyse açık hata veriyor
- [ ] Devre dışı bırakınca dosya monitörü sökülüyor
- [ ] Hook betiğinin süresi `time` ile 50 ms altında
