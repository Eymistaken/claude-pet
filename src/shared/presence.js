/* Claude acik mi? -- pet'in var olma sarti.
 *
 * Pet yalnizca Claude calisirken duruyor. "Calismak" ekranda gorunmek DEGIL:
 * masaustu uygulamasi arka planda, kucultulmus, baska pencerenin altinda
 * olabilir; surec ayaktaysa pet de ayakta.
 *
 * NEDEN PENCERE DEGIL SUREC. `Shell.AppSystem` uygulamalari PENCERELERINDEN
 * taniyor: penceresi olmayan (tepsiye inmis, yeni acilmis, kapanmakta olan)
 * bir uygulama "calismiyor" gorunur. Ustelik terminalde acilan `claude` hic
 * pencere sahibi olmuyor -- pencereyi terminal emulatoru tutuyor. Surec
 * listesi iki durumu da tek olcutle cevapliyor.
 *
 * OLCULDU (bu makinede): iki `comm` degeri yetiyor --
 *   claude-desktop  · /usr/lib/claude-desktop/claude-desktop (ve alt surecleri)
 *   claude          · ~/.config/Claude/claude-code/<surum>/claude, terminalde
 *                     acilan Claude Code de ayni ada sahip
 * `comm` 15 karaktere kirpiliyor; ikisi de siginiyor (14 ve 6).
 *
 * YOKLAMA BURADA KACINILMAZ. Surec dogusu/olumu icin ayricalik istemeyen bir
 * olay kaynagi yok (proc connector CAP_NET_ADMIN istiyor). Bedeli olculdu ve
 * kucultuldu:
 *   tam tarama  : 365 surec, ~5.7 ms   -- yalnizca Claude KAPALIYKEN
 *   hizli yol   : tek dosya, ~0.05 ms  -- Claude ACIKKEN (pid onbellekte)
 * Yani asil kullanim halinde (Claude acik) yoklama neredeyse bedava; pahali
 * hal ise pet'in zaten gizli oldugu haldir.
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

const LOG = '[claude-pet]';

/** Aranan surec adlari. */
export const SURECLER = ['claude-desktop', 'claude'];

/** Aranan adlari degistirmenin test yolu: `CLAUDE_PET_PROCESSES=sleep`.
 *
 * NEDEN GEREKLI: bu ozelligin "kapali" halini gercek kabukta denemek, denemeyi
 * yapan kisinin Claude'unu kapatmasini gerektirirdi -- ki Claude Code'un
 * kendisi de o Claude. Test oturumunda aranan ad `sleep` yapilinca varlik
 * elle acilip kapatilabiliyor. `CLAUDE_PET_STATE_DIR` ile ayni fikir.
 */
export function surecAdlari() {
    const ozel = GLib.getenv('CLAUDE_PET_PROCESSES');
    if (!ozel)
        return SURECLER;
    return ozel.split(',').map(a => a.trim()).filter(a => a.length > 0);
}

/* ARALIK IKI TURLU, cunku maliyet iki turlu.
 *
 * Claude ACIKKEN kontrol tek dosya okuyor (~0.05 ms): sik sorulabilir, pet'in
 * kapanisi da o kadar cabuk gorunur.
 * Claude KAPALIYKEN her seferinde tam tarama gerekiyor (365 surec, ~5.7 ms):
 * seyrek sorulur. Gecikmenin bedeli kucuk -- pet birkac saniye gec cikar --
 * ve Claude Code tarafinda zaten telafisi var: ilk hook olayi geldigi anda
 * `poke()` yoklamayi beklemeden bakiyor.
 *
 * Olculdu: acikken ~%0.003, kapaliyken ~%0.07 (tek cekirdek).
 */
const ARALIK_ACIK_MS = 2000;
const ARALIK_KAPALI_MS = 8000;

/** Bir surecin adini oku. Surec olduyse ya da ZOMBIYSE null.
 *
 * `/proc/<pid>/comm` yerine `/proc/<pid>/stat` okunuyor, cunku stat ad ile
 * DURUMU birlikte veriyor ve maliyeti ayni (tek dosya). Zombi ayrimi sart:
 * oldurulmus ama ebeveyni tarafindan henuz toplanmamis bir surecin
 * `/proc/<pid>` dizini duruyor ve `comm`u hala adini veriyor -- yani "claude
 * kapandi" olayi, zombi toplanana kadar hic gelmeyebilirdi. (Testte birebir
 * yasandi: `sleep` oldurulduktan sonra varlik "hala acik" demeye devam etti.)
 *
 * Ayristirma elle: `comm` alani parantez ICINDE ve bosluk/parantez
 * icerebiliyor, o yuzden SON ')' aranıyor -- alan sirasina gore bolmek
 * "claude (dev)" gibi bir adda bozulurdu.
 */
function surecDurumu(pid) {
    let metin;
    try {
        const [ok, bytes] = GLib.file_get_contents(`/proc/${pid}/stat`);
        if (!ok)
            return null;
        metin = new TextDecoder().decode(bytes);
    } catch (_error) {
        // Surec tarama sirasinda kayboldu: hata degil, normal.
        return null;
    }

    const bas = metin.indexOf('(');
    const son = metin.lastIndexOf(')');
    if (bas < 0 || son < bas)
        return null;

    const ad = metin.slice(bas + 1, son);
    const durum = metin.slice(son + 2, son + 3);
    // Z: zombi, X/x: olmus. Ikisi de "calisiyor" sayilmaz.
    if (durum === 'Z' || durum === 'X' || durum === 'x')
        return null;

    return ad;
}

