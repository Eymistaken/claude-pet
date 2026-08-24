/* Konum aritmetiği — monitör seçimi, göreli konum, ekran içine sıkıştırma.
 *
 * BU DOSYA KABUĞA BAĞIMLI DEĞİL. `St`, `Main`, `global` geçmez; monitörler
 * dışarıdan düz nesne olarak geliyor (`{x, y, width, height}`). Sebep
 * `sprite.js`'inkiyle aynı: bu kısım göründüğünden zor (monitör çıkarılıyor,
 * çözünürlük değişiyor, ölçek değişiyor) ve gnome-shell'i açmadan sınanabilir
 * olması gerekiyor — `tests/layout.js`.
 *
 * İKİ KOORDİNAT VAR, KARIŞTIRMA:
 *   ızgara başlangıcı (origin) — sprite ızgarasının (0,0) hücresinin yeri.
 *     Konumun tek kaynağı bu; klip değişince değişmiyor.
 *   karakter kutusu (box)      — o animasyonun karakter katmanı birleşim
 *     kutusu, HÜCRE cinsinden. Ekranda görünen dikdörtgen bu; sıkıştırma da
 *     buna göre yapılıyor, ızgaraya göre değil.
 *
 * Laptop bilerek hesaba katılmıyor: karakterin solunda duruyor ve ekran
 * kenarında yarısı taşabilir. Onu içeride tutmak karakteri kenardan
 * uzaklaştırırdı.
 */

/** Konum kaydedilmedi işareti: İKİ eksen de bu değerde olmalı.
 *
 * Tek bir -1 yetmez, çünkü ızgara başlangıcı karakterin solunda kalıyor
 * (`box.x` kadar) ve göreli konum meşru olarak eksi olabilir.
 */
export const KAYITSIZ = -1;

export function kayitliMi(x, y) {
    return !(x === KAYITSIZ && y === KAYITSIZ);
}

/** Kaydedilecek değer sıfırlama işaretiyle çakışıyorsa bir piksel ittir.
 *  Bir kerelik bir piksel, kaybolmuş bir pet'ten iyidir. */
export function kacinKayitsiz(x, y) {
    return kayitliMi(x, y) ? [x, y] : [x, y + 1];
}

/** Karakterin ekrandaki dikdörtgeni. */
export function characterRect(box, cell, originX, originY) {
    return {
        x: originX + box.x * cell,
        y: originY + box.y * cell,
        width: box.w * cell,
        height: box.h * cell,
    };
}

/** İstenen indisteki monitör. Yoksa ya da -1 ise birincil.
 *  Döner: `{monitor, index}` — `index` gerçekten kullanılan monitör. */
export function pickMonitor(monitors, index, primaryIndex = 0) {
    if (!monitors?.length)
        return {monitor: null, index: -1};

    if (Number.isInteger(index) && index >= 0 && index < monitors.length)
        return {monitor: monitors[index], index};

    const p = Number.isInteger(primaryIndex) && primaryIndex >= 0 &&
        primaryIndex < monitors.length ? primaryIndex : 0;
    return {monitor: monitors[p], index: p};
}

/** Karakterin MERKEZİNİ içeren monitörün indisi; hiçbiri içermiyorsa birincil.
 *
 * Sürükleme bitince "pet hangi monitörde" sorusunun cevabı bu. Merkez
 * kullanılıyor çünkü sürükleme sırasında karakter iki monitöre birden
 * binebiliyor; köşeye bakmak sınırda zıplayan bir cevap verirdi.
 */
export function monitorIndexForOrigin(monitors, box, cell, originX, originY,
    primaryIndex = 0) {
    if (!monitors?.length || !box)
        return -1;

    const r = characterRect(box, cell, originX, originY);
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;

    const i = monitors.findIndex(m =>
        cx >= m.x && cx < m.x + m.width &&
        cy >= m.y && cy < m.y + m.height);

    return i >= 0 ? i : pickMonitor(monitors, -1, primaryIndex).index;
}

/** Izgara başlangıcını, KARAKTER verilen monitörün içinde kalacak şekilde
 *  sıkıştır. Karakter monitörden büyükse sol üste hizalanır. */
export function clampOrigin(monitor, box, cell, originX, originY) {
    if (!monitor || !box)
        return [Math.round(originX), Math.round(originY)];

    const r = characterRect(box, cell, originX, originY);

    const x = Math.max(monitor.x,
        Math.min(r.x, monitor.x + monitor.width - r.width));
    const y = Math.max(monitor.y,
        Math.min(r.y, monitor.y + monitor.height - r.height));

    return [
        Math.round(x - box.x * cell),
        Math.round(y - box.y * cell),
    ];
}

/** Kayıt yokken kullanılan yer: monitörün sağ altı, `margin` kadar içeride.
 *  Boşluk KARAKTERE göre ölçülüyor, tuvale göre değil. */
export function defaultOrigin(monitor, box, cell, margin) {
    if (!monitor || !box)
        return [margin, margin];

    return [
        Math.round(monitor.x + monitor.width - margin - (box.x + box.w) * cell),
        Math.round(monitor.y + monitor.height - margin - (box.y + box.h) * cell),
    ];
}

/** Global sahne koordinatı → monitöre göreli. */
export function toRelative(monitor, originX, originY) {
    if (!monitor)
        return [Math.round(originX), Math.round(originY)];
    return [Math.round(originX - monitor.x), Math.round(originY - monitor.y)];
}

/** Monitöre göreli → global sahne koordinatı. */
export function fromRelative(monitor, relX, relY) {
    if (!monitor)
        return [Math.round(relX), Math.round(relY)];
    return [Math.round(monitor.x + relX), Math.round(monitor.y + relY)];
}

/** Ayarlardan gelen kaydı ekrandaki bir yere çevirir. TEK GİRİŞ NOKTASI:
 *  açılış, ölçek değişimi, monitör takılıp çıkarılması ve "hangi monitör"
 *  ayarı hep buradan geçiyor.
 *
 * @param {object[]} monitors kabuğun monitör listesi
 * @param {number} primaryIndex birincil monitörün indisi
 * @param {object} box karakter katmanının birleşim kutusu (hücre)
 * @param {number} cell hücrenin piksel kenarı
 * @param {object} saved `{x, y, monitorIndex}` — ayarlardan okunan hâli
 * @param {number} margin kayıt yokken kenar boşluğu
 * @returns {{x: number, y: number, monitorIndex: number, placed: boolean}}
 *   `monitorIndex` GERÇEKTEN kullanılan monitör (kayıtlı olan bağlı değilse
 *   birincil), `placed` kayıtlı bir konum kullanıldı mı.
 */
export function resolveOrigin({monitors, primaryIndex = 0, box, cell, saved, margin}) {
    const {monitor, index} = pickMonitor(monitors, saved?.monitorIndex ?? -1, primaryIndex);

    const kayitli = kayitliMi(saved?.x ?? KAYITSIZ, saved?.y ?? KAYITSIZ);
    const [gx, gy] = kayitli
        ? fromRelative(monitor, saved.x, saved.y)
        : defaultOrigin(monitor, box, cell, margin);

    const [x, y] = clampOrigin(monitor, box, cell, gx, gy);
    return {x, y, monitorIndex: index, placed: kayitli};
}
