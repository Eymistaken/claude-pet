#!/usr/bin/env -S gjs -m
/* Bağımsız önizleyici — gnome-shell'e hiç dokunmaz.
 *
 * NEDEN VAR: `make nested` bir sanat iterasyonu için çok yavaş (kabuk yeniden
 * başlıyor, eklenti yükleniyor, ekran görüntüsü alınıyor). Poz kontrolü,
 * ritim kontrolü ve "beat'ler yerinde mi" sorusu buradan cevaplanacak.
 *
 * ÇİZİM KOPYALANMADI: `src/lib/sprite.js`, `animations.js` ve `player.js`
 * doğrudan içeri alınıyor. Yani burada gördüğün kare ve ritim, kabuğun
 * çizdiğinin aynısı — iki ayrı çizim yolu tutmak zorunda değiliz.
 *
 * Kullanım:  gjs -m tools/preview.js     (ya da `make preview`)
 */

import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';

import {loadAnimations} from '../src/lib/animations.js';
import {drawFrame, stripCount} from '../src/lib/sprite.js';
import {Player} from '../src/lib/player.js';

/** Büyük oynatma alanının hücre boyutu. */
const OYNAT_HUCRE = 5;
/** Izgaradaki küçük karelerin hücre boyutu. */
const IZGARA_HUCRE = 2;

/** Bu betiğin bulunduğu dizin — varlık yolunu ondan türetiyoruz. */
function buradaki() {
    const [dosya] = GLib.filename_from_uri(import.meta.url);
    return GLib.path_get_dirname(dosya);
}

const KOK = GLib.path_get_dirname(buradaki());
const VARLIK = GLib.build_filenamev([KOK, 'assets', 'animations.json']);

const A = loadAnimations(VARLIK);
if (!A.ok)
    printerr(`UYARI: ${VARLIK} okunamadı, boş varsayılan gösteriliyor`);

const adlar = Object.keys(A.animations);

/** Verilen kareyi çizen bir DrawingArea üretir. */
function kareAlani(kareGetir, hucre) {
    const alan = new Gtk.DrawingArea({
        content_width: A.w * hucre,
        content_height: A.h * hucre,
    });
    alan.set_draw_func((_alan, cr) => {
        try {
            drawFrame(cr, kareGetir(), A.colors, hucre);
        } finally {
            // GJS'de Cairo bağlamı elle bırakılmazsa sızıyor.
            cr.$dispose();
        }
    });
    return alan;
}

function pencereKur(app) {
    const win = new Gtk.ApplicationWindow({
        application: app,
        title: 'claude-pet — önizleme',
        default_width: 900,
        default_height: 760,
    });

    const kok = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 8,
        margin_top: 8, margin_bottom: 8, margin_start: 8, margin_end: 8,
    });
    win.set_child(kok);

    // ---- üst çubuk: animasyon seçimi ve oynat/duraklat
    const ustCubuk = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 8});
    const secici = Gtk.DropDown.new_from_strings(adlar);
    const oynatDugme = new Gtk.ToggleButton({label: 'Duraklat', active: true});
    const bilgi = new Gtk.Label({xalign: 0, hexpand: true});
    ustCubuk.append(secici);
    ustCubuk.append(oynatDugme);
    ustCubuk.append(bilgi);
    kok.append(ustCubuk);

    // ---- büyük oynatma alanı
    const player = new Player(A.animations, () => {
        oynatAlani.queue_draw();
        bilgiYaz();
    });
    const oynatAlani = kareAlani(() => player.currentFrame(), OYNAT_HUCRE);
    oynatAlani.set_halign(Gtk.Align.CENTER);
    kok.append(oynatAlani);

    kok.append(new Gtk.Separator({orientation: Gtk.Orientation.HORIZONTAL}));

    // ---- bütün kareler ızgarada
    const kaydirma = new Gtk.ScrolledWindow({vexpand: true});
    const izgara = new Gtk.FlowBox({
        selection_mode: Gtk.SelectionMode.NONE,
        homogeneous: true,
        row_spacing: 6,
        column_spacing: 6,
        max_children_per_line: 8,
    });
    kaydirma.set_child(izgara);
    kok.append(kaydirma);

    function bilgiYaz() {
        const a = A.animations[adlar[secici.selected]];
        if (!a)
            return;
        bilgi.label =
            `${a.name} · kare ${player.frameIndex + 1}/${a.frames.length} · ` +
            `hold ${a.holds[player.frameIndex]} · ${a.fps} fps · ` +
            `${(a.durationMs / 1000).toFixed(2)} sn · ` +
            `${stripCount(player.currentFrame())} şerit`;
    }

    function izgarayiKur() {
        let cocuk;
        while ((cocuk = izgara.get_first_child()) !== null)
            izgara.remove(cocuk);

        const a = A.animations[adlar[secici.selected]];
        if (!a)
            return;

        a.frames.forEach((kare, i) => {
            const kutu = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 2,
            });
            kutu.append(kareAlani(() => kare, IZGARA_HUCRE));
            // Uzun duran kareler ritmin kendisi — göze çarpsın.
            const hold = a.holds[i];
            const etiket = new Gtk.Label();
            etiket.set_markup(hold > 1
                ? `<small>${i}  ·  <b>hold ${hold}</b></small>`
                : `<small>${i}  ·  hold ${hold}</small>`);
            kutu.append(etiket);
            izgara.append(kutu);
        });
    }

    function animasyonDegisti() {
        const ad = adlar[secici.selected];
        // Önizlemede her şey döngüde oynasın; amaç pozları görmek.
        player.play(ad, {loop: true});
        if (!oynatDugme.active)
            player.stop();
        izgarayiKur();
        oynatAlani.queue_draw();
        bilgiYaz();
    }

    secici.connect('notify::selected', animasyonDegisti);
    oynatDugme.connect('toggled', () => {
        if (oynatDugme.active) {
            oynatDugme.label = 'Duraklat';
            player.play(adlar[secici.selected], {loop: true});
        } else {
            oynatDugme.label = 'Oynat';
            player.stop();
        }
    });

    win.connect('close-request', () => {
        // Zamanlayıcı arkada kalmasın.
        player.stop();
        return false;
    });

    animasyonDegisti();
    win.present();
}

const app = new Gtk.Application({application_id: 'local.eymistaken.ClaudePetPreview'});
app.connect('activate', () => pencereKur(app));
app.run([]);
