#!/usr/bin/env -S gjs -m
/* Olay tekrar aracı — hook'tan duruma kadar bütün zinciri sürer.
 *
 * NE YAPIYOR: geçici bir durum dizini kurup `CLAUDE_PET_STATE_DIR`'i ona
 * çeviriyor, sonra GERÇEK `hooks/claude-pet-hook.py` betiğini gerçek hook
 * yükleriyle çalıştırıyor. Yani test edilen şey yalnızca `tracker.js` değil:
 * yazıcı → dosya → `Gio.FileMonitor` → durum makinesi zincirinin tamamı.
 * Gerçek oturuma ve gerçek inbox'a hiç dokunulmuyor.
 *
 * KANARYA. `fs.inotify.max_user_instances` dolduğunda `Gio.FileMonitor`
 * hata vermiyor, sessizce hiçbir olay getirmiyor — ve bu bir mantık hatası
 * gibi görünüyor. O yüzden teste başlamadan önce ayrı bir dizinde bir
 * izleyici kurulup gerçekten olay aldığı doğrulanıyor. Alamıyorsa test
 * başlamıyor ve ne yapılacağını söylüyor.
 *
 * İKİ KİP:
 *   (varsayılan)  izole test — geçici dizin, doğrulama, 21 madde
 *   --canli       GERÇEK inbox'a yazar, yani ÇALIŞAN pet'i sürer. Doğrulama
 *                 yok; amaç ekrana bakıp koreografiyi görmek. Senaryolar:
 *                 `tur` (varsayılan), `izin`, `ratelimit`.
 *
 * Kullanım:  gjs -m tests/replay.js              (ya da `make replay`)
 *            gjs -m tests/replay.js --canli izin (ya da `make replay-canli`)
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// tracker.js modül gövdesinde durum dizinini OKUMUYOR (yalnızca `stateDir()`
// çağrıldığında bakıyor), o yüzden statik import güvenli: `GLib.setenv`
// aşağıda, `new Tracker()`'dan önce çalışıyor.
import {DURUM, Tracker, inboxDir} from '../src/lib/tracker.js';

/** Bu betiğin bulunduğu dizinden depo kökünü türet. */
function kok() {
    const [dosya] = GLib.filename_from_uri(import.meta.url);
    return GLib.path_get_dirname(GLib.path_get_dirname(dosya));
}

const KOK = kok();
const HOOK = GLib.build_filenamev([KOK, 'hooks', 'claude-pet-hook.py']);

/** Gerçek hook betiğini bir yükle çalıştır. Döner: geçen süre (ms). */
function hookCalistir(yuk) {
    const t0 = GLib.get_monotonic_time();
    const surec = Gio.Subprocess.new(
        ['python3', HOOK],
        Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
    const [, , hata] = surec.communicate_utf8(JSON.stringify(yuk), null);
    const ms = (GLib.get_monotonic_time() - t0) / 1000;
    if (hata)
        printerr(`hook stderr: ${hata}`);
    return ms;
}

// --------------------------------------------------------------- canlı kip
//
// GERÇEK inbox'a yazıyor: çalışan pet bu olayları görüyor. Doğrulama yok,
// çünkü ölçülecek şey ekranda — `make nested` açıkken çalıştırıp bak.

const CANLI_SENARYOLAR = {
    // Sıradan bir tur: istem, birkaç araç, bitiş.
    tur: [
        [0, {hook_event_name: 'UserPromptSubmit'}, 'istem geldi → laptop çıkmalı'],
        [3000, {hook_event_name: 'PreToolUse', tool_name: 'Read'}, 'araç 1 — laptop ELDE KALMALI'],
        [3000, {hook_event_name: 'PreToolUse', tool_name: 'Bash'}, 'araç 2 — hâlâ elde'],
        [3000, {hook_event_name: 'PreToolUse', tool_name: 'Edit'}, 'araç 3 — hâlâ elde'],
        [4000, {hook_event_name: 'Stop'}, 'tur bitti → laptop kalkmalı, düz duruş'],
    ],
    // İzin isteği: pet beklemeye geçer ve cevap gelene kadar öyle kalır.
    izin: [
        [0, {hook_event_name: 'UserPromptSubmit'}, 'istem geldi'],
        [3000, {hook_event_name: 'PreToolUse', tool_name: 'Bash'}, 'araç çalışıyor'],
        [3000, {hook_event_name: 'PermissionRequest'}, 'İZİN İSTENDİ → bekleme pozu'],
        [12000, {hook_event_name: 'PreToolUse', tool_name: 'Bash'}, 'cevap verildi → waiting_out, sonra yazmaya dönüş'],
        [5000, {hook_event_name: 'Stop'}, 'bitti'],
    ],
    // Rate limit: laptop ANİDEN kaybolmalı, geçiş animasyonu OYNAMAMALI.
    ratelimit: [
        [0, {hook_event_name: 'UserPromptSubmit'}, 'istem geldi'],
        [3000, {hook_event_name: 'PreToolUse', tool_name: 'Bash'}, 'araç çalışıyor'],
        [4000, {hook_event_name: 'StopFailure', error_type: 'rate_limit'}, 'RATE LIMIT → laptop ANİDEN kaybolmalı'],
    ],
};

if (ARGV.includes('--canli')) {
    const ad = ARGV.find(a => !a.startsWith('--')) ?? 'tur';
    const adimlar = CANLI_SENARYOLAR[ad];
    if (!adimlar) {
        printerr(`bilinmeyen senaryo: ${ad}  (${Object.keys(CANLI_SENARYOLAR).join(' | ')})`);
        imports.system.exit(2);
    }

    print(`CANLI KİP — senaryo: ${ad}`);
    print('GERÇEK inbox\'a yazılıyor; çalışan pet bunu görecek. Ekrana bak.');
    print('');

    const dongu = new GLib.MainLoop(null, false);
    let i = 0;
    const sonraki = () => {
        if (i >= adimlar.length) {
            print('\nsenaryo bitti');
            dongu.quit();
            return;
        }
        const [gecikme, yuk, aciklama] = adimlar[i++];
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, gecikme, () => {
            hookCalistir(yuk);
            print(`  ${yuk.hook_event_name.padEnd(18)} ${aciklama}`);
            sonraki();
            return GLib.SOURCE_REMOVE;
        });
    };
    sonraki();
    dongu.run();
    imports.system.exit(0);
}

