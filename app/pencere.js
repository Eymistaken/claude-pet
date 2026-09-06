/* Pet penceresi — layer-shell.
 *
 * EKLENTIDEN FARKI TEK CUMLE: orada maskot gnome-shell'in sahnesine iki
 * Clutter actor olarak ekleniyordu, burada `wlr-layer-shell` protokoluyle
 * `overlay` katmanina konan TEK bir GTK4 penceresi. Cizim, ritim, durum
 * makinesi ve konum aritmetigi ayni dosyalardan geliyor (`src/lib/`), yani
 * degisen sadece "nereye ciziliyor" sorusu.
 *
 * NEDEN TEK PENCERE, EKLENTIDE NEDEN IKI ACTOR'DU. Eklentide laptop ayri bir
 * actor'du cunku Wayland'de `affectsInputRegion` HICBIR SEY yapmiyor
 * (olculdu, `extension.js` basligi) ve tek actor'un seffaf kosleri tiklama
 * yutuyordu. Burada o kisit yok: `Gdk.Surface.set_input_region()` gercekten
 * uygulaniyor. Tek pencere iki katmani da ciziyor, giris bolgesi yalnizca
 * KARAKTER kutusuna esitleniyor. Sonuc eklentidekinden daha iyi: laptop ve
 * laptop ile karakter arasindaki bosluk artik hic tiklama almiyor.
 *
 * OLCEK: `scale_factor` ile CARPILMIYOR. Eklentide `St` fiziksel piksele
 * ciziyordu, o yuzden `cell = ayar x scale_factor` idi. GTK4 MANTIKSAL
 * piksele ciziyor ve olceklemeyi GSK yapiyor — ayni formul burada pet'i HiDPI
 * ekranda iki kat buyutur. `cell = ayar`, nokta.
 *
 * TAM EKRAN: hic ozel kod yok. `overlay` katmani protokol geregi tam ekran
 * pencerelerin ustunde. Eklentideki `Meta.disable_unredirect_for_display()`
 * ve onun tam ekran oyunlara bindirdigi bedel bu surumde yok.
 */

import Gdk from 'gi://Gdk?version=4.0';
import Gtk from 'gi://Gtk?version=4.0';
import LayerShell from 'gi://Gtk4LayerShell?version=1.0';
import cairo from 'gi://cairo';

import {drawLayer, unionBox} from '../src/lib/sprite.js';
import * as Layout from '../src/lib/layout.js';

import {monitorleriOku} from './ekran.js';
import {tamSayilariYaz} from './ayarlar.js';

const LOG = '[claude-pet]';

/** Ilk yerlesimde monitor kenarina birakilan bosluk. */
const MARGIN = 24;

/** Tiklamayi alan katman. Suruklenme ve giris bolgesi buna bakiyor. */
const ANA_KATMAN = 'karakter';

/** `laptop-enabled` ayarinin kapattigi katman. */
const LAPTOP_KATMANI = 'laptop';

/** Suruklenme sayilmaya baslanan mesafe (piksel). Altinda kalan hareket
 *  TIKLAMA sayiliyor: pet yerinden oynamiyor ve ayarlara yazilmiyor. */
const SURUKLEME_ESIGI = 4;

/** Pencerenin arka plani seffaf olmali; GTK teması aksi halde kendi zeminini
 *  basar ve pet'in etrafinda gri bir dikdortgen kalir. */
const CSS = `
window.claude-pet, window.claude-pet > * { background: transparent; }
`;

