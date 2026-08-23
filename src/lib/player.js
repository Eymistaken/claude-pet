/* Kare zamanlaması.
 *
 * PİL: boştayken zamanlayıcı TAMAMEN durur. Tek karelik bir animasyonda ya da
 * `loop: false` olup son karesine gelmiş bir animasyonda hiç timeout
 * kurulmaz — "3 fps'de boş boş dönme" bu projede kabul edilmiyor.
 *
 * Her karenin kendi süresi var (`holds`), o yüzden sabit aralıklı tek bir
 * timeout yetmiyor: her karede bir sonraki için yenisi kuruluyor ve id
 * saklanıyor. `stop()` çağrılmadan hiçbir timeout arkada kalmaz.
 *
 * Bu dosya da kabuğa bağımlı değil (yalnızca GLib) — önizleyici aynı
 * zamanlamayı kullanıyor, yani ritim iki yerde ayrı ayrı yazılmıyor.
 */

import GLib from 'gi://GLib';

const LOG = '[claude-pet]';

export class Player {
    /**
     * @param {object} animations `loadAnimations().animations`
     * @param {Function} onFrame kare değişince çağrılır (yeniden çizim tetiği)
     */
    constructor(animations, onFrame) {
        this._animations = animations ?? {};
        this._onFrame = onFrame ?? (() => {});
        this._anim = null;
        this._index = 0;
        this._loop = false;
        this._timeoutId = 0;
    }

    /** Oynat. `loop` verilmezse animasyonun kendi bayrağı geçerli. */
    play(name, options = {}) {
        const anim = this._animations[name];
        if (!anim) {
            console.warn(`${LOG} animasyon yok: ${name}`);
            return false;
        }

        // Aynı animasyon zaten oynuyorsa baştan başlatma — durum makinesi
        // (Faz 4) aynı durumu üst üste gönderdiğinde animasyon zıplamasın.
        if (this._anim === anim && this._timeoutId)
            return true;

        this._stopTimer();
        this._anim = anim;
        this._loop = options.loop ?? anim.loop;
        this._index = 0;

        this._onFrame();
        this._schedule();
        return true;
    }

    /** Zamanlayıcıyı durdurur. Görünen kare olduğu yerde kalır. */
    stop() {
        this._stopTimer();
    }

    /** O an çizilecek derlenmiş kare, ya da null. */
    currentFrame() {
        return this._anim?.frames[this._index] ?? null;
    }

    /** Oynayan animasyonun adı, ya da null. */
    get currentName() {
        return this._anim?.name ?? null;
    }

    get frameIndex() {
        return this._index;
    }

    /** Zamanlayıcı kurulu mu? Ölçüm/test için. */
    get running() {
        return this._timeoutId !== 0;
    }

    // ------------------------------------------------------------------- iç

    _stopTimer() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = 0;
        }
    }

    _schedule() {
        const anim = this._anim;
        if (!anim)
            return;

        // Tek kare: gösterilecek başka bir şey yok, zamanlayıcı kurma.
        if (anim.frames.length <= 1)
            return;

        // Döngü değil ve son karedeyiz: burada kal, zamanlayıcı kurma.
        if (!this._loop && this._index >= anim.frames.length - 1)
            return;

        const ms = Math.max(1, Math.round(1000 / anim.fps * anim.holds[this._index]));

        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timeoutId = 0;
            this._index = (this._index + 1) % anim.frames.length;
            this._onFrame();
            // Bir sonraki karenin süresi farklı olabilir; yeniden kur.
            this._schedule();
            return GLib.SOURCE_REMOVE;
        });
    }
}
