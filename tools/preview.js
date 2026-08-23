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
 * "Kutular" düğmesi (Faz 2) actor sınırlarını gösteriyor: yeşil karakter
 * katmanının, mavi laptop katmanının BİRLEŞİM kutusu — yani kabuktaki iki
 * actor'ün tam olarak kapladığı alan. Yeşil kutunun dışı tıklama yutmayan
 * bölge. Kesikli kutu o karenin sıkı kutusu; birleşimin neden ondan büyük
 * olduğu böyle görülüyor.
 *
 * Kullanım:  gjs -m tools/preview.js     (ya da `make preview`)
 */

import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';

import {loadAnimations} from '../src/lib/animations.js';
import {KATMANLAR, drawLayer, frameStripCount} from '../src/lib/sprite.js';
import {Player} from '../src/lib/player.js';

/** Büyük oynatma alanının hücre boyutu. */
const OYNAT_HUCRE = 5;
/** Izgaradaki küçük karelerin hücre boyutu. */
const IZGARA_HUCRE = 2;

/** Katman kutularının rengi. */
const KUTU_RENK = {
    karakter: [0.15, 0.85, 0.35],
    laptop: [0.25, 0.55, 1.0],
};

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
const katmanAdlari = Object.keys(KATMANLAR);

/** Bir kareyi bütün katmanlarıyla, tam tuval koordinatlarında çizer. */
function kareCiz(cr, kare, hucre) {
    for (const ad of katmanAdlari)
        drawLayer(cr, kare?.[ad], A.colors, hucre, null);
}

function kutuCiz(cr, box, hucre, renk, kesikli) {
    if (!box)
        return;
    cr.setSourceRGB(renk[0], renk[1], renk[2]);
    cr.setLineWidth(1);
    cr.setDash(kesikli ? [3, 3] : [], 0);
    // Yarım piksel kaydırma: 1 px'lik çizgi bulanıklaşmasın.
    cr.rectangle(box.x * hucre + 0.5, box.y * hucre + 0.5,
        box.w * hucre - 1, box.h * hucre - 1);
    cr.stroke();
}

/** Verilen kareyi çizen bir DrawingArea üretir. */
function kareAlani(kareGetir, hucre, kutuGetir = null) {
    const alan = new Gtk.DrawingArea({
        content_width: A.w * hucre,
        content_height: A.h * hucre,
    });
    alan.set_draw_func((_alan, cr) => {
        try {
            const kare = kareGetir();
            kareCiz(cr, kare, hucre);

            const kutular = kutuGetir?.();
            if (kutular) {
                for (const ad of katmanAdlari) {
                    kutuCiz(cr, kutular[ad], hucre, KUTU_RENK[ad], false);
                    kutuCiz(cr, kare?.[ad]?.box, hucre, KUTU_RENK[ad], true);
                }
            }
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

    // ---- üst çubuk: animasyon seçimi, oynat/duraklat, kutular
    const ustCubuk = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 8});
    const secici = Gtk.DropDown.new_from_strings(adlar);
    const oynatDugme = new Gtk.ToggleButton({label: 'Duraklat', active: true});
    const kutuDugme = new Gtk.ToggleButton({label: 'Kutular', active: false});
    const bilgi = new Gtk.Label({xalign: 0, hexpand: true});
    ustCubuk.append(secici);
    ustCubuk.append(oynatDugme);
    ustCubuk.append(kutuDugme);
    ustCubuk.append(bilgi);
    kok.append(ustCubuk);

    /** O an seçili animasyon. */
    const secili = () => A.animations[adlar[secici.selected]];

    // ---- büyük oynatma alanı
    const player = new Player(A.animations, () => {
        oynatAlani.queue_draw();
        bilgiYaz();
    });
    const oynatAlani = kareAlani(
        () => player.currentFrame(),
        OYNAT_HUCRE,
        () => (kutuDugme.active ? secili()?.boxes : null));
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

    function kutuYazisi(a) {
        return katmanAdlari.map(ad => {
            const b = a.boxes[ad];
            return b ? `${ad} ${b.w}×${b.h}` : `${ad} yok`;
        }).join(' · ');
    }

    function bilgiYaz() {
        const a = secili();
        if (!a)
            return;
        bilgi.label =
            `${a.name} · kare ${player.frameIndex + 1}/${a.frames.length} · ` +
            `hold ${a.holds[player.frameIndex]} · ${a.fps} fps · ` +
            `${(a.durationMs / 1000).toFixed(2)} sn · ` +
            `${frameStripCount(player.currentFrame())} şerit · ${kutuYazisi(a)}`;
    }

    function izgarayiKur() {
        let cocuk;
        while ((cocuk = izgara.get_first_child()) !== null)
            izgara.remove(cocuk);

        const a = secili();
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
    kutuDugme.connect('toggled', () => oynatAlani.queue_draw());
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
