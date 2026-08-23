/* claude-pet — maskot aktörü
 *
 * Kareler `assets/animations.json` içinde; bu dosya onları yükleyip
 * `St.DrawingArea` üzerine çizdiriyor ve aktörü sürüklenebilir tutuyor.
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
import {drawFrame} from './lib/sprite.js';
import {Player} from './lib/player.js';

const LOG = '[claude-pet]';

/** Bir hücrenin ölçeklenmemiş piksel kenarı. */
const BASE_CELL = 3;

/** İlk yerleşimde monitör kenarına bırakılan boşluk. */
const MARGIN = 24;

/* Faz 1'de durum makinesi yok: tek animasyon döngüde oynuyor.
 * Faz 4'te `lib/states.js` bunu devralacak. */
const GECICI_ANIMASYON = 'laptop_code';

export default class ClaudePetExtension extends Extension {
    enable() {
        // Alanlar en başta tanımlı: enable() yarıda kalırsa disable() yine de
        // tutarlı bir nesne üstünde çalışsın.
        this._pet = null;
        this._settings = null;
        this._signals = [];
        this._grab = null;
        this._grabOffsetX = 0;
        this._grabOffsetY = 0;
        this._player = null;
        this._sheet = null;
        this._cell = BASE_CELL;

        try {
            this._settings = this.getSettings();

            this._sheet = loadAnimations(
                GLib.build_filenamev([this.path, 'assets', 'animations.json']));

            // Ölçek bir kez okunuyor. Ölçek değişikliğini izlemek Faz 5'in işi.
            const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            this._cell = Math.max(1, Math.round(BASE_CELL * scale));

            this._pet = new St.DrawingArea({
                name: 'claude-pet',
                reactive: true,
                can_focus: false,
                track_hover: false,
                width: this._sheet.w * this._cell,
                height: this._sheet.h * this._cell,
            });

            this._connectPet('repaint', () => this._onRepaint());

            // affectsInputRegion: true -> niyet belgesi. DİKKAT: Wayland'de bu
            // seçenek bir şey YAPMIYOR (layout.js: `wantsInputRegion = … &&
            // !Meta.is_wayland_compositor()`); tıklamayı aktörün kendisine
            // getiren şey `reactive`. Süs parçaları Faz 2'de `reactive: false`
            // ile eklenecek. affectsStruts: false -> pencere yerleşimini bozmaz.
            // trackFullscreen: false -> tam ekran pencerede de görünür.
            Main.layoutManager.addChrome(this._pet, {
                affectsStruts: false,
                affectsInputRegion: true,
                trackFullscreen: false,
            });

            this._restorePosition();
            this._makeDraggable();

            this._player = new Player(this._sheet.animations,
                () => this._pet?.queue_repaint());
            this._startAnimation();

            console.log(`${LOG} etkin · konum (${this._pet.x}, ${this._pet.y}) · ` +
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

            // Sürüklemenin ORTASINDA kapatılıyor olabiliriz: kilit ekranı
            // disable() çağırıyor. Bırakılmamış bir Clutter.Grab bütün girdiyi
            // kilitler — aktörü yok etmeden önce mutlaka bırak.
            this._endDrag(false);

            // Sinyaller aktörden ÖNCE koparılıyor: destroy() sırasında tetiklenen
            // bir geri çağrı yok olmuş alanlara uzanmasın.
            for (const [object, id] of this._signals ?? [])
                object.disconnect(id);
            this._signals = [];

            if (this._pet) {
                Main.layoutManager.removeChrome(this._pet);
                this._pet.destroy();
                this._pet = null;
            }

            this._sheet = null;
            this._settings = null;
            console.log(`${LOG} kapatıldı`);
        } catch (error) {
            console.error(`${LOG} disable: ${error}`);
        }
    }

    // ------------------------------------------------------------------ çizim

    _onRepaint() {
        const cr = this._pet.get_context();
        try {
            drawFrame(cr, this._player?.currentFrame(), this._sheet.colors, this._cell);
        } catch (error) {
            console.error(`${LOG} çizim: ${error}`);
        } finally {
            // GJS'de Cairo bağlamı elle bırakılmazsa sızıyor (klasik tuzak).
            cr.$dispose();
        }
    }

    _startAnimation() {
        // Faz 1 geçici davranışı: tek klip döngüde. Varlık dosyasında
        // `loop: false` yazıyor çünkü Faz 4'te üçe bölünecek; burada
        // döngü bilerek zorlanıyor.
        if (!this._player.play(GECICI_ANIMASYON, {loop: true})) {
            // O animasyon yoksa (bozuk varlık) eldeki ilk animasyona düş.
            const ilk = Object.keys(this._sheet.animations)[0];
            if (ilk)
                this._player.play(ilk, {loop: true});
        }
    }

    // ------------------------------------------------------------------ konum

    /** Kayıtlı konuma yerleştir; kayıt yoksa birincil monitörün sağ altına. */
    _restorePosition() {
        let x = this._settings.get_int('position-x');
        let y = this._settings.get_int('position-y');

        if (x < 0 || y < 0) {
            const monitor = Main.layoutManager.primaryMonitor;
            if (monitor) {
                x = monitor.x + monitor.width - this._pet.width - MARGIN;
                y = monitor.y + monitor.height - this._pet.height - MARGIN;
            } else {
                // Monitör tablosu henüz hazır değilse ekranın dışına düşmektense
                // sol üste yakın dur; ilk sürüklemede zaten düzelir.
                x = MARGIN;
                y = MARGIN;
            }
        }

        const [cx, cy] = this._clamp(x, y);
        this._pet.set_position(cx, cy);
    }

    /** Verilen konumu bir monitörün içine sıkıştır.
     *
     * Hangi monitör: aktörün MERKEZİNİ içeren monitör. Hiçbiri içermiyorsa
     * (monitör çıkarılmış, kayıtlı konum artık boşlukta kalmış) birincile
     * düşülür — yoksa pet erişilemez bir yerde belirir.
     */
    _clamp(x, y) {
        const monitors = Main.layoutManager.monitors;
        if (!monitors?.length)
            return [Math.round(x), Math.round(y)];

        const w = this._pet.width;
        const h = this._pet.height;
        const centerX = x + w / 2;
        const centerY = y + h / 2;

        const monitor = monitors.find(m =>
            centerX >= m.x && centerX < m.x + m.width &&
            centerY >= m.y && centerY < m.y + m.height)
            ?? Main.layoutManager.primaryMonitor ?? monitors[0];

        return [
            Math.round(Math.max(monitor.x, Math.min(x, monitor.x + monitor.width - w))),
            Math.round(Math.max(monitor.y, Math.min(y, monitor.y + monitor.height - h))),
        ];
    }

    // -------------------------------------------------------------- sürükleme
    //
    // `Clutter.DragAction` GNOME 46'nın Clutter çatalında YOK (ölçüldü: typelib
    // Clutter-14'te tanımsız). Kabuğun kendi yolu kullanılıyor:
    // `global.stage.grab()` + el ile olay takibi — `ui/screenshot.js` ve
    // `ui/slider.js` bunu böyle yapıyor.

    _makeDraggable() {
        this._connectPet('button-press-event', (_actor, event) => this._onPress(event));
        this._connectPet('motion-event', (_actor, event) => this._onMotion(event));
        this._connectPet('button-release-event', () => this._onRelease());
    }

    _connectPet(signal, handler) {
        const id = this._pet.connect(signal, handler);
        this._signals.push([this._pet, id]);
    }

    _onPress(event) {
        if (event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;

        const [stageX, stageY] = event.get_coords();

        // İmlecin aktör İÇİNDEKİ göreli yeri sürükleme boyunca sabit kalmalı;
        // yoksa pet ilk harekette imlecin altına zıplar.
        this._grabOffsetX = stageX - this._pet.x;
        this._grabOffsetY = stageY - this._pet.y;

        // Grab olmadan imleç aktörün dışına çıktığı anda motion olayları kesilir
        // ve sürükleme yarıda kalır.
        this._grab = global.stage.grab(this._pet);

        return Clutter.EVENT_STOP;
    }

    _onMotion(event) {
        if (!this._grab)
            return Clutter.EVENT_PROPAGATE;

        const [stageX, stageY] = event.get_coords();
        this._pet.set_position(
            Math.round(stageX - this._grabOffsetX),
            Math.round(stageY - this._grabOffsetY));

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
            const [x, y] = this._clamp(this._pet.x, this._pet.y);
            this._pet.set_position(x, y);

            this._settings.set_int('position-x', x);
            this._settings.set_int('position-y', y);

            console.log(`${LOG} konum kaydedildi (${x}, ${y})`);
        } catch (error) {
            console.error(`${LOG} sürükleme sonu: ${error}`);
        }
    }
}
