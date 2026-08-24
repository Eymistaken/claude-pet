#!/usr/bin/env -S gjs -m
/* Koreografi testi — yönetmenin ürettiği klip sırasını doğrular.
 *
 * NEDEN AYRI: `replay.js` hook'tan duruma kadar olan zinciri sürüyor; burası
 * durumdan KLİBE kadar olan kısmı. Player sahte, çünkü ölçülmek istenen şey
 * zamanlama değil SIRA: hangi klip, hangi sırayla, ne zaman kesiliyor.
 *
 * Sahte player gerçeğini birebir taklit ediyor: çok kareli klipte zamanlayıcı
 * kurulu (`running === true`), tek karelik döngüde (idle, waiting) hiç
 * kurulmuyor — yönetmenin "turu bitmesini bekle" kuralı tam da bu ayrıma
 * dayanıyor.
 *
 * Kullanım:  gjs -m tests/director.js     (`make replay` bunu da çalıştırır)
 */

import GLib from 'gi://GLib';

import {Director} from '../src/lib/director.js';
import {EXIT_ANIM, ENTER_ANIM, STATE_ANIM, sequence} from '../src/lib/states.js';

let gecti = 0;
let kaldi = 0;

function ol(ad, kosul, ayrinti = '') {
    if (kosul)
        gecti++;
    else
        kaldi++;
    print(`${kosul ? 'GEÇTİ' : 'KALDI'}  ${ad}${ayrinti ? `  — ${ayrinti}` : ''}`);
}

function esit(ad, bulunan, beklenen) {
    const a = JSON.stringify(bulunan);
    const b = JSON.stringify(beklenen);
    ol(ad, a === b, a === b ? a : `bulunan ${a} · beklenen ${b}`);
}

/* Varlıktaki gerçek kare sayıları: tek kareli olanlar (idle, waiting)
 * zamanlayıcı kurmuyor, ötekiler kuruyor. */
const COK_KARELI = new Set(['laptop_out', 'typing', 'laptop_away', 'waiting_in', 'waiting_out']);
const KLIPLER = ['idle', 'laptop_out', 'typing', 'laptop_away',
    'waiting_in', 'waiting', 'waiting_out'];

/** Sahte player + yönetmen. */
function kur(klipler = KLIPLER) {
    const animations = Object.fromEntries(klipler.map(k => [k, {name: k}]));
    const oynatilan = [];
    let calisiyor = false;
    let sonKlip = null;
    let sonLoop = false;

    const d = new Director({
        animations,
        play: (ad, secenekler) => {
            oynatilan.push(ad);
            sonKlip = ad;
            sonLoop = secenekler?.loop ?? false;
            calisiyor = COK_KARELI.has(ad);
            return true;
        },
        isRunning: () => calisiyor,
        sleepTimeoutMs: 0,
    });

    /** Çalan klibin turunu bitir. Döngü klibiyse dönmeye devam eder. */
    const tur = () => {
        if (!calisiyor)
            throw new Error(`tur(): ${sonKlip} zaten çalmıyor`);
        calisiyor = sonLoop && COK_KARELI.has(sonKlip);
        d.onCycle(sonKlip);
    };

    return {d, oynatilan, tur, calisiyorMu: () => calisiyor, bosalt: () => oynatilan.splice(0)};
}

// ------------------------------------------------------------------- tablolar

esit('IDLE → WORKING dizisi', sequence('IDLE', 'WORKING'), ['laptop_out', 'typing']);
esit('WORKING → IDLE dizisi', sequence('WORKING', 'IDLE'), ['laptop_away', 'idle']);
esit('WORKING → WAITING dizisi', sequence('WORKING', 'WAITING'),
    ['laptop_away', 'waiting_in', 'waiting']);
esit('WAITING → WORKING dizisi', sequence('WAITING', 'WORKING'),
    ['waiting_out', 'laptop_out', 'typing']);
esit('WAITING → IDLE dizisi', sequence('WAITING', 'IDLE'), ['waiting_out', 'idle']);
esit('IDLE → WAITING dizisi', sequence('IDLE', 'WAITING'), ['waiting_in', 'waiting']);
ol('her dizi döngü klibiyle bitiyor',
    ['IDLE', 'WORKING', 'WAITING'].every(a =>
        ['IDLE', 'WORKING', 'WAITING'].every(b =>
            sequence(a, b).at(-1) === STATE_ANIM[b])));
ol('IDLE\'ın giriş/çıkış klibi yok',
    ENTER_ANIM.IDLE.length === 0 && EXIT_ANIM.IDLE.length === 0);

// ------------------------------------------------------------------ açılış

{
    const {d, oynatilan} = kur();
    d.start();
    esit('açılışta idle', oynatilan, ['idle']);
}

// ------------------------------------------------- kural 1: WORKING yapışkan

{
    const {d, tur, bosalt} = kur();
    d.start();
    bosalt();

    d.setState('WORKING', false);
    esit('WORKING: laptop çıkıyor', bosalt(), ['laptop_out']);
    tur();
    esit('laptop_out bitince typing', bosalt(), ['typing']);

    // Araya giren araç çağrıları: tracker aynı durumu tekrar tekrar veriyor.
    d.setState('WORKING', false);
    d.setState('WORKING', false);
    d.setState('WORKING', false);
    esit('araya giren araç çağrıları laptobu KALDIRMIYOR', bosalt(), []);

    // typing turları dönmeye devam ediyor, klip değişmiyor.
    tur();
    tur();
    esit('typing turları klip değiştirmiyor', bosalt(), []);
}

