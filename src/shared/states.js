/* Durum → klip eşlemesi. TEK TABLO, `if` zinciri değil.
 *
 * "Şu duruma şu animasyonu bağla" demek tek satır olmalı; bir davranış
 * değişikliği için kod okumaya değil tabloya bakılmalı.
 *
 * ÜÇ TABLO VAR, ÇÜNKÜ GEÇİŞ DE BİR ANIMASYON. Pet bir durumdan diğerine
 * ışınlanmıyor: laptop cepten çıkıyor, kutuya çöküyor, uyanıyor. Bunlar
 * "hangi durumdayız" sorusunun değil "nereden nereye" sorusunun cevabı:
 *
 *     dizi(A → B) = ÇIKIS[A] + GIRIS[B] + DONGU[B]
 *
 * Bu ayrım varlığın kendi dikişleriyle birebir örtüşüyor (ölçüldü):
 *   laptop_away son karesi = waiting_in ilk karesi   (WORKING → WAITING)
 *   waiting_out son karesi = laptop_out ilk karesi   (WAITING → WORKING)
 *   laptop_away son karesi = idle ilk karesi         (WORKING → IDLE)
 *   waiting_out son karesi = idle ilk karesi         (WAITING → IDLE)
 * Yani doğru sıra kurulunca geçişler görünmez oluyor. Yanlış sıra ise göze
 * batıyor: typing'den doğrudan waiting_in'e atlamak 322 hücre zıplatıyor.
 */

const LOG = '[claude-pet]';

/** Durumun DÖNGÜ klibi — pet o durumda kalırken oynayan şey. */
export const STATE_ANIM = {
    IDLE: 'idle',
    WORKING: 'typing',
    WAITING: 'waiting',
};

/** Duruma GİRERKEN bir kez oynayan klipler. */
export const ENTER_ANIM = {
    IDLE: [],
    WORKING: ['laptop_out'],
    WAITING: ['waiting_in'],
};

/** Durumdan ÇIKARKEN bir kez oynayan klipler. */
export const EXIT_ANIM = {
    IDLE: [],
    WORKING: ['laptop_away'],
    WAITING: ['waiting_out'],
};

/** `from` durumundan `to` durumuna götüren klip dizisi.
 *  Son eleman her zaman döngü klibi. */
export function sequence(from, to) {
    return [
        ...(EXIT_ANIM[from] ?? []),
        ...(ENTER_ANIM[to] ?? []),
        STATE_ANIM[to] ?? STATE_ANIM.IDLE,
    ];
}

/* Eksik klip yalnızca BİR KEZ bildiriliyor: kayıp bir animasyon her karede
 * log basarsa gürültü asıl sorunu gömer. */
const bildirilen = new Set();

/** Klip varlıkta yoksa `idle`'a düş. Eksik animasyon pet'i durdurmasın. */
export function resolve(animations, name) {
    if (animations?.[name])
        return name;

    if (!bildirilen.has(name)) {
        bildirilen.add(name);
        console.debug(`${LOG} klip yok: ${name} — idle'a düşülüyor`);
    }

    if (animations?.[STATE_ANIM.IDLE])
        return STATE_ANIM.IDLE;

    // idle bile yoksa varlık gerçekten bozuk; eldeki ilk şey oynasın.
    return Object.keys(animations ?? {})[0] ?? null;
}
