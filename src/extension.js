/* claude-pet — maskot aktörleri
 *
 * Kareler `assets/animations.json` içinde; bu dosya onları yükleyip
 * `St.DrawingArea` üzerine çizdiriyor ve maskotu sürüklenebilir tutuyor.
 *
 * İKİ ACTOR (Faz 2). Kare tek parça değil: karakter (`#`, `o`) tıklama alan
 * bir actor'e, laptop (`L`) hiç olay almayan ayrı bir actor'e gidiyor. Sebep
 * CLAUDE.md kural 4: karakterin dikdörtgeni dışında hiçbir piksel tıklama
 * yutmayacak. Tek actor'de tuvalin şeffaf köşeleri — ki laptop karakterin epey
 * solunda durduğu için hiç de küçük değiller — tıklamayı yutuyordu.
 *
 * Konumun tek kaynağı `_originX/_originY`: sprite ızgarasının (0,0) hücresinin
 * sahnedeki yeri. İki actor de kendi kutusunun ofsetiyle oradan türetiliyor,
 * yani birlikte hareket etmeleri için ayrıca bir şey yapmaya gerek yok.
 *
 * AYARLAR (Faz 5). Yedi anahtarın hepsi CANLI uygulanıyor; hiçbiri için
 * eklentiyi kapatıp açmak gerekmiyor. Konum artık monitöre GÖRELİ saklanıyor
 * ve aritmetiği `lib/layout.js`'te — kabuktan bağımsız, yani sınanabilir.
 *
 * SIZINTI. Kurulan her `connect()` `_connect()` üzerinden geçiyor ve
 * `disable()` hepsini kesiyor. Ayar dinleyicileri sızıntının en sık kaynağı:
 * kilit ekranı `disable()`/`enable()` çağırıyor, kesilmeyen bir dinleyici
 * orada hayalet actor olarak birikiyor.
 *
 * Bu kod gnome-shell process'inin İÇİNDE çalışıyor: yakalanmamış bir exception
 * kullanıcının bütün masaüstünü düşürür. enable() gövdesi bu yüzden try/catch
 * içinde ve hata hâlinde ne kurulduysa geri alınıyor.
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {loadAnimations} from './lib/animations.js';
import {drawLayer} from './lib/sprite.js';
import {Player} from './lib/player.js';
import {Tracker} from './lib/tracker.js';
import {Director} from './lib/director.js';
import {Presence} from './lib/presence.js';
import * as Layout from './lib/layout.js';

const LOG = '[claude-pet]';

/** İlk yerleşimde monitör kenarına bırakılan boşluk. */
const MARGIN = 24;

/** Tıklamayı alan katman. Sürükleme ve konum hesapları buna bakıyor. */
const ANA_KATMAN = 'karakter';

/** `laptop-enabled` ayarının kapattığı katman. */
const LAPTOP_KATMANI = 'laptop';

/** Sürükleme sayılmaya başlanan mesafe (piksel).
 *
 * Altında kalan hareket TIKLAMA sayılıyor: pet yerinden oynamıyor ve ayarlara
 * yazılmıyor. Eşik olmadan tek bir tıklama bile "sürükleme bitti" sayılıp
 * konumu yeniden yazıyordu (Faz 0'dan beri duran pürüz).
 */
const SURUKLEME_ESIGI = 4;

/* Katman → actor ayarları. Nesnedeki SIRA sahnedeki yığın sırası: laptop
 * önce ekleniyor, yani karakterin altında kalıyor. (İçerik olarak
 * çakışmıyorlar — bir hücrede tek karakter var — ama tıklama hedefi olan
 * actor'ün üstte olması picking'i tartışmasız kılıyor.)
 *
 * DİKKAT — `affectsInputRegion` Wayland'de bir şey YAPMIYOR. `ui/layout.js`
 * `_updateRegions()`: `wantsInputRegion = … && !Meta.is_wayland_compositor()`,
 * ve o false olunca izlenen actor'ler döngüde atlanıyor,
 * `set_stage_input_region` hiç çağrılmıyor. Yani laptobu tıklama yutmaz yapan
 * şey `reactive: false`. Bayrak niyet belgesi olarak duruyor: X11'de ve
 * ileride gerçekten input bölgesini belirliyor.
 */
const KATMAN_AYARI = {
    laptop: {reactive: false, affectsInputRegion: false},
    karakter: {reactive: true, affectsInputRegion: true},
};

