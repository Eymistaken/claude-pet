#!/usr/bin/env -S gjs -m
/* Oynatıcı testi — kare zamanlaması ve TAKILMA ölçütü.
 *
 * NEDEN AYRI: `director.js` durumdan klibe kadar olan kısmı sahte bir
 * player'la sürüyor; burası gerçek `Player`ı gerçek GLib zamanlayıcılarıyla
 * sürüyor. İkisi ayrı sorulara bakıyor — biri SIRA, bu ZAMAN.
 *
 * ASIL İDDİA `stalled`. Bekçinin tek ölçütü o: "çok kareli bir klip var,
 * zamanlayıcısı yok, bitmiş de değil". Normal işleyişte bu üçlünün hiç
 * oluşmaması gerekiyor, yoksa bekçi durup dururken klip yeniden başlatır.
 * Aşağıdaki iddialar tam olarak bunu ölçüyor.
 *
 * Kullanım:  gjs -m tests/player.js     (`make replay` bunu da çalıştırır)
 */

import GLib from 'gi://GLib';

import {Player} from '../src/lib/player.js';

let gecti = 0;
let kaldi = 0;

function ol(ad, kosul, ayrinti = '') {
    if (kosul)
        gecti++;
    else
        kaldi++;
    print(`${kosul ? 'GEÇTİ' : 'KALDI'}  ${ad}${ayrinti ? `  — ${ayrinti}` : ''}`);
}

/** Derlenmiş varlığın player'ın gördüğü kadarı: ad, fps, loop, holds, frames.
 *  `frames` içeriğine bakılmıyor — çizim `sprite.js`in işi. */
function klip(name, kare, {fps = 50, loop = false, holds = null} = {}) {
    return {
        name, fps, loop,
        frames: Array.from({length: kare}, (_, i) => ({i})),
        holds: holds ?? Array.from({length: kare}, () => 1),
    };
}

const VARLIK = {
    idle: klip('idle', 1, {loop: true}),
    typing: klip('typing', 4, {loop: true}),
    laptop_out: klip('laptop_out', 3, {loop: false}),
};

// ------------------------------------------------------- zamanlayıcısız hâller

{
    const p = new Player(VARLIK, () => {}, () => {});

    ol('başlangıçta takılmış sayılmıyor', p.stalled === false);
    ol('başlangıçta klip yok', p.currentName === null);

    // TEK KARELİK DÖNGÜ: gösterilecek başka kare yok, zamanlayıcı kurulmuyor.
    // Bekçi bunu takılma SANMAMALI, yoksa idle'daki pet saniyede bir yeniden
    // başlatılırdı.
    p.play('idle');
    ol('tek karelik döngüde zamanlayıcı yok', p.running === false);
    ol('tek karelik döngü TAKILMA değil', p.stalled === false, `klip ${p.currentName}`);

    p.stop();
}

// --------------------------------------------------------------- takılma hâli

{
    const p = new Player(VARLIK, () => {}, () => {});

    p.play('typing');
    ol('çok kareli döngüde zamanlayıcı var', p.running === true);
    ol('çalarken takılmış sayılmıyor', p.stalled === false);

    // Zincirin koptuğu hâl: zamanlayıcı gitti, klip bitmedi, kare ortada.
    // `freeze()` de aynı imzayı bırakıyor — ayıran şey yönetmenin `_held`
    // kontrolü, oynatıcı değil.
    p.freeze();
    ol('zamanlayıcı düşünce TAKILMIŞ görünüyor', p.stalled === true);
    ol('dondurulmuş klip kaybolmuyor', p.currentName === 'typing');

    p.thaw();
    ol('çözülünce takılma bitiyor', p.stalled === false && p.running === true);

    p.stop();
}

// ------------------------------------------------------------- döngü bayrağı

{
    const p = new Player(VARLIK, () => {}, () => {});

    // Aynı klip zaten çalıyorken yeniden istenirse baştan başlamıyor — ama
    // DÖNGÜ BAYRAĞI yazılmalı: aynı klip dizinin sonunda mı ortasında mı
    // olduğuna göre dönmeli ya da durmalı.
    p.play('typing', {loop: true});
    const ayniNesne = p.currentName;
    p.play('typing', {loop: false});
    ol('aynı klip baştan başlamıyor', p.frameIndex === 0 && p.currentName === ayniNesne);
    ol('ama döngü bayrağı güncelleniyor', p.looping === false, `looping ${p.looping}`);

    p.stop();
}

// ------------------------------------------------ döngüsüz klip bitince ne olur
//
// Son kare kendi `hold` süresince duruyor, sonra `onCycle` gidiyor ve klip
// `_finished` işaretleniyor. O andan sonra zamanlayıcı YOK ama takılmış da
// DEĞİL — bekçi bunu yeniden başlatmamalı.

const loop = GLib.MainLoop.new(null, false);

{
    const turlar = [];
    const p = new Player(VARLIK, () => {}, ad => turlar.push(ad));

    p.play('laptop_out');           // 3 kare, 50 fps, holds hepsi 1 → ~60 ms
    ol('döngüsüz klip çalmaya başladı', p.running === true);

    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
        ol('döngüsüz klip turunu bildirdi', turlar.length === 1, JSON.stringify(turlar));
        ol('bitince zamanlayıcı yok', p.running === false);
        ol('BİTMİŞ klip takılmış sayılmıyor', p.stalled === false);
        ol('son karede duruyor', p.frameIndex === 2, `kare ${p.frameIndex}`);

        // Biten klip `thaw()` ile ikinci bir tur bildirmiyor.
        p.thaw();
        ol('biten klip thaw ile yeniden başlamıyor',
            p.running === false && turlar.length === 1);

        p.stop();
        loop.quit();
        return GLib.SOURCE_REMOVE;
    });
}

loop.run();

print('');
print(`${gecti}/${gecti + kaldi} geçti`);
if (kaldi)
    imports.system.exit(1);
