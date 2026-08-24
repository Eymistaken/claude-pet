/* Ayarlar penceresi.
 *
 * BU DOSYA KABUĞUN İÇİNDE ÇALIŞMIYOR. `gnome-extensions prefs` ayrı bir
 * process açıyor: burada GTK4 + libadwaita var, `St`/`Main`/`global` YOK.
 * İki taraf yalnızca GSettings üzerinden konuşuyor — bu dosya bir değer
 * yazıyor, eklenti `changed::` ile duyup canlı uyguluyor. Yani burada
 * "uygula" düğmesi de yok, olmamalı.
 *
 * `settings.bind` kullanılabilen her yerde kullanılıyor: iki yönlü bağ,
 * elle senkron tutulacak bir şey kalmıyor. Tek istisna monitör listesi —
 * `Adw.ComboRow.selected` bir sıra numarası (0'dan başlar), ayar ise -1'i
 * "birincil monitör" diye kullanıyor; arada bir kaydırma var.
 */

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

/** Monitör listesi. GTK tarafında Gdk'den okunuyor; kabuğun kendi listesi
 *  buradan görünmüyor.
 *
 * SIRALAMA UYARISI: ayar, kabuğun monitör listesindeki SIRA numarasını
 * saklıyor. Gdk ile Mutter aynı sırayı veriyor (ikisi de aynı monitör
 * yapılandırmasından besleniyor) ama garanti değil; o yüzden etikette
 * bağlantı adı da yazıyor ve yanlış seçim yapılsa bile eklenti pet'i
 * ekran içinde tutuyor.
 */
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
        logError(error, 'claude-pet: monitör listesi okunamadı');
    }

    return etiketler;
}

export default class ClaudePetPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        // GJS tuzağı: pencereye bağlanmazsa `settings` çöp toplanabilir ve
        // bağlar sessizce kopar.
        window._settings = settings;

        const baglar = [];
        const bagla = (nesne, sinyal, fn) => baglar.push([nesne, nesne.connect(sinyal, fn)]);

        const page = new Adw.PreferencesPage({
            title: 'claude-pet',
            icon_name: 'face-smile-symbolic',
        });

        // -------------------------------------------------------------- genel

        // EN ÜSTTE ve kendi grubunda: bu anahtar ötekilerle aynı sırada
        // değil, ötekilerin ÜSTÜNDE. Kapalıyken aşağıdakilerin hiçbirinin
        // gözle görülür bir etkisi yok.
        const genel = new Adw.PreferencesGroup();

        const acik = new Adw.SwitchRow({
            title: 'Pet',
            subtitle: 'Turned off, the mascot never appears — even while Claude ' +
                'is running. Turn it back on here; there is no pet on screen to click.',
        });
        settings.bind('enabled', acik, 'active', Gio.SettingsBindFlags.DEFAULT);
        genel.add(acik);

        page.add(genel);

        // ------------------------------------------------------------ görünüm

        const gorunum = new Adw.PreferencesGroup({
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
        settings.bind('scale', boyut, 'value', Gio.SettingsBindFlags.DEFAULT);
        gorunum.add(boyut);

        const laptop = new Adw.SwitchRow({
            title: 'Laptop',
            subtitle: 'Whether to draw the laptop that comes out while typing.',
        });
        settings.bind('laptop-enabled', laptop, 'active', Gio.SettingsBindFlags.DEFAULT);
        gorunum.add(laptop);

        page.add(gorunum);

        // ----------------------------------------------------------- davranış

        const davranis = new Adw.PreferencesGroup({
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
        settings.bind('sleep-timeout', uyku, 'value', Gio.SettingsBindFlags.DEFAULT);
        davranis.add(uyku);

        const bildirim = new Adw.SwitchRow({
            title: 'Notify while waiting for input',
            subtitle: 'Send a desktop notification when Claude Code asks a ' +
                'question or requests permission.',
        });
        settings.bind('attention-notify', bildirim, 'active', Gio.SettingsBindFlags.DEFAULT);
        davranis.add(bildirim);

        page.add(davranis);

        // -------------------------------------------------------------- konum

        const konum = new Adw.PreferencesGroup({
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

        // Ayar -1'i "birincil" diye kullanıyor, ComboRow ise 0'dan sayıyor.
        const monitorYaz = () => {
            const secili = monitor.selected;
            const deger = secili === 0 ? -1 : secili - 1;
            if (settings.get_int('monitor-index') !== deger)
                settings.set_int('monitor-index', deger);
        };
        const monitorOku = () => {
            const deger = settings.get_int('monitor-index');
            const secili = deger < 0 || deger + 1 >= etiketler.length ? 0 : deger + 1;
            if (monitor.selected !== secili)
                monitor.selected = secili;
        };
        monitorOku();
        bagla(monitor, 'notify::selected', monitorYaz);
        bagla(settings, 'changed::monitor-index', monitorOku);
        konum.add(monitor);

        const sifirlaSatiri = new Adw.ActionRow({title: 'Reset position'});
        const sifirla = new Gtk.Button({
            label: 'Reset',
            valign: Gtk.Align.CENTER,
        });
        sifirlaSatiri.add_suffix(sifirla);
        sifirlaSatiri.activatable_widget = sifirla;

        // Alt yazı kayıtlı değeri gösteriyor: pet'in nereye kaydedildiği
        // (ve sıfırlamanın gerçekten çalıştığı) buradan görülüyor.
        const kayitYaz = () => {
            const x = settings.get_int('position-x');
            const y = settings.get_int('position-y');
            sifirlaSatiri.subtitle = x === -1 && y === -1
                ? 'No saved position — the pet sits in the bottom right.'
                : `Saved: (${x}, ${y}) pixels from the monitor's top left.`;
        };
        kayitYaz();
        bagla(settings, 'changed::position-x', kayitYaz);
        bagla(settings, 'changed::position-y', kayitYaz);

        bagla(sifirla, 'clicked', () => {
            // İKİSİ TEK YAZMADA. `changed` sinyali yazan process'e eşzamanlı
            // geliyor; ayrı ayrı yazılırsa eklenti bir an için "x kayıtsız,
            // y kayıtlı" görür ve pet yanlış yere sıçrar.
            //
            // Yazma AYRI, tek kullanımlık bir nesneden geçiyor: `delay()`
            // kalıcı: `g_settings_apply()` nesneyi anında yazan moda geri
            // DÖNDÜRMÜYOR ve `undelay` diye bir şey yok. Bağların (`bind`)
            // durduğu nesneyi gecikmeli moda sokmak, bu düğmeye basıldıktan
            // sonra penceredeki HİÇBİR ayarın dconf'a ulaşmaması demek —
            // ölçüldü, boyut değiştirildi ve pet büyümedi.
            const yazici = this.getSettings();
            yazici.delay();
            yazici.set_int('position-x', -1);
            yazici.set_int('position-y', -1);
            yazici.apply();
        });

        konum.add(sifirlaSatiri);
        page.add(konum);

        window.add(page);

        // Pencere kapanınca elle kurulan bağlar da gitsin. `settings.bind`
        // kendi kendini söküyor, bunlar sökmüyor.
        window.connect('close-request', () => {
            for (const [nesne, id] of baglar)
                nesne.disconnect(id);
            baglar.length = 0;
            return false;
        });
    }
}