export class PetPenceresi {
    /**
     * @param {object} o
     * @param {Gtk.Application} o.app
     * @param {object} o.sheet `loadAnimations()` ciktisi
     * @param {Gio.Settings} o.settings
     * @param {Function} o.kareGetir () => o an cizilecek derlenmis kare
     * @param {Function} o.menuDurumu (acik: boolean) => void
     * @param {Gio.Menu} o.menuModeli sag tik menusu
     */
    constructor({app, sheet, settings, kareGetir, menuDurumu, menuModeli}) {
        this._sheet = sheet;
        this._settings = settings;
        this._kareGetir = kareGetir ?? (() => null);
        this._menuDurumu = menuDurumu ?? (() => {});

        this._cell = Math.max(1, settings.get_int('scale'));
        this._laptopAcik = settings.get_boolean('laptop-enabled');
        this._boxes = null;
        this._tuval = null;         // iki katmanin BIRLESIM kutusu (hucre)
        this._originX = 0;          // sprite izgarasinin (0,0) hucresi, global
        this._originY = 0;
        this._monitorIndex = -1;
        this._gorunur = false;
        this._tasindi = false;

        this._win = new Gtk.Window({
            application: app,
            decorated: false,
            resizable: false,
            css_classes: ['claude-pet'],
        });

        const css = new Gtk.CssProvider();
        css.load_from_string(CSS);
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(), css,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

        // ---- layer-shell kurulumu
        LayerShell.init_for_window(this._win);
        LayerShell.set_namespace(this._win, 'claude-pet');
        // OVERLAY: tam ekran pencerelerin de ustunde.
        LayerShell.set_layer(this._win, LayerShell.Layer.OVERLAY);
        // SOL+UST'e capalanip margin ile konumlaniyor. Ayarlar konumu zaten
        // monitore GORELI tutuyordu; model birebir ortusuyor.
        LayerShell.set_anchor(this._win, LayerShell.Edge.LEFT, true);
        LayerShell.set_anchor(this._win, LayerShell.Edge.TOP, true);
        // 0: panel degiliz, pencere yerlesimini bozmuyoruz (`affectsStruts:
        // false`in karsiligi).
        LayerShell.set_exclusive_zone(this._win, 0);
        // Pet ASLA klavye odagi almaz. Menu acilirken gecici olarak
        // ON_DEMAND'a cekiliyor, kapaninca geri veriliyor.
        LayerShell.set_keyboard_mode(this._win, LayerShell.KeyboardMode.NONE);

        // ---- tuval
        this._alan = new Gtk.DrawingArea();
        this._alan.set_draw_func((_alan, cr) => this._ciz(cr));
        this._win.set_child(this._alan);

        this._menuyuKur(menuModeli);
        this._girdiyiKur();

        // Giris bolgesi ancak yuzey var olunca yazilabiliyor.
        this._win.connect('map', () => this._girisBolgesiniYaz());
    }

    // ------------------------------------------------------------------ cizim

    _ciz(cr) {
        try {
            const kare = this._kareGetir();
            // Cizim sirasi: laptop ONCE, karakter SONRA. Icerik cakismiyor
            // (bir hucrede tek karakter var) ama sira eklentideki yigin
            // sirasiyla ayni kalsin.
            if (this._laptopAcik)
                drawLayer(cr, kare?.[LAPTOP_KATMANI], this._sheet.colors,
                    this._cell, this._tuval);
            drawLayer(cr, kare?.[ANA_KATMAN], this._sheet.colors,
                this._cell, this._tuval);
        } catch (error) {
            console.error(`${LOG} cizim: ${error}`);
        } finally {
            // GJS'de Cairo baglami elle birakilmazsa siziyor.
            cr.$dispose();
        }
    }

    /** Kare degisti: yeniden cizdir. BOYUT DEGISMEZ. */
    kareyiTazele() {
        if (this._gorunur)
            this._alan.queue_draw();
    }

    // ---------------------------------------------------------------- geometri

    /** Animasyon degisti: tuvali onun birlesim kutularina gore boyutla.
     *
     * BOYUT KARE BASINA DEGIL ANIMASYON BASINA DEGISIYOR — eklentideki
     * gerekce burada da gecerli: karakterin siki kutusu neredeyse her karede
     * degisiyor (35 karelik `laptop_code`'da 7 ayri kutu), her karede yuzey
     * yeniden boyutlanirsa 15 fps'de gorunur titreme olur.
     */
    kutulariAyarla(boxes) {
        if (this._boxes === boxes)
            return;

        this._boxes = boxes;
        // Tuval IKI katmani da iceriyor; giris bolgesi yalnizca karakteri.
        this._tuval = unionBox([boxes?.[ANA_KATMAN], boxes?.[LAPTOP_KATMANI]]);

        this._alan.set_content_width((this._tuval?.w ?? 1) * this._cell);
        this._alan.set_content_height((this._tuval?.h ?? 1) * this._cell);

        this._girisBolgesiniYaz();
        this._konumuUygula();
    }