export default class ClaudePetExtension extends Extension {
    enable() {
        // Alanlar en başta tanımlı: enable() yarıda kalırsa disable() yine de
        // tutarlı bir nesne üstünde çalışsın.
        this._actors = {};
        this._settings = null;
        this._signals = [];
        this._grab = null;
        this._grabOffsetX = 0;
        this._grabOffsetY = 0;
        this._pressX = 0;
        this._pressY = 0;
        this._dragMoved = false;
        this._player = null;
        this._sheet = null;
        this._cell = 3;
        this._boxes = null;
        this._originX = 0;
        this._originY = 0;
        this._tracker = null;
        this._director = null;
        this._menu = null;
        this._menuManager = null;
        this._pauseItem = null;
        this._laptopEnabled = true;
        this._paused = false;
        this._monitorIndex = -1;
        this._chromeYolu = 'addChrome';
        this._unredirectKapali = false;
        this._presence = null;
        // Claude kapaliyken pet hic gorunmuyor; ilk cevap gelene kadar da
        // gorunmesin diye baslangic false.
        this._present = false;
        // Fazın merkezî iddiası ölçülebilir kalsın: kare sayısı yüzlerceyken
        // boyutlandırma sayısı animasyon değişimi kadar olmalı.
        this._frameCount = 0;
        this._resizeCount = 0;
        // Katman gizlenip gösterilmesi dışarıdan görünmüyor (Wayland'de input
        // bölgesi zaten hiç sorulmuyor). Sayaç bunu ölçülebilir kılıyor.
        this._visibilityChanges = 0;

        try {
            this._settings = this.getSettings();

            this._sheet = loadAnimations(
                GLib.build_filenamev([this.path, 'assets', 'animations.json']));

            this._laptopEnabled = this._settings.get_boolean('laptop-enabled');
            this._paused = this._settings.get_boolean('paused');
            this._cell = this._readCell();

            this._buildActors();

            // VARLIK KONTROLÜ AKTÖRLERDEN HEMEN SONRA, animasyondan ÖNCE:
            // `start()` ilk cevabı hemen veriyor, yani Claude kapalıyken pet
            // tek kare bile görünmüyor.
            this._presence = new Presence();
            this._present = this._presence.start();
            this._connect(this._presence, 'changed',
                (_p, varMi, ad) => this._applyPresence(varMi, ad));

            // Zincir: tracker (ne oluyor) → director (ne oynayacak) →
            // player (ne zaman) → sprite (nasıl çizilecek).
            this._player = new Player(this._sheet.animations,
                () => this._onFrame(),
                ad => this._director?.onCycle(ad));

            this._director = new Director({
                animations: this._sheet.animations,
                // Klip değişimi actor'leri de yeniden boyutlandırıyor (Faz 2),
                // o yüzden yönetmen player'a doğrudan değil buradan geçiyor.
                play: (ad, secenekler) => this._playAnimation(ad, secenekler),
                isRunning: () => this._player?.running ?? false,
                sleepTimeoutMs: this._readSleepMs(),
            });
            // Duraklatılmış açılışta bile açılış pozu çiziliyor; `start()`
            // yalnızca uykuyu kurmuyor.
            if (this._paused)
                this._director.setPaused(true);
            if (!this._present)
                this._director.setAbsent(true);
            this._director.start();

            // Konum animasyondan SONRA: varsayılan yerleşim karakter kutusunun
            // boyutunu biliyor olmalı.
            this._restorePosition();
            this._makeDraggable();
            this._buildMenu();

            this._tracker = new Tracker({sleepTimeoutMs: this._readSleepMs()});
            this._connect(this._tracker, 'changed', (_t, durum, rateLimited) => {
                console.log(`${LOG} durum: ${durum}${rateLimited ? ' · rate limit' : ''}`);
                // Olay geldiyse bir Claude süreci var demektir; yoklamayı
                // bekleme, hemen bak. Yeni açılan bir oturumda pet'i anında
                // getiren şey bu.
                this._presence?.poke();
                this._director?.setState(durum, rateLimited);
                if (durum === 'WAITING')
                    this._notifyAttention();
            });
            this._tracker.start();

            this._watchSettings();
            if (this._present)
                this._holdUnredirect();

            // Monitör takılıp çıkarıldığında ya da çözünürlük değiştiğinde
            // pet ekran dışında kalmasın.
            this._connect(Main.layoutManager, 'monitors-changed',
                () => this._onMonitorsChanged());

            console.log(`${LOG} etkin · ${this._chromeYolu} · ` +
                `claude ${this._present ? 'açık' : 'KAPALI (pet gizli)'} · ` +
                `ızgara (${this._originX}, ${this._originY}) · ` +
                `monitör ${this._monitorIndex} · hücre ${this._cell}px · ` +
                `${Object.keys(this._sheet.animations).length} animasyon` +
                `${this._paused ? ' · DURAKLATILMIŞ' : ''}`);
        } catch (error) {
            console.error(`${LOG} enable: ${error}`);
            // Yarım kurulmuş bir eklenti bırakma: ne kurulduysa geri al.
            this.disable();
        }
    }

