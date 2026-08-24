/* Yönetmen: durumu koreografiye çevirir.
 *
 * `tracker` ne olduğunu söylüyor (IDLE/WORKING/WAITING), `states.js` hangi
 * kliplerin oynayacağını söylüyor, burası SIRAYI ve ZAMANLAMAYI kuruyor.
 *
 * İKİ KURAL BU DOSYANIN TAMAMINI AÇIKLAR:
 *
 * 1. KOD YAZMA MODU YAPIŞKAN. `WORKING` bir kez girildi mi, araya giren araç
 *    çağrıları laptobu kaldırmıyor — Claude hâlâ aynı işin içinde. Her
 *    çağrıda laptobu cebe koyup çıkarmak hem titrek durur hem yanlış anlatır.
 *    Uygulaması tek satır: aynı duruma tekrar girilirse hiçbir şey yapma.
 *
 * 2. ANIMASYON ORTASINDAN KESİLMEZ. Durum değişince çalan klip turunu
 *    bitiriyor, geçiş ondan sonra başlıyor. Bekleme kısa (`typing` turu
 *    1.73 sn) ve karşılığında hareket kopuk değil akıcı görünüyor.
 *    Tek istisna rate limit: orada anilik BİLEREK var.
 *
 * DURDURMANIN İKİ TÜRÜ VAR (Faz 5) ve ikisi de yeni klip başlatmıyor:
 *   duraklatma — kullanıcı istedi. Pet NÖTR poza geçiyor (`idle`), çünkü
 *     "duraklattım" demek "kutuya girmiş bir maskot" değil, dinlenen bir
 *     maskot demek. Takip sürüyor: hedef durum kaydediliyor, devam edilince
 *     pet oraya geçiş yaparak dönüyor.
 *   menü açık — geçici. Kare OLDUĞU GİBİ donuyor (`player.freeze()`), menü
 *     kapanınca kaldığı kareden sürüyor.
 *
 * `St`, `Main`, `global` geçmiyor — klip oynatma çağıranın verdiği geri
 * çağrıdan geçiyor, çünkü actor'leri kliplerin sınırlayıcı kutularına göre
 * boyutlandırmak `extension.js`'in işi (Faz 2).
 */

import GLib from 'gi://GLib';

import {STATE_ANIM, resolve, sequence} from './states.js';

const LOG = '[claude-pet]';

/** Boşta uyku klibi. Varlıkta yoksa uyku hiç kurulmuyor. */
const UYKU_KLIBI = 'sleep';

/** Boşta kalınca uykuya geçme süresi. `sleep-timeout` ayarı bunu besliyor;
 *  buradaki değer yalnızca ayar verilmediğinde (testler) geçerli. */
const VARSAYILAN_UYKU_MS = 3 * 60 * 1000;

export class Director {
    /**
     * @param {object} animations derlenmiş klip tablosu
     * @param {Function} play (ad, {loop}) → bool · klibi oynatır, actor'leri
     *   o klibin birleşim kutularına göre boyutlar
     * @param {Function} isRunning zamanlayıcı kurulu mu (tur devam ediyor mu)
     * @param {number} sleepTimeoutMs boşta uyku süresi
     */
    constructor({animations, play, isRunning, sleepTimeoutMs} = {}) {
        this._animations = animations ?? {};
        this._play = play ?? (() => false);
        this._isRunning = isRunning ?? (() => false);
        this._sleepMs = sleepTimeoutMs ?? VARSAYILAN_UYKU_MS;

        // Pet'in şu an bulunduğu durum ve gitmek istediği durum. İkisi
        // ayrıldığı anda bir geçiş dizisi kuruluyor.
        this._current = 'IDLE';
        this._target = 'IDLE';

        // Sırada bekleyen klipler. Son eleman döngüde döner, öncekiler bir kez.
        this._queue = [];

        this._sleepId = 0;

        // İki ayrı sebeple durmuş olabiliriz; ikisi de yeni klip başlatmıyor.
        this._paused = false;
        this._menuOpen = false;
    }

    get state() {
        return this._current;
    }

    get paused() {
        return this._paused;
    }

    /** Yeni klip başlatmanın yasak olduğu her durum. */
    get _held() {
        return this._paused || this._menuOpen;
    }

    /** Açılış pozu. */
    start() {
        this._playClip(STATE_ANIM.IDLE, true);
        this._armSleep();
    }

    stop() {
        this._disarmSleep();
        this._queue = [];
    }

    /** `tracker.changed` buraya bağlanıyor. */
    setState(state, rateLimited) {
        this._disarmSleep();

        // TUTULMUŞKEN de takip sürüyor: ne olduğu kaydediliyor, oynatılmıyor.
        // Devam edilince `_sync()` aradaki farkı kapatıyor.
        if (this._held) {
            this._target = state;
            return;
        }

        // RATE LIMIT — kural 5. Geçiş klibi YOK: `laptop_away` oynatılmıyor,
        // doğrudan `idle`'a geçiliyor. Laptop actor'ünü ayrıca gizlemeye
        // gerek yok, çünkü `idle` klibinde laptop katmanı hiç bulunmuyor;
        // Faz 2'nin "katman boşsa actor'ü gizle" yolu işi kendiliğinden
        // yapıyor. Anilik kasıtlı: bir şey ters gitti, animasyonlu bir
        // kapanış yanlış ton olurdu.
        if (rateLimited && state === 'IDLE') {
            this._queue = [];
            this._current = 'IDLE';
            this._target = 'IDLE';
            this._playClip(STATE_ANIM.IDLE, true);
            console.log(`${LOG} yönetmen: rate limit · laptop animasyonsuz kayboldu`);
            this._armSleep();
            return;
        }

        // Kural 1: aynı duruma tekrar girmek hiçbir şey yapmaz.
        if (state === this._target) {
            this._armSleep();
            return;
        }

        this._target = state;
        this._sync();
    }

