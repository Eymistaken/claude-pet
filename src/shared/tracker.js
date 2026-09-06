/* Claude Code'un ne yaptigini izleyen durum takipcisi.
 *
 * `hooks/claude-pet-hook.py` her hook olayinda inbox'a kucuk bir JSON birakiyor;
 * bu dosya onu okuyup TEK BIR genel duruma indirgiyor. Oturum basina durum
 * TUTULMUYOR: son gelen olay kazaniyor. Iki oturum ayni anda calisiyorsa pet
 * en son ne olduysa onu gosterir -- dogru davranis da bu, cunku ekranda tek
 * bir maskot var.
 *
 * YOKLAMA YOK. `Gio.FileMonitor` (inotify) kullaniliyor; bos otururken tek bir
 * zamanlayici bile calismiyor.
 *
 * DIKKAT -- inotify limiti. `fs.inotify.max_user_instances` dolunca
 * `monitor_directory()` hata VERMIYOR, sessizce hicbir olay getirmiyor. Bu
 * mantik hatasi gibi gorunuyor ve saatler yiyor. `tests/replay.js` ise
 * baslamadan once bir kanarya kuruyor; buradaki `start()` de izleyiciyi
 * kuramazsa yuksek sesle uyariyor.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

const LOG = '[claude-pet]';

/** Pet'in bilebilecegi butun durumlar. Faz 4 bunlari animasyona esleyecek. */
export const DURUM = {
    IDLE: 'IDLE',
    WORKING: 'WORKING',
    WAITING: 'WAITING',
};

/** `Notification` icinde "sana soruyor" anlamina gelen tipler.
 *  Diger bildirim tipleri (bilgi amacli olanlar) durumu degistirmiyor. */
const DIKKAT_TIPLERI = new Set([
    'permission_prompt',
    'idle_prompt',
    'agent_needs_input',
]);

/** Hic olay gelmezse WORKING'den IDLE'a dusme suresi.
 *  `sleep-timeout` ayari bunu besliyor (Faz 5); buradaki deger yalnizca
 *  ayar verilmediginde (testler) gecerli. */
const VARSAYILAN_UYKU_MS = 5 * 60 * 1000;

/** Olay dosyalarinin kok dizini. `CLAUDE_PET_STATE_DIR` ile ezilebilir --
 *  hook betigi de ayni degiskene bakiyor, yani test ikisini birden tasiyor. */
export function stateDir() {
    return GLib.getenv('CLAUDE_PET_STATE_DIR') ??
        GLib.build_filenamev([GLib.get_user_state_dir(), 'claude-pet']);
}

export function inboxDir() {
    return GLib.build_filenamev([stateDir(), 'inbox']);
}