// Izole durum dizini. Tracker ve hook betiği AYNI değişkene bakıyor, yani
// tek satır ikisini birden taşıyor.
const GECICI = GLib.dir_make_tmp('claude-pet-replay-XXXXXX');
GLib.setenv('CLAUDE_PET_STATE_DIR', GECICI, true);

let gecti = 0;
let kaldi = 0;

function ol(ad, kosul, ayrinti = '') {
    if (kosul)
        gecti++;
    else
        kaldi++;
    print(`${kosul ? 'GEÇTİ' : 'KALDI'}  ${ad}${ayrinti ? `  — ${ayrinti}` : ''}`);
}

function inotifyDurumu() {
    try {
        const [, cikti] = GLib.spawn_command_line_sync(
            'sh -c "ls -l /proc/*/fd/* 2>/dev/null | grep -c inotify"');
        const [, tavan] = GLib.file_get_contents('/proc/sys/fs/inotify/max_user_instances');
        return `${new TextDecoder().decode(cikti).trim()}/${new TextDecoder().decode(tavan).trim()}`;
    } catch {
        return 'bilinmiyor';
    }
}

// --------------------------------------------------------------------- kanarya

/** Ayrı bir dizinde izleyici kurup gerçekten olay aldığını doğrula. */
function kanarya() {
    const dizin = GLib.dir_make_tmp('claude-pet-kanarya-XXXXXX');
    const dir = Gio.File.new_for_path(dizin);

    let monitor = null;
    try {
        monitor = dir.monitor_directory(Gio.FileMonitorFlags.NONE, null);
    } catch (error) {
        return {ok: false, neden: `monitor_directory hata verdi: ${error}`};
    }
    if (!monitor)
        return {ok: false, neden: 'monitor_directory null döndü'};

    const dongu = new GLib.MainLoop(null, false);
    let geldi = false;

    monitor.connect('changed', () => {
        geldi = true;
        dongu.quit();
    });

    // Olay gelmezse sonsuza kadar bekleme.
    const zamanAsimi = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
        dongu.quit();
        return GLib.SOURCE_REMOVE;
    });

    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        GLib.file_set_contents(GLib.build_filenamev([dizin, 'kanarya.json']), '{}');
        return GLib.SOURCE_REMOVE;
    });

    dongu.run();

    if (geldi)
        GLib.Source.remove(zamanAsimi);
    monitor.cancel();
    try {
        Gio.File.new_for_path(GLib.build_filenamev([dizin, 'kanarya.json'])).delete(null);
        Gio.File.new_for_path(dizin).delete(null);
    } catch { /* temizlik zorunlu değil */ }

    return {ok: geldi, neden: 'izleyici 2 sn içinde hiç olay getirmedi'};
}

// ----------------------------------------------------------------- hook sürme

