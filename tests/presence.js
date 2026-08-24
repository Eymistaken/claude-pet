#!/usr/bin/env -S gjs -m
/* Varlık takibi testi — "Claude açık mı" sorusunun cevabı.
 *
 * GERÇEK SÜREÇLERLE sınanıyor, sahte bir /proc ile değil: bu kodun tek işi
 * çekirdeğin verdiği listeyi doğru okumak, o yüzden taklit etmek testi
 * anlamsızlaştırırdı. Aranan ad dışarıdan verilebildiği için `sleep`
 * süreçleri Claude'un yerine geçiyor — doğup ölmesi bizim elimizde.
 *
 * Kullanım:  gjs -m tests/presence.js     (`make replay` bunu da çalıştırır)
 */

import GLib from 'gi://GLib';

import {Presence, SURECLER} from '../src/lib/presence.js';

let gecti = 0;
let kaldi = 0;

function ol(ad, kosul, ayrinti = '') {
    if (kosul)
        gecti++;
    else
        kaldi++;
    print(`${kosul ? 'GEÇTİ' : 'KALDI'}  ${ad}${ayrinti ? `  — ${ayrinti}` : ''}`);
}

// ------------------------------------------------------------------ tablo

ol('aranan adlar ölçülen iki değer',
    SURECLER.includes('claude-desktop') && SURECLER.includes('claude'),
    SURECLER.join(' '));
ol('`comm` 15 karakter sınırına sığıyorlar',
    SURECLER.every(a => a.length <= 15));

// ------------------------------------------------------- var / yok cevabı

{
    // Bu testin kendisi bir gjs süreci: aranırsa MUTLAKA bulunmalı.
    const p = new Presence({names: ['gjs']});
    ol('çalışan bir süreç bulunuyor', p.start() === true);
    ol('bulunan sürecin adı bildiriliyor', p.name === 'gjs', p.name);
    p.stop();
}

{
    const p = new Presence({names: ['boyle-bir-surec-yok-42']});
    ol('olmayan süreç bulunmuyor', p.start() === false);
    p.stop();
}

// --------------------------------------------- hızlı yol (pid önbelleği)

{
    const p = new Presence({names: ['gjs']});
    p.start();
    for (let i = 0; i < 5; i++)
        p.poke();
    const {fullScans, fastChecks} = p.stats;
    ol('süreç yaşarken tam tarama TEKRARLANMIYOR', fullScans === 1,
        `${fullScans} tam tarama, ${fastChecks} hızlı kontrol`);
    p.stop();
}

// ------------------------------------------------- süreç ölünce haber var

{
    // Kendi "Claude"umuzu açıyoruz: adı `sleep`, ömrü bizim elimizde.
    const [, pid] = GLib.spawn_async(null, ['sleep', '30'], null,
        GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD, null);
    // Toplanmayan çocuk ZOMBİ kalıyor ve /proc'ta adıyla durmaya devam
    // ediyor. Kod zombiyi zaten saymıyor ama testin de gerçekçi olması için
    // çocuk düzgün toplanıyor.
    GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, () => GLib.spawn_close_pid(pid));

    const p = new Presence({names: ['sleep'], intervalMs: 150});
    const olaylar = [];
    p.connect('changed', (_p, varMi) => olaylar.push(varMi));

    ol('süreç açıkken var diyor', p.start() === true);

    const dongu = new GLib.MainLoop(null, false);

    // Bir süre yaşasın: bu sırada hiçbir olay YAYILMAMALI (durum değişmedi).
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
        ol('durum değişmeyince olay yayılmıyor', olaylar.length === 0,
            JSON.stringify(olaylar));

        // Şimdi öldür.
        GLib.spawn_command_line_sync(`kill ${pid}`);

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 700, () => {
            ol('süreç ölünce "yok" olayı geliyor',
                olaylar.length === 1 && olaylar[0] === false,
                JSON.stringify(olaylar));
            ol('durum da güncellendi', p.present === false);
            const {fullScans} = p.stats;
            ol('ölümden sonra tam tarama yapılıyor', fullScans >= 2,
                `${fullScans} tam tarama`);
            p.stop();
            dongu.quit();
            return GLib.SOURCE_REMOVE;
        });
        return GLib.SOURCE_REMOVE;
    });

    dongu.run();
}

// ------------------------------------------------ süreç doğunca haber var

{
    const p = new Presence({names: ['sleep'], intervalMs: 150});
    const olaylar = [];
    p.connect('changed', (_p, varMi) => olaylar.push(varMi));
    ol('süreç yokken yok diyor', p.start() === false);

    const dongu = new GLib.MainLoop(null, false);
    const [, pid] = GLib.spawn_async(null, ['sleep', '30'], null,
        GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD, null);
    GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, () => GLib.spawn_close_pid(pid));

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
        ol('süreç doğunca "var" olayı geliyor',
            olaylar.length === 1 && olaylar[0] === true,
            JSON.stringify(olaylar));
        GLib.spawn_command_line_sync(`kill ${pid}`);
        p.stop();
        dongu.quit();
        return GLib.SOURCE_REMOVE;
    });
    dongu.run();
}

print('');
print(`${gecti}/${gecti + kaldi} geçti`);
if (kaldi)
    imports.system.exit(1);
