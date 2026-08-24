#!/usr/bin/env -S gjs -m
/* claude-pet — bagimsiz uygulama (KDE / AppImage surumu).
 *
 * EKLENTIYLE AYNI ZINCIR, FARKLI SON HALKA:
 *
 *     tracker (ne oluyor) -> director (ne oynayacak) -> player (ne zaman)
 *                                                    -> sprite (nasil)
 *
 * Bu dosya yalnizca zinciri kuruyor ve GTK tarafina bagliyor. Dort halkanin
 * DORDU DE `src/lib/` altindaki AYNI dosyalar — kopya degil, ayni dosya.
 * "Ayni mantik" iddiasinin dayanagi bu; `tests/` altindaki dort test de o
 * dosyalari sinadigi icin bu surum icin de gecerli.
 *
 * TEK ORNEK. `--daemon` ile acilirsa pencere gostermeden yalnizca pet'i kurar
 * (otomatik baslatma bunu kullaniyor). Argumansiz acilirsa — ki AppImage'a
 * cift tiklamak budur — CALISAN ornege D-Bus uzerinden gidiyor ve AYARLAR
 * penceresini actiriyor. Ikinci bir pet acilmiyor.
 */

import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import LayerShell from 'gi://Gtk4LayerShell?version=1.0';
import System from 'system';

import {loadAnimations} from '../src/lib/animations.js';
import {Player} from '../src/lib/player.js';
import {Director} from '../src/lib/director.js';
import {Tracker} from '../src/lib/tracker.js';
import {Presence} from '../src/lib/presence.js';

import {ayarlariKur, ayarlar, tamSayilariYaz} from './ayarlar.js';
import {PetPenceresi} from './pencere.js';
import {TercihlerPenceresi} from './tercihler.js';
import * as Entegrasyon from './entegrasyon.js';

const LOG = '[claude-pet]';
const APP_ID = 'io.github.eymistaken.ClaudePet';

/** Bu betigin bulundugu dizin; butun varlik yollari ondan tureniyor.
 *  Depoda da AppDir icinde de agac ayni: <kok>/app, <kok>/src, <kok>/assets. */
function buradaki() {
    const [dosya] = GLib.filename_from_uri(import.meta.url);
    return GLib.path_get_dirname(dosya);
}

const APP_DIR = buradaki();
const KOK = GLib.path_get_dirname(APP_DIR);
const VARLIK = GLib.build_filenamev([KOK, 'assets', 'animations.json']);
const SEMA_DIZINI = GLib.build_filenamev([APP_DIR, 'data']);
const HOOK_KAYNAGI = GLib.build_filenamev([KOK, 'hooks', 'claude-pet-hook.py']);
const IKON = GLib.build_filenamev([APP_DIR, 'data', 'claude-pet.png']);

