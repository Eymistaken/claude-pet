/* Ayarlar penceresi.
 *
 * `src/prefs.js`ten uyarlandi. GORUNUM VE BAGLAMA MANTIGI AYNI: `settings.bind`
 * kullanilabilen her yerde kullaniliyor, "uygula" dugmesi yok, degisiklikler
 * `changed::` uzerinden aninda uygulaniyor.
 *
 * EKLENTIDEN IKI FARK:
 *
 * 1. Ayni SUREC. Eklentide bu pencere `gnome-extensions prefs` ile ayri bir
 *    process olarak aciliyordu ve iki taraf yalnizca GSettings uzerinden
 *    konusuyordu. Burada pet ile ayni uygulamanin icinde; yine de tek yol
 *    GSettings, cunku o zaten calisan ve sinanmis mekanizma.
 * 2. "Sistem" grubu YENI. Eklentide bunlarin karsiligi `make hooks` ve
 *    gnome-shell'in kendi eklenti yonetimiydi; AppImage'da make yok, o yuzden
 *    hook kurulumu ve otomatik baslatma buradan yonetiliyor.
 */

import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';

import {ayarlar, ayarDosyasi, tamSayilariYaz} from './ayarlar.js';
import * as Entegrasyon from './entegrasyon.js';

/** Monitor listesi. Ayar, listedeki SIRA numarasini sakliyor; etikette
 *  baglanti adi da yaziyor ki yanlis secim goze carpsin. */
function monitorEtiketleri() {
    const etiketler = ['Primary monitor'];
    try {
        const monitors = Gdk.Display.get_default()?.get_monitors();
        const n = monitors?.get_n_items() ?? 0;
        for (let i = 0; i < n; i++) {
            const m = monitors.get_item(i);
            const ad = m?.connector ?? m?.model ?? '';
            etiketler.push(ad ? `Monitor ${i + 1} — ${ad}` : `Monitor ${i + 1}`);
        }
    } catch (error) {
        console.warn(`claude-pet: monitör listesi okunamadı: ${error}`);
    }
    return etiketler;
}

