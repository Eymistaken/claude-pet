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
 *
 * TUR BİLDİRİMİ (Faz 4): bir klip tam bir turu bitirdiğinde `onCycle`
 * çağrılıyor. Yönetmen animasyonu ortasından kesmemek için buna bakıyor —
 * durum değişse bile çalan klip turunu tamamlıyor.
 *
 * DONDURMA (Faz 5): sağ tık menüsü açıkken animasyon duruyor. `stop()`'tan
 * farkı, `thaw()`'un KALDIĞI KAREDEN sürdürmesi — menü kapanınca klip baştan
 * başlamıyor. Biten (döngüsüz, son karesi dolmuş) bir klip `_finished` ile
 * işaretleniyor, yoksa `thaw()` ikinci bir tur bildirimi üretirdi.
 */

import GLib from 'gi://GLib';

const LOG = '[claude-pet]';

export class Player {
    /**
     * @param {object} animations `loadAnimations().animations`
     * @param {Function} onFrame kare değişince çağrılır (yeniden çizim tetiği)
     * @param {Function} onCycle klip bir TURU tamamlayınca çağrılır — yönetmen
     *   animasyonu ortasından kesmemek için buna bakıyor (Faz 4)
     */
    constructor(animations, onFrame, onCycle) {
        this._animations = animations ?? {};
        this._onFrame = onFrame ?? (() => {});
        this._onCycle = onCycle ?? (() => {});
        this._anim = null;
        this._index = 0;
        this._loop = false;
        this._timeoutId = 0;
        // Döngüsüz bir klip son karesini de gösterip bitti mi? `thaw()` buna
        // bakıyor: biten klibi yeniden zamanlamak ikinci bir `onCycle` demek.
        this._finished = false;
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
        this._finished = false;

        this._onFrame();
        this._schedule();
        return true;
    }

    /** Zamanlayıcıyı durdurur. Görünen kare olduğu yerde kalır. */
    stop() {
        this._stopTimer();
    }

    /** Zamanlayıcıyı durdur, kareyi dondur. `thaw()` kaldığı yerden sürdürür.
     *
     * Menü açıkken kullanılıyor (Faz 5). `stop()` ile aynı işi yapıyor ama
     * niyeti farklı: `stop()` kapanış, bu geçici bir duraklama.
     */
    freeze() {
        this._stopTimer();
    }

    /** Donmuş klibi kaldığı KAREDEN sürdür. Biten klip yeniden başlamaz. */
    thaw() {
        if (this._anim && !this._finished && !this._timeoutId)
            this._schedule();
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

        const sonKare = this._index >= anim.frames.length - 1;

        // TEK KARELİK DÖNGÜ (idle, waiting): gösterilecek başka kare yok ve
        // bitiş de yok. Zamanlayıcı hiç kurulmuyor — "boştayken sıfır timer"
        // kuralı. Tur bildirimi de olmuyor; çağıran `running === false`
        // gördüğünde beklemeden geçebileceğini anlar.
        if (sonKare && this._loop && anim.frames.length <= 1)
            return;

        const ms = Math.max(1, Math.round(1000 / anim.fps * anim.holds[this._index]));

        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this._timeoutId = 0;

            if (sonKare) {
                // TUR BİTTİ. Son kare de kendi `hold` süresince duruyor —
                // bildirim ancak o dolduktan sonra gidiyor, yoksa klibin son
                // pozu hiç görünmeden kesilirdi.
                if (this._loop) {
                    this._index = 0;
                    this._onFrame();
                    this._schedule();
                } else {
                    this._finished = true;
                }
                // Sıradaki klibe geçiş kararı yönetmenin; burada yalnızca
                // haber veriliyor. Döngüde de haber gidiyor, çünkü "turu
                // bitirmesini bekle" kuralı asıl orada işliyor.
                this._onCycle(anim.name);
                return GLib.SOURCE_REMOVE;
            }

            this._index++;
            this._onFrame();
            // Bir sonraki karenin süresi farklı olabilir; yeniden kur.
            this._schedule();
            return GLib.SOURCE_REMOVE;
        });
    }
}