    /** Tiklama YALNIZCA karakter dikdortgenine dussun.
     *
     * Bu, eklentinin Wayland'de YAPAMADIGI sey. Orada `affectsInputRegion`
     * atlaniyordu ve gecirgenligi saglayan tek sey laptobun ayri ve
     * `reactive: false` bir actor olmasiydi; laptop ile karakter arasindaki
     * seffaf bosluk yine de tiklama yutuyordu.
     */
    _girisBolgesiniYaz() {
        const yuzey = this._win.get_surface();
        const kutu = this._boxes?.[ANA_KATMAN];
        if (!yuzey || !kutu || !this._tuval)
            return;

        try {
            const bolge = new cairo.Region();
            bolge.unionRectangle(new cairo.RectangleInt({
                x: (kutu.x - this._tuval.x) * this._cell,
                y: (kutu.y - this._tuval.y) * this._cell,
                width: kutu.w * this._cell,
                height: kutu.h * this._cell,
            }));
            yuzey.set_input_region(bolge);
        } catch (error) {
            console.warn(`${LOG} giris bolgesi yazilamadi: ${error}`);
        }
    }

    // ------------------------------------------------------------------ konum

    /** Ayarlardaki kaydi ekrandaki bir yere cevir ve uygula. Idempotent.
     *
     * Aritmetigin tamami `lib/layout.js`'te ve DEGISMEDEN kullaniliyor;
     * buradaki is yalnizca Gdk'den monitor listesini alip sonucu margin
     * olarak yazmak.
     */
    konumuGeriYukle() {
        const monitors = monitorleriOku();
        const cozum = Layout.resolveOrigin({
            monitors,
            primaryIndex: 0,
            box: this._boxes?.[ANA_KATMAN],
            cell: this._cell,
            saved: {
                x: this._settings.get_int('position-x'),
                y: this._settings.get_int('position-y'),
                monitorIndex: this._settings.get_int('monitor-index'),
            },
            margin: MARGIN,
        });

        this._monitorIndex = cozum.monitorIndex;
        this._originX = cozum.x;
        this._originY = cozum.y;
        this._konumuUygula();
    }

    /** Izgara baslangicini layer-shell margin'ine cevir. */
    _konumuUygula() {
        const monitors = monitorleriOku();
        const {monitor} = Layout.pickMonitor(monitors, this._monitorIndex, 0);
        if (monitor?.gdk)
            LayerShell.set_monitor(this._win, monitor.gdk);

        // Yuzeyin sol ust kosesi = izgara baslangici + tuval kutusunun ofseti.
        const sol = this._originX - (monitor?.x ?? 0) + (this._tuval?.x ?? 0) * this._cell;
        const ust = this._originY - (monitor?.y ?? 0) + (this._tuval?.y ?? 0) * this._cell;

        LayerShell.set_margin(this._win, LayerShell.Edge.LEFT, Math.round(sol));
        LayerShell.set_margin(this._win, LayerShell.Edge.TOP, Math.round(ust));
    }

    /** Bulundugu yeri, altindaki monitore GORELI olarak yaz. */
    _konumuKaydet() {
        const monitors = monitorleriOku();
        const box = this._boxes?.[ANA_KATMAN];

        const index = Layout.monitorIndexForOrigin(monitors, box, this._cell,
            this._originX, this._originY, 0);
        const {monitor} = Layout.pickMonitor(monitors, index, 0);

        const [gx, gy] = Layout.clampOrigin(monitor, box, this._cell,
            this._originX, this._originY);
        const [rx, ry] = Layout.kacinKayitsiz(
            ...Layout.toRelative(monitor, gx, gy));

        [this._originX, this._originY] = Layout.fromRelative(monitor, rx, ry);
        this._monitorIndex = index;
        this._konumuUygula();

        tamSayilariYaz({
            'monitor-index': index,
            'position-x': rx,
            'position-y': ry,
        });

        console.log(`${LOG} konum kaydedildi · monitor ${index} · (${rx}, ${ry})`);
    }

    // -------------------------------------------------------------- suruklenme

