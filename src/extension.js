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
 * GSettings'e yazılan da bu — Faz 1'in kaydettiği değerlerle aynı anlamda.
 *
 * Bu kod gnome-shell process'inin İÇİNDE çalışıyor: yakalanmamış bir exception
 * kullanıcının bütün masaüstünü düşürür. enable() gövdesi bu yüzden try/catch
 * içinde ve hata hâlinde ne kurulduysa geri alınıyor.
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {loadAnimations} from './lib/animations.js';
import {drawLayer} from './lib/sprite.js';
import {Player} from './lib/player.js';
import {Tracker} from './lib/tracker.js';

const LOG = '[claude-pet]';

/** Bir hücrenin ölçeklenmemiş piksel kenarı. */
const BASE_CELL = 3;

/** İlk yerleşimde monitör kenarına bırakılan boşluk. */
const MARGIN = 24;

/* Faz 1'de durum makinesi yok: tek animasyon döngüde oynuyor.
 * Faz 4'te `lib/states.js` bunu devralacak. */
const GECICI_ANIMASYON = 'laptop_code';

/** Tıklamayı alan katman. Sürükleme ve konum hesapları buna bakıyor. */
const ANA_KATMAN = 'karakter';

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
        this._player = null;
        this._sheet = null;
        this._cell = BASE_CELL;
        this._boxes = null;
        this._originX = 0;
        this._originY = 0;
        // Fazın merkezî iddiası ölçülebilir kalsın: kare sayısı yüzlerceyken
        // boyutlandırma sayısı animasyon değişimi kadar olmalı.
        this._tracker = null;
        this._frameCount = 0;
        this._resizeCount = 0;
        // Katman gizlenip gösterilmesi dışarıdan görünmüyor (Wayland'de input
        // bölgesi zaten hiç sorulmuyor). Sayaç bunu ölçülebilir kılıyor.
        this._visibilityChanges = 0;

        try {
            this._settings = this.getSettings();

            this._sheet = loadAnimations(
                GLib.build_filenamev([this.path, 'assets', 'animations.json']));

            // Ölçek bir kez okunuyor. Ölçek değişikliğini izlemek Faz 5'in işi.
            const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            this._cell = Math.max(1, Math.round(BASE_CELL * scale));

            this._buildActors();

            this._player = new Player(this._sheet.animations, () => this._onFrame());
            this._startAnimation();

            // Konum animasyondan SONRA: varsayılan yerleşim karakter kutusunun
            // boyutunu biliyor olmalı.
            this._restorePosition();
            this._makeDraggable();

            // Durum takibi (Faz 3). Pet HENÜZ TEPKİ VERMİYOR: eşleme Faz 4'ün
            // işi, burada yalnızca doğru durumun bilindiği görülüyor.
            this._tracker = new Tracker();
            this._connect(this._tracker, 'changed', (_t, durum, rateLimited) =>
                console.log(`${LOG} durum: ${durum}${rateLimited ? ' · rate limit' : ''}`));
            this._tracker.start();

            console.log(`${LOG} etkin · ızgara (${this._originX}, ${this._originY}) · ` +
                `hücre ${this._cell}px · ${Object.keys(this._sheet.animations).length} animasyon`);
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

            // Dosya izleyicisi de zamanlayıcı gibi: aktörlerden önce sökülsün.
            this._tracker?.stop();
            this._tracker = null;

            // Sürüklemenin ORTASINDA kapatılıyor olabiliriz: kilit ekranı
            // disable() çağırıyor. Bırakılmamış bir Clutter.Grab bütün girdiyi
            // kilitler — aktörü yok etmeden önce mutlaka bırak.
            this._endDrag(false);

            // Sinyaller aktörlerden ÖNCE koparılıyor: destroy() sırasında
            // tetiklenen bir geri çağrı yok olmuş alanlara uzanmasın.
            for (const [object, id] of this._signals ?? [])
                object.disconnect(id);
            this._signals = [];

            for (const area of Object.values(this._actors ?? {})) {
                Main.layoutManager.removeChrome(area);
                area.destroy();
            }
            this._actors = {};

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
            // pencerenin üstünde de görünür.
            Main.layoutManager.addChrome(area, {
                affectsStruts: false,
                affectsInputRegion: ayar.affectsInputRegion,
                trackFullscreen: false,
            });

            this._actors[ad] = area;
        }
    }

    _connect(object, signal, handler) {
        const id = object.connect(signal, handler);
        this._signals.push([object, id]);
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

        const kare = this._player?.currentFrame();
        for (const [ad, area] of Object.entries(this._actors)) {
            // Katman bu karede boşsa actor GİZLENİR, yok edilmez: gizli bir
            // actor ne çiziliyor ne de picking'e giriyor (X11'de input
            // bölgesine de girmiyor — layout.js orada `get_paint_visibility()`
            // soruyor), ama katman geri geldiğinde yeniden kurmak gerekmiyor.
            const gorunur = !!this._boxes?.[ad] && !!kare?.[ad]?.box;
            if (area.visible !== gorunur) {
                area.visible = gorunur;
                this._visibilityChanges++;
            }
            if (gorunur)
                area.queue_repaint();
        }
    }

    _startAnimation() {
        // Faz 1 geçici davranışı: tek klip döngüde. Varlık dosyasında
        // `loop: false` yazıyor çünkü Faz 4'te üçe bölünecek; burada
        // döngü bilerek zorlanıyor.
        if (!this._playAnimation(GECICI_ANIMASYON, {loop: true})) {
            // O animasyon yoksa (bozuk varlık) eldeki ilk animasyona düş.
            const ilk = Object.keys(this._sheet.animations)[0];
            if (ilk)
                this._playAnimation(ilk, {loop: true});
        }
    }

    /** Animasyonu oynat ve tuvalleri onun birleşim kutularına göre boyutla. */
    _playAnimation(name, options) {
        const anim = this._sheet.animations[name];
        if (!anim || !this._player.play(name, options))
            return false;

        // Zaten o animasyon oynuyorsa `play()` işlem yapmadan true dönüyor;
        // kutular da değişmemiş oluyor, boşuna boyutlandırma yok.
        if (this._boxes !== anim.boxes) {
            this._boxes = anim.boxes;
            this._syncSize();
            this._syncPosition();
        }
        return true;
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
     */
    _syncSize() {
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
        console.log(`${LOG} tuval · ${this._player?.currentName} · ${rapor.join(' · ')}`);
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

    /** Kayıtlı konuma yerleştir; kayıt yoksa birincil monitörün sağ altına. */
    _restorePosition() {
        let x = this._settings.get_int('position-x');
        let y = this._settings.get_int('position-y');

        if (x < 0 || y < 0) {
            const monitor = Main.layoutManager.primaryMonitor;
            const box = this._boxes?.[ANA_KATMAN];
            if (monitor && box) {
                // Kenar boşluğu KARAKTERE göre ölçülüyor, tuvale göre değil:
                // artık actor'ün kenarıyla karakterin kenarı aynı şey.
                x = monitor.x + monitor.width - MARGIN - (box.x + box.w) * this._cell;
                y = monitor.y + monitor.height - MARGIN - (box.y + box.h) * this._cell;
            } else {
                // Monitör tablosu henüz hazır değilse ekranın dışına düşmektense
                // sol üste yakın dur; ilk sürüklemede zaten düzelir.
                x = MARGIN;
                y = MARGIN;
            }
        }

        const [cx, cy] = this._clamp(x, y);
        this._setOrigin(cx, cy);
    }

    /** Izgara başlangıcını, KARAKTER bir monitörün içinde kalacak şekilde
     *  sıkıştır.
     *
     * Hangi monitör: karakterin MERKEZİNİ içeren monitör. Hiçbiri içermiyorsa
     * (monitör çıkarılmış, kayıtlı konum artık boşlukta kalmış) birincile
     * düşülür — yoksa pet erişilemez bir yerde belirir.
     *
     * Laptop bilerek sıkıştırılmıyor: karakterin solunda duruyor, ekran
     * kenarında yarısı dışarı taşabilir. Onu içeride tutmak karakteri
     * kenardan uzaklaştırırdı.
     */
    _clamp(originX, originY) {
        const box = this._boxes?.[ANA_KATMAN];
        const monitors = Main.layoutManager.monitors;
        if (!box || !monitors?.length)
            return [Math.round(originX), Math.round(originY)];

        const w = box.w * this._cell;
        const h = box.h * this._cell;
        const x = originX + box.x * this._cell;
        const y = originY + box.y * this._cell;

        const monitor = monitors.find(m =>
            x + w / 2 >= m.x && x + w / 2 < m.x + m.width &&
            y + h / 2 >= m.y && y + h / 2 < m.y + m.height)
            ?? Main.layoutManager.primaryMonitor ?? monitors[0];

        const cx = Math.max(monitor.x, Math.min(x, monitor.x + monitor.width - w));
        const cy = Math.max(monitor.y, Math.min(y, monitor.y + monitor.height - h));

        return [
            Math.round(cx - box.x * this._cell),
            Math.round(cy - box.y * this._cell),
        ];
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
        if (event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;

        const [stageX, stageY] = event.get_coords();

        // İmlecin ızgaraya göre yeri sürükleme boyunca sabit kalmalı; yoksa
        // pet ilk harekette imlecin altına zıplar.
        this._grabOffsetX = stageX - this._originX;
        this._grabOffsetY = stageY - this._originY;

        // Grab olmadan imleç aktörün dışına çıktığı anda motion olayları kesilir
        // ve sürükleme yarıda kalır.
        this._grab = global.stage.grab(this._actors[ANA_KATMAN]);

        return Clutter.EVENT_STOP;
    }

    _onMotion(event) {
        if (!this._grab)
            return Clutter.EVENT_PROPAGATE;

        const [stageX, stageY] = event.get_coords();
        this._setOrigin(stageX - this._grabOffsetX, stageY - this._grabOffsetY);

        return Clutter.EVENT_STOP;
    }

    _onRelease() {
        if (!this._grab)
            return Clutter.EVENT_PROPAGATE;

        this._endDrag(true);
        return Clutter.EVENT_STOP;
    }

    /** Grab'i bırak; `save` ise son konumu sıkıştırıp GSettings'e yaz.
     *
     * disable() de buraya uğruyor ama `save: false` ile: kapanış sırasında
     * ayarlara yazmak, yarım kalmış bir sürüklemeyi kalıcılaştırmak olurdu.
     */
    _endDrag(save) {
        if (!this._grab)
            return;

        this._grab.dismiss();
        this._grab = null;

        if (!save)
            return;

        try {
            const [x, y] = this._clamp(this._originX, this._originY);
            this._setOrigin(x, y);

            this._settings.set_int('position-x', x);
            this._settings.set_int('position-y', y);

            console.log(`${LOG} konum kaydedildi (${x}, ${y})`);
        } catch (error) {
            console.error(`${LOG} sürükleme sonu: ${error}`);
        }
    }
}