    disable() {
        try {
            // Zamanlayıcı her şeyden önce dursun: aktör yok edildikten sonra
            // uyanan bir kare geri çağrısı ölü bir aktöre uzanır.
            this._player?.stop();
            this._player = null;

            this._director?.stop();
            this._director = null;

            // Dosya izleyicisi de zamanlayıcı gibi: aktörlerden önce sökülsün.
            this._tracker?.stop();
            this._tracker = null;

            if (this._presence) {
                const {fullScans, fastChecks} = this._presence.stats;
                console.log(`${LOG} varlık yoklaması · ${fullScans} tam tarama · ` +
                    `${fastChecks} hızlı kontrol`);
                this._presence.stop();
                this._presence = null;
            }

            // Sürüklemenin ORTASINDA kapatılıyor olabiliriz: kilit ekranı
            // disable() çağırıyor. Bırakılmamış bir Clutter.Grab bütün girdiyi
            // kilitler — aktörü yok etmeden önce mutlaka bırak.
            this._endDrag(false);

            // Sinyaller aktörlerden ÖNCE koparılıyor: destroy() sırasında
            // tetiklenen bir geri çağrı yok olmuş alanlara uzanmasın. Ayar
            // dinleyicileri de bu listede.
            for (const [object, id] of this._signals ?? [])
                object.disconnect(id);
            this._signals = [];

            // Menü kaynak aktörden önce gitsin: kapanırken ona uzanıyor.
            if (this._menu) {
                this._menuManager?.removeMenu(this._menu);
                this._menu.destroy();
            }
            this._menu = null;
            this._menuManager = null;
            this._pauseItem = null;

            for (const area of Object.values(this._actors ?? {})) {
                Main.layoutManager.removeChrome(area);
                area.destroy();
            }
            this._actors = {};

            this._releaseUnredirect();

            this._boxes = null;
            this._sheet = null;
            this._settings = null;
            console.log(`${LOG} kapatıldı · ${this._frameCount} kare · ` +
                `${this._resizeCount} kez boyutlandı · ` +
                `${this._visibilityChanges} kez katman gizlendi/gösterildi`);
        } catch (error) {
            console.error(`${LOG} disable: ${error}`);
        }
    }

    // ---------------------------------------------------------------- aktörler

    _buildActors() {
        for (const [ad, ayar] of Object.entries(KATMAN_AYARI)) {
            const area = new St.DrawingArea({
                name: `claude-pet-${ad}`,
                reactive: ayar.reactive,
                can_focus: false,
                track_hover: false,
                // İlk boyut ve konum verilene kadar görünmesin.
                visible: false,
                width: 1,
                height: 1,
            });

            this._connect(area, 'repaint', () => this._onRepaint(ad, area));

            // affectsStruts: false -> pencere yerleşimini bozmaz, maksimize
            // pencereler küçülmez. trackFullscreen: false -> tam ekran
            // olduğunda GİZLENMEZ.
            //
            // TAM EKRAN İÇİN `addChrome` DEĞİL `addTopChrome`. İkisi arasındaki
            // tek fark bir satır (`ui/layout.js`):
            //
            //     addChrome(actor, params) {
            //         this.uiGroup.add_child(actor);
            //         if (this.uiGroup.contains(global.top_window_group))
            //             this.uiGroup.set_child_below_sibling(
            //                 actor, global.top_window_group);   // <-- burası
            //         this._chrome.addActor(actor, params);
            //     }
            //
            // Mutter tam ekran pencereleri `global.top_window_group`'a taşıyor
            // (panelin tam ekranda kaybolmasının sebebi de bu). `addChrome`
            // aktörü o grubun ALTINA koyduğu için pet tam ekran YouTube'un ya
            // da oyunun arkasında kalıyordu — ölçüldü: pencere tam ekrana
            // geçene kadar pet görünüyor, geçtiği anda kayboluyor.
            // `addTopChrome` o restack'i yapmıyor; ekran klavyesi de tam ekran
            // uygulamaların üstünde bu yüzden çıkabiliyor.
            //
            // `trackFullscreen: false` ayrı bir mesele ve hâlâ gerekli: o
            // GÖRÜNÜRLÜĞÜ, bu YIĞIN SIRASINI belirliyor.
            const ekle = Main.layoutManager.addTopChrome
                ? 'addTopChrome' : 'addChrome';
            Main.layoutManager[ekle](area, {
                affectsStruts: false,
                affectsInputRegion: ayar.affectsInputRegion,
                trackFullscreen: false,
            });
            this._chromeYolu = ekle;

            this._actors[ad] = area;
        }
    }