    _girdiyiKur() {
        // SURUKLEME MODELI: her olayda `origin += ofset`, ofset basma
        // noktasina gore olculuyor ve basma noktasi SABIT.
        //
        // Neden kumulatif degil: yuzey layer-shell margin'iyle taşınıyor, yani
        // pencere imlecin ALTINDAN kayiyor. Kompozitor bunun icin duzeltici
        // bir motion olayi gonderiyor ve o olayda ofset ~0 oluyor. "Yeni konum
        // = basma konumu + ofset" deseydik pet o olayda geri sicrardi ve
        // suruklenme titrerdi. Artimli model kendi kendini duzeltiyor:
        // basildigi anda imlecin altinda kalan nokta imlecin altinda kaliyor.
        const surukle = new Gtk.GestureDrag({button: Gdk.BUTTON_PRIMARY});
        surukle.connect('drag-begin', () => {
            this._tasindi = false;
        });
        surukle.connect('drag-update', (_g, dx, dy) => {
            if (!this._tasindi) {
                if (Math.abs(dx) < SURUKLEME_ESIGI && Math.abs(dy) < SURUKLEME_ESIGI)
                    return;
                this._tasindi = true;
            }
            this._originX = Math.round(this._originX + dx);
            this._originY = Math.round(this._originY + dy);
            this._konumuUygula();
        });
        surukle.connect('drag-end', () => {
            if (!this._tasindi)
                return;
            this._tasindi = false;
            try {
                this._konumuKaydet();
            } catch (error) {
                console.error(`${LOG} surukleme sonu: ${error}`);
            }
        });
        this._alan.add_controller(surukle);

        const sagTik = new Gtk.GestureClick({button: Gdk.BUTTON_SECONDARY});
        sagTik.connect('pressed', (_g, _n, x, y) => this._menuyuAc(x, y));
        this._alan.add_controller(sagTik);
    }

    // ------------------------------------------------------------------- menu

    _menuyuKur(model) {
        this._popover = Gtk.PopoverMenu.new_from_model(model);
        this._popover.set_parent(this._alan);
        this._popover.set_has_arrow(true);
        this._popover.connect('notify::visible', () => {
            const acik = this._popover.visible;
            // Menu ACIKKEN klavye gerekiyor (ok tuslari, Esc); pet'in kendisi
            // asla klavye almiyor. Gecici olarak veriliyor, kapaninca geri
            // aliniyor — boylece pet hicbir zaman odak calmiyor.
            LayerShell.set_keyboard_mode(this._win, acik
                ? LayerShell.KeyboardMode.ON_DEMAND
                : LayerShell.KeyboardMode.NONE);
            this._menuDurumu(acik);
        });
    }

    _menuyuAc(x, y) {
        this._popover.set_pointing_to(new Gdk.Rectangle({
            x: Math.round(x), y: Math.round(y), width: 1, height: 1,
        }));
        this._popover.popup();
    }

    // ------------------------------------------------------------- gorunurluk

    /** Pet ekranda olsun mu. Gizlenince yuzey unmap ediliyor — layer-shell'de
     *  bu, kompozitor tarafinda pet'in gercekten YOK olmasi demek. */
    gorunurluk(goster) {
        if (this._gorunur === goster)
            return;
        this._gorunur = goster;
        this._win.set_visible(goster);
        if (goster) {
            this._girisBolgesiniYaz();
            this._alan.queue_draw();
        }
    }

    // ----------------------------------------------------------------- ayarlar

    olcekDegisti() {
        const cell = Math.max(1, this._settings.get_int('scale'));
        if (cell === this._cell)
            return;

        this._cell = cell;
        this._alan.set_content_width((this._tuval?.w ?? 1) * cell);
        this._alan.set_content_height((this._tuval?.h ?? 1) * cell);
        this._girisBolgesiniYaz();
        // Buyuyen karakter ekran disina tasabilir; kayitli konum yeni boyuta
        // gore yeniden sikistiriliyor.
        this.konumuGeriYukle();
        this._alan.queue_draw();
    }

    laptopDegisti() {
        this._laptopAcik = this._settings.get_boolean('laptop-enabled');
        this._alan.queue_draw();
    }

    monitorlerDegisti() {
        // Ayar YENIDEN YAZILMIYOR: kayitli monitor gecici olarak
        // cikarilmissa tercih korunuyor, geri takilinca pet oraya donuyor.
        this.konumuGeriYukle();
    }

    yikil() {
        this._popover?.unparent();
        this._popover = null;
        this._win?.destroy();
        this._win = null;
    }
}
