#!/usr/bin/env -S gjs -m
/* Kare kaydedici — README'deki GIF'i üreten araç.
 *
 * NEDEN GJS: çizim `src/lib/sprite.js`'ten geliyor, yani buradaki kareler
 * kabuğun çizdiğinin AYNISI. Belgelerdeki görüntü için ikinci bir çizim
 * yolu yazmak, iki yolun zamanla ayrışması demekti.
 *
 * Ekran KAYDI ALMIYOR: kareler doğrudan Cairo ile PNG'ye yazılıyor. Ekran
 * kaydı almak imleç, duvar kâğıdı ve pencere kenarı getirirdi; burada
 * yalnızca maskot var.
 *
 * Tuval BÜTÜN kliplerin birleşimi: sıra içinde klip değişirken maskot
 * yerinden oynamıyor.
 *
 * Kullanım:
 *   gjs -m tools/kayit.js [klip,klip,...] [çıktı-dizini] [hücre-px]
 *   gjs -m tools/kayit.js laptop_out,typing,typing,laptop_away /tmp/kare 8
 *
 * Çıktı: <dizin>/kare-000.png … ve <dizin>/sureler.json (kare başına ms).
 * GIF'e çevirmek `make gif` işi (PIL); GIF yazan bir Cairo yok.
 */

import Cairo from 'gi://cairo';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {loadAnimations} from '../src/lib/animations.js';
import {KATMANLAR, drawLayer, unionBox} from '../src/lib/sprite.js';

/** GIF'in arka planı. GIF tek bir şeffaflık indeksi taşıyabildiği için
 *  şeffaf bırakmak yerine düz bir zemin veriliyor — koyu zeminde turuncu
 *  gövde en iyi okunan hâli. */
const ZEMIN = [0.11, 0.11, 0.12];

/** Maskotun etrafında bırakılan boşluk (hücre). */
const KENAR = 2;

function buradaki() {
    const [dosya] = GLib.filename_from_uri(import.meta.url);
    return GLib.path_get_dirname(dosya);
}

const KOK = GLib.path_get_dirname(buradaki());
const A = loadAnimations(GLib.build_filenamev([KOK, 'assets', 'animations.json']));
if (!A.ok) {
    printerr('varlık okunamadı');
    imports.system.exit(1);
}

const sira = (ARGV[0] ?? 'laptop_out,typing,typing,laptop_away,idle').split(',');
const cikti = ARGV[1] ?? '/tmp/claude-pet-kare';
const hucre = Number(ARGV[2] ?? 8);

const eksik = sira.filter(ad => !A.animations[ad]);
if (eksik.length) {
    printerr(`varlıkta yok: ${eksik.join(', ')}`);
    imports.system.exit(1);
}

// Tuval: sıradaki BÜTÜN kliplerin, BÜTÜN katmanlarının birleşimi.
const kutu = unionBox(sira.flatMap(ad =>
    Object.keys(KATMANLAR).map(katman => A.animations[ad].boxes[katman])));
if (!kutu) {
    printerr('kutu hesaplanamadı (boş klipler)');
    imports.system.exit(1);
}

const genislik = (kutu.w + 2 * KENAR) * hucre;
const yukseklik = (kutu.h + 2 * KENAR) * hucre;
const kokKutu = {x: kutu.x - KENAR, y: kutu.y - KENAR};

Gio.File.new_for_path(cikti).make_directory_with_parents(null);

const sureler = [];
let sayac = 0;

for (const ad of sira) {
    const anim = A.animations[ad];
    anim.frames.forEach((kare, i) => {
        const yuzey = new Cairo.ImageSurface(Cairo.Format.ARGB32, genislik, yukseklik);
        const cr = new Cairo.Context(yuzey);

        cr.setSourceRGB(ZEMIN[0], ZEMIN[1], ZEMIN[2]);
        cr.paint();

        // Kabuğun repaint yolunun aynısı: katman katman, ızgara ofsetiyle.
        for (const katman of Object.keys(KATMANLAR))
            drawLayer(cr, kare[katman], A.colors, hucre, kokKutu);

        cr.$dispose();
        const dosya = GLib.build_filenamev(
            [cikti, `kare-${String(sayac).padStart(3, '0')}.png`]);
        yuzey.writeToPNG(dosya);
        yuzey.finish();

        // Kare süresi varlığın kendi ritmi: holds[i] / fps.
        sureler.push(Math.round(1000 / anim.fps * anim.holds[i]));
        sayac++;
    });
}

const meta = GLib.build_filenamev([cikti, 'sureler.json']);
GLib.file_set_contents(meta, JSON.stringify(sureler));

print(`${sayac} kare · ${genislik}×${yukseklik} px · ${cikti}`);
print(`toplam ${sureler.reduce((a, b) => a + b, 0)} ms · sıra: ${sira.join(' → ')}`);