    _connect(object, signal, handler) {
        const id = object.connect(signal, handler);
        this._signals.push([object, id]);
    }

    // ------------------------------------------------------------------ ayarlar

    /** Hücrenin piksel kenarı: ayar × ekranın kendi ölçeği.
     *  Tam sayı olduğu için dikdörtgenler piksel sınırına oturuyor —
     *  büyütmek bulanıklaştırmıyor. */
    _readCell() {
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        return Math.max(1, Math.round(this._settings.get_int('scale') * scale));
    }

    /** `sleep-timeout` saniye cinsinden; iki tüketicisi de milisaniye istiyor. */
    _readSleepMs() {
        return Math.max(0, this._settings.get_int('sleep-timeout')) * 1000;
    }

    /** Birkaç anahtarı TEK yazma olarak gönder.
     *
     * ÖLÇÜLDÜ: `changed` sinyali yazan process'e EŞZAMANLI geliyor —
     * `set_int` daha dönmeden dinleyici çalışıyor
     * (`yazmadan önce → handler(x) → x yazıldı → handler(y) → y yazıldı`).
     * Üç anahtarı ayrı ayrı yazmak, aradaki dinleyicinin YARIM bir üçlü
     * görmesi demek — yeni monitör + eski koordinat — ve pet bir kare
     * boyunca yanlış yere sıçrar.
     *
     * `delay()`/`apply()` bunu çözüyor ama nesneyi KALICI olarak gecikmeli
     * moda sokuyor: `g_settings_apply()` geri döndürmüyor ve `undelay` diye
     * bir şey yok. ÖLÇÜLDÜ (bu faz sırasında, canlı): `this._settings`
     * üzerinde bir kez `delay()` çağrıldıktan sonra `paused` ayarı bir daha
     * dconf'a ULAŞMADI. O yüzden toplu yazma tek kullanımlık bir nesneden
     * geçiyor; `this._settings` anında yazan modda kalıyor.
     */
    _writeInts(degerler) {
        const settings = this.getSettings();
        settings.delay();
        for (const [anahtar, deger] of Object.entries(degerler))
            settings.set_int(anahtar, deger);
        settings.apply();
    }

    _watchSettings() {
        const izle = (anahtar, fn) =>
            this._connect(this._settings, `changed::${anahtar}`, fn);

        izle('scale', () => this._applyScale());
        izle('laptop-enabled', () => this._applyLaptop());
        izle('paused', () => this._applyPaused());
        izle('sleep-timeout', () => this._applySleep());

        // Konum anahtarları prefs'ten de değişebiliyor ("konumu sıfırla",
        // monitör seçimi). `_restorePosition()` idempotent — kendi
        // yazdığımız değer geri okunduğunda pet yerinden oynamıyor.
        for (const anahtar of ['position-x', 'position-y', 'monitor-index'])
            izle(anahtar, () => this._restorePosition());
    }

    /** Ölçek değişti: tuvalleri yeniden boyutla, konumu yeni boyuta göre çöz. */
    _applyScale() {
        const cell = this._readCell();
        if (cell === this._cell)
            return;

        this._cell = cell;
        this._syncSize(this._player?.currentName ?? 'ölçek');
        // Büyüyen karakter ekran dışına taşabilir; kayıtlı konum yeni boyuta
        // göre yeniden sıkıştırılıyor.
        this._restorePosition();
        this._syncVisibility();
        for (const area of Object.values(this._actors))
            area.queue_repaint();
    }

    _applyLaptop() {
        this._laptopEnabled = this._settings.get_boolean('laptop-enabled');
        this._syncVisibility();
        console.log(`${LOG} laptop katmanı ${this._laptopEnabled ? 'açık' : 'kapalı'}`);
    }

    _applyPaused() {
        this._paused = this._settings.get_boolean('paused');
        this._director?.setPaused(this._paused);
    }

