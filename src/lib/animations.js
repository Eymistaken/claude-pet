/* `assets/animations.json` yükleyici.
 *
 * Kareler kod değil varlıktır: bu dosya onları okur, doğrular ve şeritlere
 * derler. Derleme bir kez, yükleme anında yapılıyor — her repaint'te değil.
 *
 * BOZUK VERİ PET'İ SUSTURUR, SHELL'İ DEĞİL. JSON okuması ve ayrıştırması
 * try/catch içinde; hata hâlinde boş bir varsayılanla devam edilir ve
 * `console.warn` ile bildirilir. Bu kod gnome-shell'in içinde çalışıyor.
 */

import GLib from 'gi://GLib';

import {compileFrame, parsePalette} from './sprite.js';

const LOG = '[claude-pet]';

/** Hiçbir şey çizmeyen, ama pet'i ayakta tutan yedek. */
function bosVarsayilan(neden) {
    console.warn(`${LOG} animasyonlar yüklenemedi (${neden}); boş varsayılana düşülüyor`);
    return {
        w: 16,
        h: 16,
        colors: {},
        animations: {
            bos: {
                name: 'bos',
                fps: 1,
                loop: false,
                holds: [1],
                frames: [{}],
            },
        },
        ok: false,
    };
}

/** Tek bir animasyonu doğrulayıp derler; kullanılamazsa null. */
function derle(ham, w, h) {
    const name = ham?.name;
    if (typeof name !== 'string' || !Array.isArray(ham.frames) || ham.frames.length === 0) {
        console.warn(`${LOG} animasyon atlandı (ad ya da kare yok): ${name}`);
        return null;
    }

    const frames = [];
    const holds = [];
    // `holds` yoksa her kare 1 kare durur.
    const hamHolds = Array.isArray(ham.holds) ? ham.holds : null;

    ham.frames.forEach((rows, i) => {
        if (!Array.isArray(rows) || rows.length !== h ||
            rows.some(r => typeof r !== 'string' || r.length !== w)) {
            console.warn(`${LOG} ${name}: kare ${i} biçimsiz (${h}×${w} bekleniyordu), atlandı`);
            return;
        }
        frames.push(compileFrame(rows));
        const hold = hamHolds?.[i];
        holds.push(Number.isFinite(hold) && hold > 0 ? Math.round(hold) : 1);
    });

    if (frames.length === 0) {
        console.warn(`${LOG} ${name}: kullanılabilir kare kalmadı, atlandı`);
        return null;
    }

    const fps = Number.isFinite(ham.fps) && ham.fps > 0 ? ham.fps : 15;

    return {
        name,
        fps,
        loop: ham.loop === true,
        holds,
        frames,
        // Toplam süre: rapor ve önizleyici için.
        durationMs: Math.round(holds.reduce((a, b) => a + b, 0) * 1000 / fps),
    };
}

/** JSON'u oku, doğrula, derle.
 *
 * `path` tam dosya yolu. Eklenti içinden `${this.path}/../assets/...` değil,
 * çağıran doğru yolu versin — bu modül nerede çalıştığını bilmek zorunda
 * kalmasın (önizleyici de aynı fonksiyonu kullanıyor).
 */
export function loadAnimations(path) {
    let data;
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        if (!ok)
            return bosVarsayilan(`okunamadı: ${path}`);
        data = JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
        return bosVarsayilan(`${error}`);
    }

    const w = data?.w;
    const h = data?.h;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0)
        return bosVarsayilan('w/h yok ya da geçersiz');

    if (!Array.isArray(data.animations) || data.animations.length === 0)
        return bosVarsayilan('animations dizisi yok ya da boş');

    const animations = {};
    for (const ham of data.animations) {
        const anim = derle(ham, w, h);
        if (anim)
            animations[anim.name] = anim;
    }

    if (Object.keys(animations).length === 0)
        return bosVarsayilan('hiçbir animasyon derlenemedi');

    return {
        w,
        h,
        colors: parsePalette(data.palette),
        animations,
        ok: true,
    };
}