/** Olayı yaz, izleyicinin yakalamasını bekle, sonra kontrolü çalıştır. */
function adimlariSur(izleyici, adimlar, bitince) {
    const dongu = new GLib.MainLoop(null, false);
    let i = 0;
    const sureler = [];

    const sonraki = () => {
        if (i >= adimlar.length) {
            dongu.quit();
            return;
        }
        const adim = adimlar[i++];

        if (adim.yuk)
            sureler.push(hookCalistir(adim.yuk));
        if (adim.once)
            adim.once();

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, adim.bekleMs ?? 150, () => {
            adim.kontrol(izleyici);
            sonraki();
            return GLib.SOURCE_REMOVE;
        });
    };

    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        sonraki();
        return GLib.SOURCE_REMOVE;
    });
    dongu.run();
    bitince(sureler);
}

// -------------------------------------------------------------------- senaryo

print(`durum dizini: ${GECICI}`);
print(`inotify     : ${inotifyDurumu()}`);
print('');

const k = kanarya();
if (!k.ok) {
    printerr('');
    printerr('KANARYA BAŞARISIZ: ' + k.neden);
    printerr('');
    printerr('  Gio.FileMonitor olay getirmiyor. En olası sebep');
    printerr('  fs.inotify.max_user_instances sınırının dolmuş olması —');
    printerr('  bu durumda izleyici HATA VERMEDEN sessizce çalışmaz.');
    printerr('');
    printerr('  Çözüm:   make nested-kill');
    printerr(`  Durum :  inotify ${inotifyDurumu()}`);
    printerr('');
    imports.system.exit(1);
}
ol('kanarya: FileMonitor olay getiriyor', true);

const izleyici = new Tracker({sleepTimeoutMs: 0});   // 0 = uyku sayacı kapalı

// Açılışta temizlik: izleyici başlamadan önce inbox'a bir olay koy.
GLib.mkdir_with_parents(inboxDir(), 0o755);
GLib.file_set_contents(
    GLib.build_filenamev([inboxDir(), '0000000000000000001-Eski.json']),
    '{"hook_event_name":"UserPromptSubmit"}');

ol('izleyici başladı', izleyici.start());
ol('açılışta birikmiş olaylar temizlendi',
    izleyici.state === DURUM.IDLE &&
    GLib.file_test(GLib.build_filenamev([inboxDir(), '0000000000000000001-Eski.json']),
        GLib.FileTest.EXISTS) === false,
    `durum ${izleyici.state}`);

const gecisler = [];
izleyici.connect('changed', (_t, durum, rate) => gecisler.push(`${durum}${rate ? '+rate' : ''}`));

/* Tek senaryo: prompt → birkaç araç → izin isteği → devam → bitiş.
 * Ardından bir StopFailure(rate_limit). */