    /** Tek anahtar iki yeri besliyor: pet'in "çalışıyor" saymayı bıraktığı süre
     *  (tracker) ve boşta uyku klibine geçme süresi (yönetmen). İkisi de
     *  "bu kadar süredir bir şey olmuyor" sorusunun cevabı. */
    _applySleep() {
        const ms = this._readSleepMs();
        this._director?.setSleepTimeout(ms);
        this._tracker?.setSleepTimeout(ms);
        console.log(`${LOG} boşta kalma süresi ${ms / 1000} sn`);
    }

    /** Claude açıldı ya da kapandı.
     *
     * Pet'in var olma şartı: Claude ya masaüstü uygulaması olarak ya da
     * terminalde çalışıyor olmalı. Kapalıyken aktörler gizleniyor,
     * zamanlayıcılar bırakılıyor ve unredirect de geri veriliyor — yani
     * Claude kapalıyken tam ekran oyunun bileşikleme bedeli de yok.
     */
    _applyPresence(varMi, ad) {
        this._present = varMi;
        this._director?.setAbsent(!varMi);

        if (varMi)
            this._holdUnredirect();
        else
            this._releaseUnredirect();

        this._syncVisibility();
        console.log(`${LOG} pet ${varMi ? `görünür (${ad})` : 'gizlendi · claude kapalı'}`);
    }

    // ------------------------------------------------------------ tam ekran

    /** Tam ekranda pet'in GERÇEKTEN görünmesini sağlayan şey.
     *
     * Mutter, ekranı tamamen kaplayan opak bir pencereyi bir süre sonra
     * "unredirect" ediyor: bileşiklemeyi (compositing) atlayıp pencerenin
     * tamponunu doğrudan ekrana basıyor. O anda kabuğun sahnesindeki hiçbir
     * şey — panel, bildirim, bizim aktörlerimiz — çizilmiyor. Kullanıcının
     * tarifi tam olarak buydu: "YouTube tam ekran açılınca önce bir görünüyor,
     * sonra arkada kalıyor". Gecikme de bunun imzası; yığın sırası olsaydı
     * anında kaybolurdu (ölçüldü: `addChrome` ile de `addTopChrome` ile de
     * nested'de tam ekranın ÜSTÜNDE çiziliyor, çünkü nested'in dummy
     * arka ucu doğrudan basmıyor).
     *
     * `disable_unredirect_for_display()` bir sayaç: kabuk da genel bakışı
     * açarken aynısını yapıyor. Bedeli gerçek — tam ekran oyun ve video
     * artık doğrudan basılmıyor, bileşikleme yolundan geçiyor. Bu eklentinin
     * tek işi tam ekranda görünmek olduğu için kabul ediliyor.
     *
     * `enable_unredirect_for_display()` ile DENGELENMESİ şart: dengelenmezse
     * eklenti kapatıldıktan sonra da bütün oturum boyunca unredirect kapalı
     * kalır.
     */
    _holdUnredirect() {
        if (this._unredirectKapali)
            return;
        try {
            Meta.disable_unredirect_for_display(global.display);
            this._unredirectKapali = true;
            console.log(`${LOG} tam ekran: unredirect kapatıldı ` +
                '(pet tam ekran pencerelerin üstünde kalsın diye)');
        } catch (error) {
            console.warn(`${LOG} unredirect kapatılamadı: ${error}`);
        }
    }

    _releaseUnredirect() {
        if (!this._unredirectKapali)
            return;
        this._unredirectKapali = false;
        try {
            Meta.enable_unredirect_for_display(global.display);
            console.log(`${LOG} tam ekran: unredirect geri verildi`);
        } catch (error) {
            console.warn(`${LOG} unredirect geri verilemedi: ${error}`);
        }
    }

    /** Claude Code girdi bekliyor: pet görünmüyor olabilir, bildirim gönder. */
    _notifyAttention() {
        if (!this._settings?.get_boolean('attention-notify'))
            return;

        try {
            Main.notify('Claude Code', 'Girdi bekleniyor.');
        } catch (error) {
            console.warn(`${LOG} bildirim gönderilemedi: ${error}`);
        }
    }

    // ------------------------------------------------------------------ çizim

    _onRepaint(ad, area) {
        const cr = area.get_context();
        try {
            drawLayer(cr, this._player?.currentFrame()?.[ad],
                this._sheet.colors, this._cell, this._boxes?.[ad]);
        } catch (error) {
            console.error(`${LOG} çizim (${ad}): ${error}`);
        } finally {
            // GJS'de Cairo bağlamı elle bırakılmazsa sızıyor (klasik tuzak).
            cr.$dispose();
        }
    }

