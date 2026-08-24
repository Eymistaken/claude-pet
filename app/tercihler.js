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
    const etiketler = ['Birincil monitör'];
    try {
        const monitors = Gdk.Display.get_default()?.get_monitors();
        const n = monitors?.get_n_items() ?? 0;
        for (let i = 0; i < n; i++) {
            const m = monitors.get_item(i);
            const ad = m?.connector ?? m?.model ?? '';
            etiketler.push(ad ? `Monitör ${i + 1} — ${ad}` : `Monitör ${i + 1}`);
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
            subtitle: 'Kapatılınca maskot hiç görünmez — Claude çalışıyor olsa ' +
                'bile. Süreç yoklaması da durur.',
        });
        this._settings.bind('enabled', acik, 'active', Gio.SettingsBindFlags.DEFAULT);
        grup.add(acik);
        return grup;
    }

    _gorunumGrubu() {
        const grup = new Adw.PreferencesGroup({
            title: 'Görünüm',
            description: 'Maskotun ekranda nasıl göründüğü.',
        });

        const boyut = new Adw.SpinRow({
            title: 'Boyut',
            subtitle: 'Bir sprite hücresinin piksel kenarı. Tam sayı, yani ' +
                'büyütmek bulanıklaştırmıyor.',
            adjustment: new Gtk.Adjustment({
                lower: 1, upper: 8, step_increment: 1, page_increment: 1,
            }),
        });
        this._settings.bind('scale', boyut, 'value', Gio.SettingsBindFlags.DEFAULT);
        grup.add(boyut);

        const laptop = new Adw.SwitchRow({
            title: 'Laptop',
            subtitle: 'Kod yazarken çıkan laptop çizilsin mi.',
        });
        this._settings.bind('laptop-enabled', laptop, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        grup.add(laptop);

        return grup;
    }

    _davranisGrubu() {
        const grup = new Adw.PreferencesGroup({
            title: 'Davranış',
            description: 'Pet neye, ne zaman tepki versin.',
        });

        const uyku = new Adw.SpinRow({
            title: 'Boşta kalma süresi',
            subtitle: 'Saniye. Bu kadar süre hiçbir şey olmazsa pet çalışmayı ' +
                'bırakmış sayılır. 0: kapalı.',
            adjustment: new Gtk.Adjustment({
                lower: 0, upper: 3600, step_increment: 30, page_increment: 60,
            }),
        });
        this._settings.bind('sleep-timeout', uyku, 'value',
            Gio.SettingsBindFlags.DEFAULT);
        grup.add(uyku);

        const bildirim = new Adw.SwitchRow({
            title: 'Girdi beklerken bildirim',
            subtitle: 'Claude Code soru sorduğunda ya da izin istediğinde ' +
                'masaüstü bildirimi gönder.',
        });
        this._settings.bind('attention-notify', bildirim, 'active',
            Gio.SettingsBindFlags.DEFAULT);
        grup.add(bildirim);

        return grup;
    }

    _konumGrubu() {
        const grup = new Adw.PreferencesGroup({
            title: 'Konum',
            description: 'Pet sürüklenerek taşınır; buradaki ayarlar onu ' +
                'nereye koyacağını söyler.',
        });

        const etiketler = monitorEtiketleri();
        const monitor = new Adw.ComboRow({
            title: 'Monitör',
            subtitle: 'Pet bu monitörde durur. Monitör çıkarılırsa birincile ' +
                'düşer, geri takılınca geri döner.',
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

        const satir = new Adw.ActionRow({title: 'Konumu sıfırla'});
        const dugme = new Gtk.Button({label: 'Sıfırla', valign: Gtk.Align.CENTER});
        satir.add_suffix(dugme);
        satir.activatable_widget = dugme;

        const kayitYaz = () => {
            const x = this._settings.get_int('position-x');
            const y = this._settings.get_int('position-y');
            satir.subtitle = x === -1 && y === -1
                ? 'Kayıtlı konum yok — pet sağ altta duruyor.'
                : `Kayıtlı: monitörün sol üstünden (${x}, ${y}) piksel.`;
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
            title: 'Sistem',
            description: `Ayarlar: ${ayarDosyasi()}`,
        });

        const autostart = new Adw.SwitchRow({
            title: 'Sistemle birlikte başlat',
            subtitle: 'Oturum açılınca pet arka planda hazır olsun.',
            active: Entegrasyon.autostartAcikMi(),
        });
        this._bagla(autostart, 'notify::active',
            () => Entegrasyon.autostartYaz(autostart.active));
        grup.add(autostart);

        const menu = new Adw.SwitchRow({
            title: 'Uygulama menüsünde göster',
            subtitle: 'Menüye bir girdi ve simge ekler; bildirimlerin simgesi ' +
                'de buradan geliyor.',
            active: Entegrasyon.masaustuGirdisiVarMi(),
        });
        this._bagla(menu, 'notify::active',
            () => Entegrasyon.masaustuGirdisiYaz(menu.active, this._ikon));
        grup.add(menu);

        // Hook'lar olmadan pet hicbir sey duymaz: durum bilgisinin TEK kaynagi
        // Claude Code'un hook'lari.
        const hook = new Adw.ActionRow({
            title: 'Claude Code hook’ları',
            subtitle: 'Durum bilgisi buradan geliyor. ~/.claude/settings.json',
        });
        const hookDugme = new Gtk.Button({valign: Gtk.Align.CENTER});
        hook.add_suffix(hookDugme);

        const hookTazele = () => {
            const n = Entegrasyon.hookSayisi();
            if (n > 0) {
                hook.subtitle = `${n} girdi kurulu · ~/.claude/settings.json`;
                hookDugme.label = 'Kaldır';
            } else {
                hook.subtitle = 'Kurulu değil — pet Claude’un ne yaptığını ' +
                    'duyamaz. ~/.claude/settings.json';
                hookDugme.label = 'Kur';
            }
        };
        hookTazele();
        this._bagla(hookDugme, 'clicked', () => {
            if (hookDugme.label === 'Kur')
                Entegrasyon.hooklariKur();
            else
                Entegrasyon.hooklariKaldir();
            hookTazele();
        });
        grup.add(hook);

        return grup;
    }
});
