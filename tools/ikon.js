#!/usr/bin/env -S gjs -m
/* Uygulama simgesi — varliktan uretiliyor, elle cizilmiyor.
 *
 * NEDEN: simge de maskotun kendisi olsun ve poz atolyesinde karakter
 * degistiginde simge de degissin. Cizim `src/lib/sprite.js`ten geliyor, yani
 * simgedeki pet ekrandakiyle ayni.
 *
 * Kullanim: gjs -m tools/ikon.js [cikti.png] [boyut]
 */

import GLib from 'gi://GLib';
import cairo from 'gi://cairo';

import {loadAnimations} from '../src/lib/animations.js';
import {drawLayer} from '../src/lib/sprite.js';

function buradaki() {
    const [dosya] = GLib.filename_from_uri(import.meta.url);
    return GLib.path_get_dirname(dosya);
}

const KOK = GLib.path_get_dirname(buradaki());
const CIKTI = ARGV[0] ?? GLib.build_filenamev([KOK, 'app', 'data', 'claude-pet.png']);
const BOYUT = Number(ARGV[1] ?? 256);

const A = loadAnimations(GLib.build_filenamev([KOK, 'assets', 'animations.json']));
if (!A.ok) {
    printerr('varlik okunamadi');
    imports.system.exit(1);
}

// Duz durus: simgenin "notr" hali. Yoksa eldeki ilk klip.
const anim = A.animations.idle ?? Object.values(A.animations)[0];
const kare = anim.frames[0];
const kutu = anim.boxes.karakter ?? anim.boxes.laptop;

// Hucre boyutu TAM SAYI olmali, yoksa piksel kenarlari bulaniklasir.
const kenarBosluk = 0.12;
const hucre = Math.max(1, Math.floor(
    BOYUT * (1 - 2 * kenarBosluk) / Math.max(kutu.w, kutu.h)));
const genislik = kutu.w * hucre;
const yukseklik = kutu.h * hucre;

const yuzey = new cairo.ImageSurface(cairo.Format.ARGB32, BOYUT, BOYUT);
const cr = new cairo.Context(yuzey);
cr.translate(Math.round((BOYUT - genislik) / 2), Math.round((BOYUT - yukseklik) / 2));
drawLayer(cr, kare.karakter, A.colors, hucre, kutu);
cr.$dispose();

yuzey.flush();
yuzey.writeToPNG(CIKTI);
print(`simge: ${CIKTI} (${BOYUT}x${BOYUT}, hucre ${hucre}px)`);