    /** Kare değişti: görünürlüğü tazele ve yeniden çizdir. BOYUT DEĞİŞMEZ. */
    _onFrame() {
        this._frameCount++;
        this._syncVisibility();
    }

    /** Hangi katman görünecek: bu karede içeriği var mı, ve ayar açık mı. */
    _syncVisibility() {
        const kare = this._player?.currentFrame();

        for (const [ad, area] of Object.entries(this._actors)) {
            // Katman bu karede boşsa actor GİZLENİR, yok edilmez: gizli bir
            // actor ne çiziliyor ne de picking'e giriyor (X11'de input
            // bölgesine de girmiyor — layout.js orada `get_paint_visibility()`
            // soruyor), ama katman geri geldiğinde yeniden kurmak gerekmiyor.
            // `laptop-enabled` kapalıyken laptop hiç görünmüyor: aynı yol,
            // tek fark koşulun kaynağı.
            // Claude kapalıysa hiçbir katman görünmüyor: pet'in var olma
            // şartı bu (`lib/presence.js`).
            const gorunur = this._present &&
                !!this._boxes?.[ad] && !!kare?.[ad]?.box &&
                (ad !== LAPTOP_KATMANI || this._laptopEnabled);

            if (area.visible !== gorunur) {
                area.visible = gorunur;
                this._visibilityChanges++;
            }
            if (gorunur)
                area.queue_repaint();
        }
    }

    /** Animasyonu oynat ve tuvalleri onun birleşim kutularına göre boyutla. */
    _playAnimation(name, options) {
        const anim = this._sheet.animations[name];
        if (!anim)
            return false;

        // Kutular oynatmadan ÖNCE geçiyor. `play()` ilk kareyi hemen bildiriyor
        // ve o bildirim katman görünürlüğünü kutulara bakarak hesaplıyor —
        // eski kutularla hesaplanırsa yeni klibin ilk karesinde laptop bir
        // kare boyunca yanlış görünürlükte kalır.
        // Zaten o animasyon oynuyorsa kutular da aynı: boşuna boyutlandırma yok.
        if (this._boxes !== anim.boxes) {
            this._boxes = anim.boxes;
            this._syncSize(name);
            this._syncPosition();
        }

        return this._player.play(name, options);
    }

    // -------------------------------------------------------------- geometri

    /** Actor boyutlarını o animasyonun birleşim kutularına eşitle.
     *
     * BOYUT KARE BAŞINA DEĞİŞMEZ, ANIMASYON BAŞINA DEĞİŞİR. Sebebi ölçüldü:
     *
     * 1. Bir chrome actor'ün her allocation değişikliği (`set_size` de
     *    `set_position` da) `layout.js::_trackActor`'ün bağladığı
     *    `notify::allocation` üzerinden `_queueUpdateRegions()` tetikliyor —
     *    X11'de bu doğrudan input bölgesinin yeniden hesaplanması, yani
     *    kompozitör düzeyinde iş. 15 fps'de yapılırsa görünür titreme demek.
     * 2. "Kutu değişmediyse çağırma" koruması burada işe YARAMAZ: kollar ve
     *    bacaklar oynadığı için karakterin sıkı kutusu neredeyse her karede
     *    değişiyor (`laptop_code`'un 35 karesinde 7 ayrı sıkı kutu,
     *    `duruslar_9`'un 9 karesinde 5).
     *
     * Bedeli: birleşim kutusu sıkı kutudan büyük (karakterde 1.46–1.62×).
     * Kabul edilebilir, çünkü kazanç zaten laptobu ve tuvalin boş kenarlarını
     * dışarıda bırakmaktan geliyor — karakter actor'ü tam tuvalin %33–55'i.
     *
     * Ölçek ayarı da buradan geçiyor: hücre büyüyünce kutular aynı kalıyor,
     * piksel karşılığı değişiyor.
     */
    _syncSize(klip) {
        const rapor = [];
        for (const [ad, area] of Object.entries(this._actors)) {
            const box = this._boxes?.[ad];
            if (!box) {
                rapor.push(`${ad}: yok`);
                continue;
            }
            area.set_size(box.w * this._cell, box.h * this._cell);
            rapor.push(`${ad}: ${box.w}×${box.h} hücre @(${box.x},${box.y})`);
        }

        this._resizeCount++;
        console.log(`${LOG} tuval · ${klip} · hücre ${this._cell}px · ` +
            rapor.join(' · '));
    }

    /** Actor konumlarını ızgara başlangıcından türet. */
    _syncPosition() {
        for (const [ad, area] of Object.entries(this._actors)) {
            const box = this._boxes?.[ad];
            if (!box)
                continue;
            area.set_position(
                this._originX + box.x * this._cell,
                this._originY + box.y * this._cell);
        }
    }