const Uygulama = GObject.registerClass(
class Uygulama extends Adw.Application {
    _init() {
        super._init({
            application_id: APP_ID,
            flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE,
        });

        this._pet = null;
        this._tercihler = null;
    }

    vfunc_startup() {
        super.vfunc_startup();

        // GNOME-Wayland burada duruyor: Mutter layer-shell konusmuyor ve
        // pencere ekranin ustune cakilamiyor. O masaustunun cozumu bu depodaki
        // GNOME Shell eklentisi.
        if (!LayerShell.is_supported()) {
            printerr('claude-pet: bu kompozitor wlr-layer-shell protokolunu ' +
                'desteklemiyor.\n' +
                '  KDE Plasma (Wayland), Sway, Hyprland ve COSMIC destekliyor.\n' +
                '  GNOME kullaniyorsan bu depodaki GNOME Shell eklentisini kur:\n' +
                '  https://github.com/Eymistaken/claude-pet');
            System.exit(2);
        }

        ayarlariKur(SEMA_DIZINI);
        this._eylemleriKur();
    }

    /** Hem `--daemon` hem cift tiklama buradan geciyor. */
    vfunc_command_line(cl) {
        const daemon = cl.get_arguments().includes('--daemon');
        this._petiBaslat();
        if (!daemon)
            this._tercihleriAc();
        return 0;
    }

    vfunc_activate() {
        this._petiBaslat();
        this._tercihleriAc();
    }

    // ----------------------------------------------------------------- kurulum

    _petiBaslat() {
        if (this._pet)
            return;

        // Pencere olmadan da ayakta kalsin: pet gizliyken bile surec yasamali.
        this.hold();

        this._settings = ayarlar();
        this._sheet = loadAnimations(VARLIK);
        if (!this._sheet.ok)
            console.warn(`${LOG} varlik okunamadi: ${VARLIK}`);

        this._enabled = this._settings.get_boolean('enabled');
        this._paused = this._settings.get_boolean('paused');
        this._present = false;

        this._menuModeli = new Gio.Menu();
        this._menuyuTazele();

        this._pet = new PetPenceresi({
            app: this,
            sheet: this._sheet,
            settings: this._settings,
            kareGetir: () => this._player?.currentFrame() ?? null,
            menuDurumu: acik => this._menuDurumu(acik),
            menuModeli: this._menuModeli,
        });

        // VARLIK KONTROLU PENCEREDEN HEMEN SONRA, animasyondan ONCE: `start()`
        // ilk cevabi hemen veriyor, yani Claude kapaliyken pet tek kare bile
        // gorunmuyor.
        this._presence = new Presence();
        this._presence.connect('changed', (_p, varMi, ad) => {
            this._present = varMi;
            this._gorunurluguUygula();
            console.log(`${LOG} pet ${this._gosterilsin
                ? `gorunur (${ad})` : 'gizlendi · claude kapali'}`);
        });
        this._present = this._enabled ? this._presence.start() : false;

        this._player = new Player(this._sheet.animations,
            () => this._pet.kareyiTazele(),
            ad => this._director?.onCycle(ad));

        this._director = new Director({
            animations: this._sheet.animations,
            play: (ad, secenekler) => this._klipOynat(ad, secenekler),
            isRunning: () => this._player?.running ?? false,
            sleepTimeoutMs: this._uykuMs(),
        });
        if (this._paused)
            this._director.setPaused(true);
        if (!this._gosterilsin)
            this._director.setAbsent(true);
        this._director.start();

        // Konum animasyondan SONRA: varsayilan yerlesim karakter kutusunun
        // boyutunu biliyor olmali.
        this._pet.konumuGeriYukle();

        this._tracker = new Tracker({sleepTimeoutMs: this._uykuMs()});
        this._tracker.connect('changed', (_t, durum, rateLimited) => {
            console.log(`${LOG} durum: ${durum}${rateLimited ? ' · rate limit' : ''}`);
            // Olay geldiyse bir Claude sureci var demektir; yoklamayi bekleme.
            this._presence?.poke();
            this._director?.setState(durum, rateLimited);
            if (durum === 'WAITING')
                this._dikkatBildirimi();
        });
        this._tracker.start();

        this._ayarlariIzle();
        this._monitorleriIzle();
        this._gorunurluguUygula();
        this._ilkCalisma();

        console.log(`${LOG} etkin · ${this._enabled ? '' : 'PET KAPALI (ayar) · '}` +
            `claude ${this._present ? 'acik' : 'KAPALI (pet gizli)'} · ` +
            `${Object.keys(this._sheet.animations).length} animasyon` +
            `${this._paused ? ' · DURAKLATILMIS' : ''}`);
    }

    /** Ilk acilista pet'in CALISMASI icin gereken iki sey kuruluyor: hook'lar
     *  (durum nereden gelecek) ve otomatik baslatma (istenen davranis).
     *  Ikisi de ayarlar penceresinden geri alinabiliyor. */
    _ilkCalisma() {
        // Her acilista tazeleniyor: yeni AppImage surumu yeni betigi getirsin.
        Entegrasyon.hookuKopyala(HOOK_KAYNAGI);
        if (!Entegrasyon.ilkCalismaMi())
            return;

        console.log(`${LOG} ilk calisma: hook'lar ve otomatik baslatma kuruluyor`);
        Entegrasyon.hooklariKur();
        Entegrasyon.autostartYaz(true);
        Entegrasyon.masaustuGirdisiYaz(true, IKON);
        Entegrasyon.ilkCalismayiIsaretle();
    }

    // -------------------------------------------------------------------- menu

    _eylemleriKur() {
        const ekle = (ad, fn) => {
            const eylem = new Gio.SimpleAction({name: ad});
            eylem.connect('activate', fn);
            this.add_action(eylem);
        };

        ekle('duraklat', () =>
            this._settings.set_boolean('paused', !this._paused));
        ekle('ayarlar', () => this._tercihleriAc());
        // Konumu unut: pet bulundugu monitorun sag altina doner. Monitor
        // tercihi korunuyor -- burada sifirlanan sey KONUM.
        ekle('konum-sifirla', () =>
            tamSayilariYaz({'position-x': -1, 'position-y': -1}));
        ekle('cik', () => this.quit());
    }

    /** Menu etiketi `paused`in saf bir fonksiyonu; degisince yeniden kuruluyor.
     *  GMenuModel canli, yani acik bir menu de guncelleniyor. */
    _menuyuTazele() {
        this._menuModeli.remove_all();
        this._menuModeli.append(this._paused ? 'Devam et' : 'Duraklat', 'app.duraklat');
        this._menuModeli.append('Ayarlar', 'app.ayarlar');
        this._menuModeli.append('Konumu sıfırla', 'app.konum-sifirla');
        this._menuModeli.append('Çık', 'app.cik');
    }

    /** Menu acikken animasyon DURUYOR (kare donuyor, zamanlayici yok).
     *  `stop()` degil `freeze()`: menu kapaninca klip bastan degil kaldigi
     *  kareden suruyor. */
    _menuDurumu(acik) {
        if (acik) {
            this._player?.freeze();
            this._director?.setMenuOpen(true);
        } else {
            this._player?.thaw();
            this._director?.setMenuOpen(false);
        }
    }

    // ----------------------------------------------------------------- ayarlar

    _uykuMs() {
        return Math.max(0, this._settings.get_int('sleep-timeout')) * 1000;
    }

    _ayarlariIzle() {
        const izle = (anahtar, fn) =>
            this._settings.connect(`changed::${anahtar}`, fn);

        izle('enabled', () => {
            this._enabled = this._settings.get_boolean('enabled');
            // Kapaliyken surec yoklamasi da duruyor: kapali bir pet hicbir sey
            // tuketmesin. Acilinca `start()` ilk cevabi hemen veriyor.
            if (this._enabled)
                this._present = this._presence?.start() ?? false;
            else
                this._presence?.stop();
            this._gorunurluguUygula();
            console.log(`${LOG} pet ${this._enabled ? 'acik' : 'kapali'} (ayar)`);
        });

        izle('scale', () => this._pet.olcekDegisti());
        izle('laptop-enabled', () => this._pet.laptopDegisti());

        izle('paused', () => {
            this._paused = this._settings.get_boolean('paused');
            this._menuyuTazele();
            this._director?.setPaused(this._paused);
        });

        // Tek anahtar iki yeri besliyor: "calisiyor" saymayi biraktigi sure
        // (tracker) ve bosta uyku klibine gecme suresi (yonetmen).
        izle('sleep-timeout', () => {
            const ms = this._uykuMs();
            this._director?.setSleepTimeout(ms);
            this._tracker?.setSleepTimeout(ms);
        });

        // Konum anahtarlari tercihlerden de degisebiliyor. `konumuGeriYukle`
        // idempotent -- kendi yazdigimiz deger geri okundugunda pet oynamiyor.
        for (const anahtar of ['position-x', 'position-y', 'monitor-index'])
            izle(anahtar, () => this._pet.konumuGeriYukle());
    }

    _monitorleriIzle() {
        Gdk.Display.get_default()?.get_monitors()
            ?.connect('items-changed', () => this._pet.monitorlerDegisti());
    }

    // -------------------------------------------------------------- gorunurluk

    /** Pet ekranda olacak mi: genel anahtar acik VE Claude calisiyor. */
    get _gosterilsin() {
        return this._enabled && this._present;
    }

    /** Gorunurlugun TEK uygulama noktasi: iki sebep de (ayar, Claude) buradan
     *  geciyor, yani ikisi birbirini ezmiyor. */
    _gorunurluguUygula() {
        const goster = this._gosterilsin;
        this._director?.setAbsent(!goster);
        this._pet?.gorunurluk(goster);
    }

    _klipOynat(name, options) {
        const anim = this._sheet.animations[name];
        if (!anim)
            return false;
        // Kutular oynatmadan ONCE: `play()` ilk kareyi hemen bildiriyor.
        this._pet.kutulariAyarla(anim.boxes);
        return this._player.play(name, options);
    }

    /** Claude Code girdi bekliyor: pet gorunmuyor olabilir, bildirim gonder. */
    _dikkatBildirimi() {
        if (!this._settings.get_boolean('attention-notify'))
            return;
        try {
            const bildirim = new Gio.Notification();
            bildirim.set_title('Claude Code');
            bildirim.set_body('Girdi bekleniyor.');
            this.send_notification('claude-pet-dikkat', bildirim);
        } catch (error) {
            console.warn(`${LOG} bildirim gonderilemedi: ${error}`);
        }
    }

    _tercihleriAc() {
        if (!this._tercihler) {
            this._tercihler = new TercihlerPenceresi({
                app: this,
                settings: this._settings,
                ikon: IKON,
            });
            this._tercihler.connect('close-request', () => {
                this._tercihler = null;
                return false;
            });
        }
        this._tercihler.present();
    }
});

// Wayland disinda hic baslamiyoruz: GTK'nin "cannot open display" hatasi
// yerine ne yapilmasi gerektigini soyleyen bir cumle daha faydali.
if (!GLib.getenv('WAYLAND_DISPLAY')) {
    printerr('claude-pet: Wayland oturumu bulunamadi.\n' +
        '  Bu surum yalnizca Wayland`de calisiyor (wlr-layer-shell).\n' +
        '  X11 oturumundaysan oturumu Wayland olarak ac.');
    System.exit(2);
}

const app = new Uygulama();
System.exit(app.run([System.programInvocationName, ...ARGV]));