export const Presence = GObject.registerClass({
    GTypeName: 'ClaudePetPresence',
    Signals: {
        /** (var mi, ad) -- yalnizca DEGISINCE yayiliyor. */
        'changed': {param_types: [GObject.TYPE_BOOLEAN, GObject.TYPE_STRING]},
        /** HER yoklamada, durum degismese de. Zaten donen tek zamanlayiciya
         *  binmek isteyenler icin: yonetmenin bekcisi bunu kullaniyor, boylece
         *  periyodik bir is icin ikinci bir timer kurulmuyor. */
        'tick': {},
    },
}, class Presence extends GObject.Object {
    _init(options = {}) {
        super._init();

        this._names = new Set(options.names ?? surecAdlari());
        // Test tek bir aralik verebiliyor; uretimde iki turlu.
        this._acikMs = options.intervalMs ?? ARALIK_ACIK_MS;
        this._kapaliMs = options.intervalMs ?? ARALIK_KAPALI_MS;

        this._present = false;
        this._pid = 0;          // bulunan surec: hizli yolun dayanagi
        this._name = '';
        this._timeoutId = 0;
        // Yoklama istenip istenmedigi. Zamanlayicinin varligindan AYRI:
        // geri cagri icinde `stop()` cagrilirsa tur sonundaki yeniden kurma
        // buna bakip vazgeciyor.
        this._running = false;

        // Olcum: kac kez tam tarama yapildi, kac kez hizli yol yetti.
        this._fullScans = 0;
        this._fastChecks = 0;
    }

    get present() {
        return this._present;
    }

    get name() {
        return this._name;
    }

    get stats() {
        return {fullScans: this._fullScans, fastChecks: this._fastChecks};
    }

    /** Ilk cevabi HEMEN verir (donus degeri), sonra yoklamaya baslar.
     *  Boylece Claude kapaliyken pet bir kare bile gorunmuyor. */
    start() {
        this._running = true;
        this._present = this._check();
        this._arm();
        return this._present;
    }

    /** O anki duruma gore yoklama araligi. */
    get _intervalMs() {
        return this._present ? this._acikMs : this._kapaliMs;
    }

    stop() {
        this._running = false;
        this._disarm();
    }

    /** Disaridan "simdi bak" demek icin: hook olayi geldiginde bir Claude
     *  surecinin yeni dogmus olmasi cok muhtemel, yoklamayi bekleme.
     *
     * Yoklama kapaliyken (genel anahtar kapali) hicbir sey yapmiyor: kapali
     * bir pet hicbir sey tuketmesin kurali burada da gecerli. */
    poke() {
        if (!this._running)
            return;
        this._tick();
        // Siradaki tur bu andan itibaren sayilsin; az once zaten baktik.
        this._arm();
    }

    // ------------------------------------------------------------------- ic

    _disarm() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = 0;
        }
    }

    /* TEK ATIMLIK, HER TURDA YENIDEN KURULAN.
     *
     * Onceki hâli `SOURCE_CONTINUE` donduruyor ve aralik degisince `_tick()`in
     * ICINDEN `_arm()` cagiriyordu -- yani O AN DISPATCH EDILEN kaynagi
     * `GLib.Source.remove()` ile siliyordu. Calisiyordu, ama
     * "Source ID N was not found when attempting to remove it" uyarisini
     * ureten kalip tam olarak budur. Simdi geri cagri once kimligi birakiyor,
     * sonra tur donuyor, en son yenisi kuruluyor: silinen kimlik hicbir zaman
     * canli olan degil.
     */
    _arm() {
        this._disarm();
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_LOW, this._intervalMs, () => {
            this._timeoutId = 0;
            this._tick();
            // `_tick()` icindeki bir dinleyici yoklamayi durdurmus olabilir.
            if (this._running)
                this._arm();
            return GLib.SOURCE_REMOVE;
        });
    }

    _tick() {
        const yeni = this._check();

        if (yeni !== this._present) {
            this._present = yeni;
            console.log(`${LOG} claude ${yeni ? `açık · ${this._name} (pid ${this._pid})` : 'kapalı'}`);
            // Aralik da degisti; yeni sure bir sonraki `_arm()`de gecerli olacak.
            this.emit('changed', yeni, this._name);
        }

        // Durum degismese de yayiliyor: periyodik ise binmek isteyenler icin.
        this.emit('tick');
    }

    /** Once onbellekteki pid, olmazsa tam tarama. */
    _check() {
        if (this._pid) {
            this._fastChecks++;
            const ad = surecDurumu(this._pid);
            if (ad && this._names.has(ad)) {
                this._name = ad;
                return true;
            }
            // Onbellekteki surec olmus; belki baska bir Claude vardir.
            this._pid = 0;
        }
        return this._scan();
    }

    _scan() {
        this._fullScans++;
        let enumerator;
        try {
            enumerator = Gio.File.new_for_path('/proc').enumerate_children(
                'standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        } catch (error) {
            console.warn(`${LOG} /proc okunamadı: ${error}`);
            return this._present;   // bilmiyorsak durumu degistirme
        }

        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            const ad = info.get_name();
            // Yalnizca rakamla baslayanlar surec; geri kalani /proc'un
            // kendi dosyalari.
            const ilk = ad.charCodeAt(0);
            if (ilk < 48 || ilk > 57)
                continue;

            const surecAdi = surecDurumu(ad);
            if (surecAdi && this._names.has(surecAdi)) {
                enumerator.close(null);
                this._pid = Number(ad);
                this._name = surecAdi;
                return true;
            }
        }
        enumerator.close(null);

        this._name = '';
        return false;
    }
});
