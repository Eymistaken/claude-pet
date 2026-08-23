/* claude-pet — Faz 0 iskeleti
 *
 * Bu fazda maskot yok: yerinde duran, sürüklenebilen, etrafı tıklama geçiren
 * düz bir dikdörtgen var. Faz 1'de bu St.Widget'in yerini kareleri Cairo ile
 * çizen bir St.DrawingArea alacak; konum, sürükleme ve sökme mantığı aynen
 * kalacak.
 *
 * Bu kod gnome-shell process'inin İÇİNDE çalışıyor: yakalanmamış bir exception
 * kullanıcının bütün masaüstünü düşürür. enable() gövdesi bu yüzden try/catch
 * içinde ve hata hâlinde ne kurulduysa geri alınıyor.
 */

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const LOG = '[claude-pet]';

/** Geçici dikdörtgenin kenarı. Faz 1'de yerini kare boyutu alacak. */
const PET_SIZE = 96;

/** İlk yerleşimde monitör kenarına bırakılan boşluk. */
const MARGIN = 24;

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

        try {
            this._settings = this.getSettings();

            this._pet = new St.Widget({
                name: 'claude-pet',
                reactive: true,
                can_focus: false,
                track_hover: false,
                width: PET_SIZE,
                height: PET_SIZE,
                style: 'background-color: #D06A4B; border-radius: 12px;',
            });

            // affectsInputRegion: true -> girdi bölgesi TAM OLARAK bu aktörün
            // dikdörtgeni kadar; dışındaki her piksel tıklamayı alttaki
            // pencereye geçirir. affectsStruts: false -> pencere yerleşimini
            // bozmaz. trackFullscreen: false -> tam ekran pencerede de görünür.
            Main.layoutManager.addChrome(this._pet, {
                affectsStruts: false,
                affectsInputRegion: true,
                trackFullscreen: false,
            });

            this._restorePosition();
            this._makeDraggable();

            console.log(`${LOG} etkin · konum (${this._pet.x}, ${this._pet.y})`);
        } catch (error) {
            console.error(`${LOG} enable: ${error}`);
            // Yarım kurulmuş bir eklenti bırakma: ne kurulduysa geri al.
            this.disable();
        }
    }

    disable() {
        try {
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

            this._settings = null;
            console.log(`${LOG} kapatıldı`);
        } catch (error) {
            console.error(`${LOG} disable: ${error}`);
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
                x = monitor.x + monitor.width - PET_SIZE - MARGIN;
                y = monitor.y + monitor.height - PET_SIZE - MARGIN;
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

        const centerX = x + PET_SIZE / 2;
        const centerY = y + PET_SIZE / 2;

        const monitor = monitors.find(m =>
            centerX >= m.x && centerX < m.x + m.width &&
            centerY >= m.y && centerY < m.y + m.height)
            ?? Main.layoutManager.primaryMonitor ?? monitors[0];

        const maxX = monitor.x + monitor.width - PET_SIZE;
        const maxY = monitor.y + monitor.height - PET_SIZE;

        return [
            Math.round(Math.max(monitor.x, Math.min(x, maxX))),
            Math.round(Math.max(monitor.y, Math.min(y, maxY))),
        ];
    }

    // -------------------------------------------------------------- sürükleme
    //
    // `Clutter.DragAction` GNOME 46'nın Clutter çatalında YOK (ölçüldü: typelib
    // Clutter-14'te tanımsız; ClickAction/PanAction duruyor, DragAction düşmüş).
    // Kabuğun kendi yolu `global.stage.grab()` + el ile olay takibi —
    // `ui/screenshot.js` ve `ui/slider.js` bunu böyle yapıyor.

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