const adimlar = [
    {ad: 'UserPromptSubmit → WORKING',
     yuk: {hook_event_name: 'UserPromptSubmit', prompt: 'x'.repeat(50000)},
     kontrol: t => ol('UserPromptSubmit → WORKING', t.state === DURUM.WORKING, t.state)},

    {ad: 'PreToolUse(Read) → WORKING',
     yuk: {hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: {file_path: '/x'}},
     kontrol: t => ol('PreToolUse(Read) → WORKING', t.state === DURUM.WORKING, t.state)},

    {ad: 'PreToolUse(Bash) → WORKING (araç adı fark etmez)',
     yuk: {hook_event_name: 'PreToolUse', tool_name: 'Bash'},
     kontrol: t => ol('PreToolUse(Bash) → WORKING (araç adı fark etmez)',
         t.state === DURUM.WORKING, t.state)},

    {ad: 'PermissionRequest → WAITING',
     yuk: {hook_event_name: 'PermissionRequest', tool_name: 'Bash'},
     kontrol: t => ol('PermissionRequest → WAITING', t.state === DURUM.WAITING, t.state)},

    {ad: 'Notification(bilgi) → WAITING bozulmuyor',
     yuk: {hook_event_name: 'Notification', notification_type: 'plan_mode_exit'},
     kontrol: t => ol('Notification(ilgisiz tip) WAITING\'i bozmuyor',
         t.state === DURUM.WAITING, t.state)},

    {ad: 'Notification(permission_prompt) → WAITING',
     yuk: {hook_event_name: 'Notification', notification_type: 'permission_prompt'},
     kontrol: t => ol('Notification(permission_prompt) → WAITING',
         t.state === DURUM.WAITING, t.state)},

    {ad: 'PreToolUse → WAITING\'den çıkış',
     yuk: {hook_event_name: 'PreToolUse', tool_name: 'Bash'},
     kontrol: t => ol('PreToolUse WAITING\'den çıkarıyor', t.state === DURUM.WORKING, t.state)},

    {ad: 'Stop → IDLE',
     yuk: {hook_event_name: 'Stop'},
     kontrol: t => ol('Stop → IDLE', t.state === DURUM.IDLE, t.state)},

    {ad: 'StopFailure(rate_limit) → IDLE + bayrak',
     yuk: {hook_event_name: 'StopFailure', error_type: 'rate_limit'},
     kontrol: t => ol('StopFailure(rate_limit) → IDLE + rateLimited',
         t.state === DURUM.IDLE && t.rateLimited, `${t.state} rate=${t.rateLimited}`)},

    {ad: 'UserPromptSubmit rate bayrağını düşürüyor',
     yuk: {hook_event_name: 'UserPromptSubmit'},
     kontrol: t => ol('yeni istem rate limit bayrağını düşürüyor',
         t.state === DURUM.WORKING && !t.rateLimited, `${t.state} rate=${t.rateLimited}`)},

    {ad: 'StopFailure(başka hata) bayrağı kaldırmıyor',
     yuk: {hook_event_name: 'StopFailure', error_type: 'connection_error'},
     kontrol: t => ol('StopFailure(rate_limit değil) → IDLE, bayrak yok',
         t.state === DURUM.IDLE && !t.rateLimited, `${t.state} rate=${t.rateLimited}`)},

    {ad: 'bozuk JSON',
     once: () => GLib.file_set_contents(
         GLib.build_filenamev([inboxDir(), '9999999999999999999-Bozuk.json']),
         '{ bu JSON değil'),
     bekleMs: 300,
     kontrol: t => ol('bozuk dosya: durum değişmedi ve dosya silindi',
         t.state === DURUM.IDLE &&
         !GLib.file_test(GLib.build_filenamev([inboxDir(), '9999999999999999999-Bozuk.json']),
             GLib.FileTest.EXISTS),
         `atılan ${t.stats.dropped}`)},

    {ad: 'kaydolmadığımız olay yok sayılıyor',
     yuk: {hook_event_name: 'PostToolUse', tool_name: 'Read'},
     kontrol: t => ol('bilinmeyen olay durumu değiştirmiyor', t.state === DURUM.IDLE, t.state)},
];

adimlariSur(izleyici, adimlar, sureler => {
    const ortalama = sureler.reduce((a, b) => a + b, 0) / sureler.length;
    const enKotu = Math.max(...sureler);
    print('');
    print(`geçişler: ${gecisler.join(' → ')}`);
    print(`inbox boş mu: ${izleyici._listNames(Gio.File.new_for_path(inboxDir())).length === 0}`);
    print(`hook süresi: ortalama ${ortalama.toFixed(1)} ms · en kötü ${enKotu.toFixed(1)} ms ` +
        `(${sureler.length} çağrı, süreç başlatma dahil)`);
    ol('hook 50 ms altında', enKotu < 50, `en kötü ${enKotu.toFixed(1)} ms`);
    izleyici.stop();
});

// ------------------------------------------------------- uyku zaman aşımı

/* Ayrı bir izleyici: 300 ms'lik uyku sayacıyla iki kural sınanıyor —
 * WORKING zaman aşımına uğruyor, WAITING UĞRAMIYOR. İkincisi bilinçli bir
 * karar: pet sana soruyorsa, sen cevap verene kadar sormayı bırakmamalı. */
const uyku = new Tracker({sleepTimeoutMs: 300});
uyku.start();

adimlariSur(uyku, [
    {yuk: {hook_event_name: 'PreToolUse', tool_name: 'Bash'},
     bekleMs: 100,
     kontrol: t => ol('uyku: önce WORKING', t.state === DURUM.WORKING, t.state)},
    {bekleMs: 500,
     kontrol: t => ol('uyku: olay gelmeyince WORKING → IDLE', t.state === DURUM.IDLE, t.state)},
    {yuk: {hook_event_name: 'PermissionRequest'},
     bekleMs: 100,
     kontrol: t => ol('uyku: PermissionRequest → WAITING', t.state === DURUM.WAITING, t.state)},
    {bekleMs: 600,
     kontrol: t => ol('uyku: WAITING zaman aşımına UĞRAMIYOR (yapışkan)',
         t.state === DURUM.WAITING, t.state)},
], () => uyku.stop());

// --------------------------------------------------------------------- bitiş

// Geçici dizini temizle.
try {
    GLib.spawn_command_line_sync(`rm -rf ${GLib.shell_quote(GECICI)}`);
} catch { /* /tmp zaten temizlenir */ }

print('');
print(`${gecti}/${gecti + kaldi} geçti`);
if (kaldi)
    imports.system.exit(1);