// --------------------------------------- kural 4: animasyon ortasından kesilmez

{
    const {d, tur, bosalt, calisiyorMu} = kur();
    d.start();
    d.setState('WORKING', false);
    tur();               // laptop_out bitti → typing
    bosalt();

    ol('typing çalıyor', calisiyorMu());
    d.setState('WAITING', false);
    esit('durum değişti ama klip ANINDA kesilmedi', bosalt(), []);

    tur();               // typing turunu bitirdi
    esit('tur bitince geçiş başlıyor', bosalt(), ['laptop_away']);
    tur();
    esit('laptop_away → waiting_in', bosalt(), ['waiting_in']);
    tur();
    esit('waiting_in → waiting', bosalt(), ['waiting']);
    ol('waiting tek kare: zamanlayıcı yok', !calisiyorMu());
}

// ------------------------------- WAITING → WORKING (cevap verildi) ANINDA başlar

{
    const {d, tur, bosalt} = kur();
    d.start();
    d.setState('WAITING', false);
    tur();               // waiting_in
    bosalt();            // waiting oynadı
    d.setState('WAITING', false);   // tekrar aynı durum

    d.setState('WORKING', false);
    esit('waiting beklemede değil: geçiş anında başlıyor', bosalt(), ['waiting_out']);
    tur();
    esit('waiting_out → laptop_out', bosalt(), ['laptop_out']);
    tur();
    esit('laptop_out → typing', bosalt(), ['typing']);
}

// ----------------------------------------------------- kural 2: WORKING → IDLE

{
    const {d, tur, bosalt} = kur();
    d.start();
    d.setState('WORKING', false);
    tur();
    bosalt();

    d.setState('IDLE', false);
    tur();               // typing turu bitti
    esit('IDLE: laptop kalkıyor', bosalt(), ['laptop_away']);
    tur();
    esit('laptop_away → idle', bosalt(), ['idle']);

    d.setState('IDLE', false);
    esit('zaten IDLE: hiçbir şey oynatmıyor', bosalt(), []);
}

// ------------------------------------------------ kural 5: rate limit = anilik

{
    const {d, tur, bosalt, calisiyorMu} = kur();
    d.start();
    d.setState('WORKING', false);
    tur();
    bosalt();
    ol('rate limit öncesi typing çalıyor', calisiyorMu());

    d.setState('IDLE', true);
    esit('rate limit: laptop_away OYNAMIYOR, doğrudan idle', bosalt(), ['idle']);
    ol('rate limit: tur bitmesi beklenmiyor (anilik kasıtlı)', !calisiyorMu());
}

// --------------------------------------- hedef dizi ortasında değişirse

{
    const {d, tur, bosalt} = kur();
    d.start();
    bosalt();                       // açılıştaki idle sayılmasın
    d.setState('WORKING', false);
    esit('laptop_out başladı', bosalt(), ['laptop_out']);

    // Henüz typing'e geçmeden WAITING geldi.
    d.setState('WAITING', false);
    esit('dizi ortasında anında kesilmiyor', bosalt(), []);
    tur();               // laptop_out turunu bitirdi
    esit('kalan dizi bırakılıp yeniden planlanıyor', bosalt(), ['laptop_away']);
    tur();
    esit('sonra waiting_in', bosalt(), ['waiting_in']);
}

// ------------------------------------------------------- eksik klip → idle

{
    // `typing` varlıkta yok.
    const {d, tur, bosalt} = kur(KLIPLER.filter(k => k !== 'typing'));
    d.start();
    bosalt();
    d.setState('WORKING', false);
    esit('eksik klipte laptop_out yine de oynuyor', bosalt(), ['laptop_out']);
    tur();
    esit('typing yok → idle\'a düşüyor', bosalt(), ['idle']);
}

// ---------------------------------------------------------------- uyku

{
    const animations = Object.fromEntries(
        [...KLIPLER, 'sleep'].map(k => [k, {name: k}]));
    const oynatilan = [];
    const d = new Director({
        animations,
        play: ad => {
            oynatilan.push(ad);
            return true;
        },
        isRunning: () => false,
        sleepTimeoutMs: 120,
    });
    d.start();
    oynatilan.splice(0);

    const dongu = new GLib.MainLoop(null, false);
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
        esit('sleep klibi varsa boşta uykuya geçiyor', oynatilan, ['sleep']);
        d.stop();
        dongu.quit();
        return GLib.SOURCE_REMOVE;
    });
    dongu.run();
}

{
    // Varlıkta `sleep` yok: uyku hiç kurulmamalı, idle'da kalmalı.
    const {d, oynatilan} = kur();
    d.start();
    oynatilan.splice(0);
    const dongu = new GLib.MainLoop(null, false);
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
        esit('sleep klibi yoksa idle\'da kalıyor', oynatilan, []);
        d.stop();
        dongu.quit();
        return GLib.SOURCE_REMOVE;
    });
    dongu.run();
}

print('');
print(`${gecti}/${gecti + kaldi} geçti`);
if (kaldi)
    imports.system.exit(1);