    /** Player bir klibin turunu bitirdiğinde çağrılıyor. */
    onCycle(_name) {
        // Duraklatma/menü tam da tur biterken gelmiş olabilir: donmuş bir
        // player artık tur bildirmez ama yoldaki bildirim yeni klip başlatmasın.
        if (this._held)
            return;

        // Dizi çalarken hedef değiştiyse kalanını bırak, yeniden planla.
        if (this._target !== this._current) {
            this._begin();
            return;
        }
        this._next();
    }

    // ------------------------------------------------------- duraklat / menü

    /** Kullanıcı duraklattı ya da devam etti (`paused` ayarı).
     *
     * Duraklatınca `_current` NÖTR sayılıyor (`IDLE`), çünkü ekranda gerçekten
     * o poz var. Mantıksal durum `_target`ta duruyor, yani devam edilince
     * `sequence(IDLE → hedef)` kendiliğinden doğru geçişi kuruyor — ayrı bir
     * "devam" yolu yazmaya gerek kalmıyor.
     */
    setPaused(paused) {
        paused = !!paused;
        if (paused === this._paused)
            return;
        this._paused = paused;

        if (paused) {
            this._disarmSleep();
            this._queue = [];
            this._current = 'IDLE';
            this._playClip(STATE_ANIM.IDLE, true);
            console.log(`${LOG} yönetmen: duraklatıldı · nötr kare`);
            return;
        }

        console.log(`${LOG} yönetmen: devam · hedef ${this._target}`);
        this._sync();
    }

    /** Sağ tık menüsü açıldı/kapandı. Kareyi donduran taraf çağıran
     *  (`player.freeze()`); burada yalnızca yeni klip başlatılmıyor. */
    setMenuOpen(open) {
        open = !!open;
        if (open === this._menuOpen)
            return;
        this._menuOpen = open;

        if (open) {
            this._disarmSleep();
            return;
        }
        this._sync();
    }

    /** Uyku süresi ayarı değişti (saniye değil MİLİSANİYE). */
    setSleepTimeout(ms) {
        if (ms === this._sleepMs)
            return;
        this._sleepMs = ms;
        this._armSleep();
    }

    // -------------------------------------------------------------------- iç

    _sync() {
        if (this._held)
            return;

        if (this._target === this._current && this._queue.length === 0) {
            this._armSleep();
            return;
        }

        // Kural 2: çalan klip turunu bitirsin. Bittiğinde `onCycle` bizi
        // geri çağıracak ve plan orada kurulacak.
        if (this._isRunning())
            return;

        this._begin();
    }

    /** `_current` → `_target` geçiş dizisini kur ve ilk klibi başlat. */
    _begin() {
        this._queue = sequence(this._current, this._target);
        console.log(`${LOG} yönetmen: ${this._current} → ${this._target} · ` +
            this._queue.join(' → '));
        this._current = this._target;
        this._next();
    }

    _next() {
        if (this._queue.length === 0) {
            this._armSleep();
            return;
        }

        const ad = this._queue.shift();
        // Dizinin SON klibi döngüde döner, öncekiler bir kez oynar. Bayrak
        // varlıktan değil buradan geliyor: sıra kliplerin kendi `loop`
        // değerine değil, dizideki yerine bağlı.
        this._playClip(ad, this._queue.length === 0);

        // Son klip tek karelik bir döngüyse (idle, waiting) zamanlayıcı hiç
        // kurulmuyor, yani `onCycle` de hiç gelmeyecek — uykuyu burada kur.
        if (this._queue.length === 0 && !this._isRunning())
            this._armSleep();
    }

    _playClip(name, loop) {
        const gercek = resolve(this._animations, name);
        if (gercek)
            this._play(gercek, {loop});
    }

    // ------------------------------------------------------------------ uyku

    /** Uyku sayacı YALNIZCA IDLE'da ve yalnızca varlıkta `sleep` klibi varsa.
     *  Uykuda tek kare gösteriliyor, yani zamanlayıcı tamamen duruyor. */
    _armSleep() {
        this._disarmSleep();

        if (this._held)
            return;
        if (this._current !== 'IDLE' || this._sleepMs <= 0)
            return;
        if (!this._animations[UYKU_KLIBI])
            return;

        this._sleepId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._sleepMs, () => {
            this._sleepId = 0;
            console.log(`${LOG} yönetmen: boşta · uykuya geçiliyor`);
            this._playClip(UYKU_KLIBI, true);
            return GLib.SOURCE_REMOVE;
        });
    }

    _disarmSleep() {
        if (this._sleepId) {
            GLib.Source.remove(this._sleepId);
            this._sleepId = 0;
        }
    }
}