export const TercihlerPenceresi = GObject.registerClass(
class TercihlerPenceresi extends Adw.PreferencesWindow {
    _init({app, settings, ikon}) {
        super._init({
            application: app,
            title: 'Claude Pet',
            default_width: 560,
            default_height: 700,
            hide_on_close: false,
        });

        this._settings = settings;
        this._ikon = ikon;
        this._baglar = [];

        const sayfa = new Adw.PreferencesPage({title: 'claude-pet'});
        sayfa.add(this._genelGrubu());
        sayfa.add(this._gorunumGrubu());
        sayfa.add(this._davranisGrubu());
        sayfa.add(this._konumGrubu());
        sayfa.add(this._sistemGrubu());
        this.add(sayfa);

        // `settings.bind` kendi kendini sokuyor; elle kurulanlar sokmuyor.
        this.connect('close-request', () => {
            for (const [nesne, id] of this._baglar)
                nesne.disconnect(id);
            this._baglar.length = 0;
            return false;
        });
    }

    _bagla(nesne, sinyal, fn) {
        this._baglar.push([nesne, nesne.connect(sinyal, fn)]);
    }

    // EN USTTE ve kendi grubunda: bu anahtar otekilerle ayni sirada degil,
    // otekilerin USTUNDE. Kapaliyken asagidakilerin hicbirinin etkisi yok.
    _genelGrubu() {
        const grup = new Adw.PreferencesGroup();
        const acik = new Adw.SwitchRow({
            title: 'Pet',
            subtitle: 'Turned off, the mascot never appears — even while Claude ' +
                'is running. Process polling stops too.',
        });
        this._settings.bind('enabled', acik, 'active', Gio.SettingsBindFlags.DEFAULT);
        grup.add(acik);
        return grup;
    }

    _gorunumGrubu() {
        const grup = new Adw.PreferencesGroup({
            title: 'Appearance',
            description: 'How the mascot looks on screen.',
        });

        const boyut = new Adw.SpinRow({
            title: 'Size',
            subtitle: 'Pixel edge of one sprite cell. An integer, so scaling ' +
                'up does not blur.',
            adjustment: new Gtk.Adjustment({
                lower: 1, upper: 8, step_increment: 1, page_increment: 1,
            }),
        });
        this._settings.bind('scale', boyut, 'value', Gio.SettingsBindFlags.DEFAULT);
        grup.add(boyut);

        const laptop = new Adw.SwitchRow({
            title: 'Laptop',
            subtitle: 'Whether to draw the laptop that comes out while typing.',
        });
        this._settings.bind('laptop-enabled', laptop, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        grup.add(laptop);

        return grup;
    }

    _davranisGrubu() {
        const grup = new Adw.PreferencesGroup({
            title: 'Behaviour',
            description: 'What the pet reacts to, and when.',
        });

        const uyku = new Adw.SpinRow({
            title: 'Idle timeout',
            subtitle: 'Seconds. If nothing happens for this long, the pet ' +
                'stops counting as working. 0: off.',
            adjustment: new Gtk.Adjustment({
                lower: 0, upper: 3600, step_increment: 30, page_increment: 60,
            }),
        });
        this._settings.bind('sleep-timeout', uyku, 'value',
            Gio.SettingsBindFlags.DEFAULT);
        grup.add(uyku);

        const bildirim = new Adw.SwitchRow({
            title: 'Notify while waiting for input',
            subtitle: 'Send a desktop notification when Claude Code asks a ' +
                'question or requests permission.',
        });
        this._settings.bind('attention-notify', bildirim, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        grup.add(bildirim);

        return grup;
    }

    _konumGrubu() {
        const grup = new Adw.PreferencesGroup({
            title: 'Position',
            description: 'The pet is moved by dragging; these settings say ' +
                'where to put it.',
        });

        const etiketler = monitorEtiketleri();
        const monitor = new Adw.ComboRow({
            title: 'Monitor',
            subtitle: 'The pet sits on this monitor. Falls back to the primary ' +
                'if it is unplugged, and returns when it comes back.',
            model: new Gtk.StringList({strings: etiketler}),
        });

        // Ayar -1'i "birincil" diye kullaniyor, ComboRow ise 0'dan sayiyor.
        const monitorYaz = () => {
            const deger = monitor.selected === 0 ? -1 : monitor.selected - 1;
            if (this._settings.get_int('monitor-index') !== deger)
                this._settings.set_int('monitor-index', deger);
        };
        const monitorOku = () => {
            const deger = this._settings.get_int('monitor-index');
            const secili = deger < 0 || deger + 1 >= etiketler.length ? 0 : deger + 1;
            if (monitor.selected !== secili)
                monitor.selected = secili;
        };
        monitorOku();
        this._bagla(monitor, 'notify::selected', monitorYaz);
        this._bagla(this._settings, 'changed::monitor-index', monitorOku);
        grup.add(monitor);

        const satir = new Adw.ActionRow({title: 'Reset position'});
        const dugme = new Gtk.Button({label: 'Reset', valign: Gtk.Align.CENTER});
        satir.add_suffix(dugme);
        satir.activatable_widget = dugme;

        const kayitYaz = () => {
            const x = this._settings.get_int('position-x');
            const y = this._settings.get_int('position-y');
            satir.subtitle = x === -1 && y === -1
                ? 'No saved position — the pet sits in the bottom right.'
                : `Saved: (${x}, ${y}) pixels from the monitor's top left.`;
        };
        kayitYaz();
        this._bagla(this._settings, 'changed::position-x', kayitYaz);
        this._bagla(this._settings, 'changed::position-y', kayitYaz);
        // IKISI TEK YAZMADA: ayri ayri yazilirsa pet bir an "x kayitsiz, y
        // kayitli" gorur ve yanlis yere sicrar.
        this._bagla(dugme, 'clicked', () =>
            tamSayilariYaz({'position-x': -1, 'position-y': -1}));

        grup.add(satir);
        return grup;
    }

    // Eklentide bu grubun karsiligi `make hooks` ve gnome-shell'in eklenti
    // yonetimiydi. AppImage'da make yok.
    _sistemGrubu() {
        const grup = new Adw.PreferencesGroup({
            title: 'System',
            description: `Settings file: ${ayarDosyasi()}`,
        });

        const autostart = new Adw.SwitchRow({
            title: 'Start with the system',
            subtitle: 'Have the pet ready in the background when you log in.',
            active: Entegrasyon.autostartAcikMi(),
        });
        this._bagla(autostart, 'notify::active',
            () => Entegrasyon.autostartYaz(autostart.active));
        grup.add(autostart);

        const menu = new Adw.SwitchRow({
            title: 'Show in the application menu',
            subtitle: 'Adds a menu entry and an icon; the notification icon ' +
                'comes from here too.',
            active: Entegrasyon.masaustuGirdisiVarMi(),
        });
        this._bagla(menu, 'notify::active',
            () => Entegrasyon.masaustuGirdisiYaz(menu.active, this._ikon));
        grup.add(menu);

        // Hook'lar olmadan pet hicbir sey duymaz: durum bilgisinin TEK kaynagi
        // Claude Code'un hook'lari.
        const hook = new Adw.ActionRow({
            title: 'Claude Code hooks',
            subtitle: 'This is where the state comes from. ~/.claude/settings.json',
        });
        const hookDugme = new Gtk.Button({valign: Gtk.Align.CENTER});
        hook.add_suffix(hookDugme);

        const hookTazele = () => {
            const n = Entegrasyon.hookSayisi();
            if (n > 0) {
                hook.subtitle = `${n} entries installed · ~/.claude/settings.json`;
                hookDugme.label = 'Remove';
            } else {
                hook.subtitle = 'Not installed — the pet cannot hear what ' +
                    'Claude is doing. ~/.claude/settings.json';
                hookDugme.label = 'Install';
            }
        };
        hookTazele();
        this._bagla(hookDugme, 'clicked', () => {
            if (hookDugme.label === 'Install')
                Entegrasyon.hooklariKur();
            else
                Entegrasyon.hooklariKaldir();
            hookTazele();
        });
        grup.add(hook);

        return grup;
    }
});