export const Tracker = GObject.registerClass({
    GTypeName: 'ClaudePetTracker',
    Signals: {
        /** (durum, rateLimited) — ikisinden biri degisince yayilir. */
        'changed': {param_types: [GObject.TYPE_STRING, GObject.TYPE_BOOLEAN]},
    },
}, class Tracker extends GObject.Object {
    _init(options = {}) {
        super._init();

        this._inboxPath = options.inbox ?? inboxDir();
        this._sleepMs = options.sleepTimeoutMs ?? VARSAYILAN_UYKU_MS;

        this._state = DURUM.IDLE;
        this._rateLimited = false;

        this._monitor = null;
        this._monitorId = 0;
        this._drainId = 0;
        this._sleepId = 0;

        // Olcum/rapor icin: kac olay uygulandi, kac bozuk dosya atildi.
        this._applied = 0;
        this._dropped = 0;
    }

    get state() {
        return this._state;
    }

    get rateLimited() {
        return this._rateLimited;
    }

    get inboxPath() {
        return this._inboxPath;
    }

    get stats() {
        return {applied: this._applied, dropped: this._dropped};
    }

    /** Bosta kalma suresi ayari degisti (MILISANIYE). 0: hic dusme.
     *
     * Calisan bir sayac varsa yeni sureyle yeniden kuruluyor -- yoksa
     * kullanici sureyi kisaltip beklemeye baslasa bile eski sayac dolana
     * kadar hicbir sey olmazdi.
     */
    setSleepTimeout(ms) {
        if (ms === this._sleepMs)
            return;
        this._sleepMs = ms;
        this._armSleep();
    }

    /** Izlemeye basla. Basarisizsa false doner ve neden oldugunu yazar. */
    start() {
        const dir = Gio.File.new_for_path(this._inboxPath);
        try {
            dir.make_directory_with_parents(null);
        } catch (error) {
            if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) {
                console.error(`${LOG} inbox açılamadı: ${error}`);
                return false;
            }
        }

        // Eklenti kapaliyken hook'lar yazmaya devam etmis olabilir. O olaylar
        // artik gecmise ait; uygulanmadan siliniyorlar.
        const kalan = this._purge();

        try {
            this._monitor = dir.monitor_directory(Gio.FileMonitorFlags.NONE, null);
        } catch (error) {
            console.error(`${LOG} inbox izlenemiyor: ${error}`);
            return false;
        }
        if (!this._monitor) {
            console.error(`${LOG} inbox izleyicisi kurulamadı ` +
                '(inotify limiti dolmuş olabilir: make nested-kill)');
            return false;
        }

        this._monitorId = this._monitor.connect('changed',
            (_m, file, _other, type) => this._onEvent(file, type));

        console.log(`${LOG} izleyici kuruldu: ${this._inboxPath}` +
            (kalan ? ` · ${kalan} bayat olay atıldı` : ''));
        return true;
    }

    stop() {
        if (this._monitorId) {
            this._monitor.disconnect(this._monitorId);
            this._monitorId = 0;
        }
        if (this._monitor) {
            this._monitor.cancel();
            this._monitor = null;
        }
        if (this._drainId) {
            GLib.Source.remove(this._drainId);
            this._drainId = 0;
        }
        this._disarmSleep();
    }

    // ------------------------------------------------------------------ okuma

    _onEvent(file, type) {
        // Hook betigi dosyayi inbox'in DISINA yazip buraya rename ediyor, yani
        // bir dosya gorunur olduysa tamdir. CHANGES_DONE_HINT yine de
        // dinleniyor: elle (`echo > dosya`) yazilan bir test dosyasi ancak
        // oyle tamamlanir.
        if (type !== Gio.FileMonitorEvent.CREATED &&
            type !== Gio.FileMonitorEvent.MOVED_IN &&
            type !== Gio.FileMonitorEvent.CHANGES_DONE_HINT)
            return;

        void file;
        this._queueDrain();
    }

    /** Bosaltmayi tek bir idle'a topla.
     *
     * Bir arac cagrisi patlamasinda onlarca olay ust uste gelebiliyor; her
     * biri icin ayri ayri dizin taramak yerine hepsi tek turda okunuyor.
     * Ayrica sirayi da bu garanti ediyor: dosya adlari nanosaniye ile
     * basladigi icin sirali okuma = olaylarin gercek sirasi.
     */
    _queueDrain() {
        if (this._drainId)
            return;
        this._drainId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._drainId = 0;
            try {
                this._drain();
            } catch (error) {
                console.error(`${LOG} inbox okunamadı: ${error}`);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _drain() {
        const dir = Gio.File.new_for_path(this._inboxPath);
        const adlar = this._listNames(dir);

        for (const ad of adlar) {
            const yol = GLib.build_filenamev([this._inboxPath, ad]);
            const olay = this._read(yol);
            // Okunsun ya da okunmasin dosya gidiyor: bozuk bir dosya inbox'ta
            // kalirsa her olayda yeniden ayristirilmaya calisilir.
            this._delete(yol);
            if (olay) {
                this._applied++;
                this._apply(olay);
            } else {
                this._dropped++;
            }
        }
    }

    _listNames(dir) {
        const adlar = [];
        let enumerator;
        try {
            enumerator = dir.enumerate_children('standard::name',
                Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        } catch (error) {
            console.error(`${LOG} inbox listelenemedi: ${error}`);
            return adlar;
        }
        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            const ad = info.get_name();
            // Nokta ile baslayanlar yarim yazma izleri; onlara dokunulmuyor.
            if (!ad.startsWith('.'))
                adlar.push(ad);
        }
        enumerator.close(null);
        // Nanosaniye oneki sayesinde alfabetik sira = zaman sirasi.
        return adlar.sort();
    }

    /** Tek bir olay dosyasini oku. Bozuksa null (ve bir uyari). */
    _read(yol) {
        try {
            const [ok, bytes] = GLib.file_get_contents(yol);
            if (!ok)
                return null;
            const olay = JSON.parse(new TextDecoder().decode(bytes));
            if (!olay || typeof olay.hook_event_name !== 'string')
                return null;
            return olay;
        } catch (error) {
            // Bozuk veri pet'i susturur, shell'i degil.
            console.warn(`${LOG} bozuk olay dosyası atlandı (${GLib.path_get_basename(yol)}): ${error}`);
            return null;
        }
    }

    _delete(yol) {
        try {
            Gio.File.new_for_path(yol).delete(null);
        } catch (error) {
            console.warn(`${LOG} olay dosyası silinemedi: ${error}`);
        }
    }

    /** Inbox'taki her seyi uygulamadan sil. Doner: silinen dosya sayisi. */
    _purge() {
        const dir = Gio.File.new_for_path(this._inboxPath);
        const adlar = this._listNames(dir);
        for (const ad of adlar)
            this._delete(GLib.build_filenamev([this._inboxPath, ad]));
        return adlar.length;
    }

    // ------------------------------------------------------------ durum gecisi

    _apply(olay) {
        switch (olay.hook_event_name) {
        case 'UserPromptSubmit':
        case 'PreToolUse':
            // WAITING'den cikisin iki yolu bunlar. Is yeniden yurudugu icin
            // rate limit bayragi da burada dusuyor.
            this._set(DURUM.WORKING, false);
            break;

        case 'PermissionRequest':
            this._set(DURUM.WAITING);
            break;

        case 'Notification':
            if (DIKKAT_TIPLERI.has(olay.notification_type))
                this._set(DURUM.WAITING);
            // Diger bildirim tipleri bilgi amacli; durum DEGISMEZ.
            break;

        case 'Stop':
        case 'SessionEnd':
            this._set(DURUM.IDLE);
            break;

        case 'StopFailure':
            // Rate limit ozel: Faz 4'te laptop animasyonsuz, aniden kayboluyor.
            this._set(DURUM.IDLE, olay.error_type === 'rate_limit');
            break;

        // Bilinmeyen olay: kaydolmadigimiz bir sey gelmis. Sessizce yok say.
        }
    }

    /** Durumu (ve istege bagli rate limit bayragini) ayarla, degistiyse yay. */
    _set(state, rateLimited) {
        const yeniBayrak = rateLimited === undefined ? this._rateLimited : rateLimited;
        if (state === this._state && yeniBayrak === this._rateLimited) {
            // Durum aynı kalsa da is devam ediyor demektir: uyku sayacini tazele.
            this._armSleep();
            return;
        }

        this._state = state;
        this._rateLimited = yeniBayrak;
        this._armSleep();
        this.emit('changed', this._state, this._rateLimited);
    }

    // --------------------------------------------------------------- uyku

    /** Uyku sayacini YALNIZCA WORKING'de kur.
     *
     * IDLE'da kurmanin anlami yok. WAITING'de ise kurulmamali: pet sana
     * soruyorsa, sen cevap verene kadar sormaya devam etmeli. Prompt'un
     * "WAITING'den cikis yalnizca su dort olay" kurali zaten bunu soyluyor;
     * zaman asimi o listede yok.
     */
    _armSleep() {
        this._disarmSleep();
        if (this._state !== DURUM.WORKING || this._sleepMs <= 0)
            return;

        this._sleepId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._sleepMs, () => {
            this._sleepId = 0;
            // Uzun suredir hicbir hook gelmedi: oturum bitmis ama `Stop`
            // yazilamadan kapanmis olabilir.
            this._state = DURUM.IDLE;
            this.emit('changed', this._state, this._rateLimited);
            return GLib.SOURCE_REMOVE;
        });
    }

    _disarmSleep() {
        if (this._sleepId) {
            GLib.Source.remove(this._sleepId);
            this._sleepId = 0;
        }
    }
});