    _setOrigin(x, y) {
        this._originX = Math.round(x);
        this._originY = Math.round(y);
        this._syncPosition();
    }

    // ------------------------------------------------------------------ konum
    //
    // Aritmetiğin tamamı `lib/layout.js`'te ve kabuktan bağımsız; buradaki iş
    // yalnızca kabuktan monitör listesini alıp sonucu aktörlere uygulamak.

    _monitors() {
        return Main.layoutManager.monitors ?? [];
    }

    _primaryIndex() {
        return Main.layoutManager.primaryIndex ?? 0;
    }

    /** Ayarlardaki kaydı ekrandaki bir yere çevir ve uygula.
     *
     * Açılış, ölçek değişimi, monitör değişimi ve prefs'ten gelen her konum
     * değişikliği buradan geçiyor. İdempotent: aynı ayarlarla ikinci kez
     * çağrılmak pet'i oynatmıyor.
     */
    _restorePosition() {
        const cozum = Layout.resolveOrigin({
            monitors: this._monitors(),
            primaryIndex: this._primaryIndex(),
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
        this._setOrigin(cozum.x, cozum.y);
    }

    /** Monitör takıldı/çıkarıldı ya da çözünürlük değişti.
     *
     * Ayar YENİDEN YAZILMIYOR: kayıtlı monitör geçici olarak çıkarılmışsa
     * tercih korunuyor, geri takılınca pet oraya dönüyor. Ekranda görünen
     * konum ise her hâlükârda içeri sıkıştırılıyor.
     */
    _onMonitorsChanged() {
        this._restorePosition();
        console.log(`${LOG} monitörler değişti · ${this._monitors().length} monitör · ` +
            `pet monitör ${this._monitorIndex} · (${this._originX}, ${this._originY})`);
    }

    // -------------------------------------------------------------- sürükleme
    //
    // `Clutter.DragAction` GNOME 46'nın Clutter çatalında YOK (ölçüldü: typelib
    // Clutter-14'te tanımsız). Kabuğun kendi yolu kullanılıyor:
    // `global.stage.grab()` + el ile olay takibi — `ui/screenshot.js` ve
    // `ui/slider.js` bunu böyle yapıyor.
    //
    // Olaylar YALNIZCA karakter actor'ünde. Laptop `reactive: false` olduğu
    // için zaten hiçbir olay almıyor; sürüklenirken onu taşıyan şey ortak
    // ızgara başlangıcı.

    _makeDraggable() {
        const pet = this._actors[ANA_KATMAN];
        if (!pet)
            return;

        this._connect(pet, 'button-press-event', (_actor, event) => this._onPress(event));
        this._connect(pet, 'motion-event', (_actor, event) => this._onMotion(event));
        this._connect(pet, 'button-release-event', () => this._onRelease());
    }

    _onPress(event) {
        if (event.get_button() === Clutter.BUTTON_SECONDARY) {
            this._menu?.toggle();
            return Clutter.EVENT_STOP;
        }

        if (event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;

        const [stageX, stageY] = event.get_coords();

        // İmlecin ızgaraya göre yeri sürükleme boyunca sabit kalmalı; yoksa
        // pet ilk harekette imlecin altına zıplar.
        this._grabOffsetX = stageX - this._originX;
        this._grabOffsetY = stageY - this._originY;
        this._pressX = stageX;
        this._pressY = stageY;
        this._dragMoved = false;

        // Grab olmadan imleç aktörün dışına çıktığı anda motion olayları kesilir
        // ve sürükleme yarıda kalır.
        this._grab = global.stage.grab(this._actors[ANA_KATMAN]);

        return Clutter.EVENT_STOP;
    }

    _onMotion(event) {
        if (!this._grab)
            return Clutter.EVENT_PROPAGATE;

        const [stageX, stageY] = event.get_coords();

        // Eşiği aşana kadar pet KIMILDAMIYOR. Aşınca da hareket imlecin
        // basıldığı andaki ofsetinden hesaplanıyor, yani pet zıplamıyor.
        if (!this._dragMoved) {
            if (Math.abs(stageX - this._pressX) < SURUKLEME_ESIGI &&
                Math.abs(stageY - this._pressY) < SURUKLEME_ESIGI)
                return Clutter.EVENT_STOP;
            this._dragMoved = true;
        }

        this._setOrigin(stageX - this._grabOffsetX, stageY - this._grabOffsetY);

        return Clutter.EVENT_STOP;
    }

    _onRelease() {
        if (!this._grab)
            return Clutter.EVENT_PROPAGATE;

        this._endDrag(true);
        return Clutter.EVENT_STOP;
    }

    /** Grab'i bırak; gerçekten sürüklendiyse konumu kaydet.
     *
     * disable() de buraya uğruyor ama `save: false` ile: kapanış sırasında
     * ayarlara yazmak, yarım kalmış bir sürüklemeyi kalıcılaştırmak olurdu.
     */
    _endDrag(save) {
        if (!this._grab)
            return;

        this._grab.dismiss();
        this._grab = null;

        const tasindi = this._dragMoved;
        this._dragMoved = false;
        if (!save || !tasindi)
            return;

        try {
            this._savePosition();
        } catch (error) {
            console.error(`${LOG} sürükleme sonu: ${error}`);
        }
    }

    /** Bulunduğu yeri, altındaki monitöre GÖRELİ olarak yaz.
     *
     * Üç anahtar TEK yazmada gidiyor (`_writeInts`): aralarında bir `changed`
     * sinyali doğarsa `_restorePosition()` yeni konumu ESKİ monitöre göre
     * çözer ve pet bir kare için yanlış yere sıçrar.
     */
    _savePosition() {
        const monitors = this._monitors();
        const box = this._boxes?.[ANA_KATMAN];
        const primary = this._primaryIndex();

        const index = Layout.monitorIndexForOrigin(monitors, box, this._cell,
            this._originX, this._originY, primary);
        const {monitor} = Layout.pickMonitor(monitors, index, primary);

        const [gx, gy] = Layout.clampOrigin(monitor, box, this._cell,
            this._originX, this._originY);
        const [rx, ry] = Layout.kacinKayitsiz(
            ...Layout.toRelative(monitor, gx, gy));

        // Ekrandaki konum da kaydedilen değerden türetiliyor: ayar ile görüntü
        // arasında bir piksel bile fark kalmasın.
        this._setOrigin(...Layout.fromRelative(monitor, rx, ry));
        this._monitorIndex = index;

        this._writeInts({
            'monitor-index': index,
            'position-x': rx,
            'position-y': ry,
        });

        console.log(`${LOG} konum kaydedildi · monitör ${index} · (${rx}, ${ry})`);
    }

    // ------------------------------------------------------------------- menü

    _buildMenu() {
        const pet = this._actors[ANA_KATMAN];
        if (!pet)
            return;

        // Arrow side BOTTOM: menü aktörün ÜSTÜNDE açılıyor. Pet çoğunlukla
        // ekranın alt kenarında duruyor; yer yoksa BoxPointer kendi çeviriyor.
        this._menu = new PopupMenu.PopupMenu(pet, 0.5, St.Side.BOTTOM);
        Main.layoutManager.uiGroup.add_child(this._menu.actor);
        this._menu.actor.hide();

        this._menuManager = new PopupMenu.PopupMenuManager(pet);
        this._menuManager.addMenu(this._menu);

        this._pauseItem = this._menu.addAction('Duraklat', () => this._togglePause());
        this._menu.addAction('Ayarlar', () => this.openPreferences());
        this._menu.addAction('Konumu sıfırla', () => this._resetPosition());

        this._connect(this._menu, 'open-state-changed',
            (_menu, acik) => this._onMenuOpen(acik));
    }

    /** Menü açıkken animasyon DURUYOR (kare donuyor, zamanlayıcı yok).
     *
     * Dondurma `stop()` değil `freeze()`: menü kapanınca klip baştan değil
     * kaldığı kareden sürüyor. Yönetmene de haber veriliyor, yoksa menü
     * açıkken gelen bir durum değişikliği yeni klip başlatırdı.
     */
    _onMenuOpen(acik) {
        if (acik) {
            this._pauseItem?.label.set_text(this._paused ? 'Devam et' : 'Duraklat');
            this._player?.freeze();
            this._director?.setMenuOpen(true);
            return;
        }

        this._player?.thaw();
        this._director?.setMenuOpen(false);
    }

    _togglePause() {
        this._settings.set_boolean('paused', !this._paused);
    }

    /** Konumu unut: pet bulunduğu monitörün sağ altına döner.
     *  Monitör tercihi korunuyor — burada sıfırlanan şey KONUM. */
    _resetPosition() {
        this._writeInts({
            'position-x': Layout.KAYITSIZ,
            'position-y': Layout.KAYITSIZ,
        });
        console.log(`${LOG} konum sıfırlandı`);
    }
}
