/* Kare çizimi — katman katman.
 *
 * BU DOSYA KABUĞA BAĞIMLI DEĞİL. `St`, `Main`, `global` geçmez — yalnızca
 * kendisine verilen Cairo bağlamıyla çalışır. Sebep: `tools/preview.js`
 * gnome-shell'in dışında, düz gjs + GTK4 ile aynı çizimi yapabilsin.
 * Ölçek bu yüzden parametre; `scale_factor`'ı çağıran hesaplar.
 *
 * HÜCRE HÜCRE ÇİZİLMEZ. Her satır yatay şeritlere (aynı karakterin ardışık
 * dizisi) bölünür ve şerit başına tek `rectangle()` yazılır. 53×37'lik bir
 * karede 1961 hücre yerine ~50 dikdörtgen oluyor.
 *
 * KATMANLAR (Faz 2). Bir kare tek parça değil: karakter (`#`, `o`) tıklama
 * alan bir actor'e, laptop (`L`) hiç olay almayan ayrı bir actor'e gidiyor.
 * Ayrım burada, DERLEME anında yapılıyor: her katmanın şerit dizisi zaten tam
 * olarak o actor'ün çizeceği şey, yani repaint yolunda tek bir karakter
 * karşılaştırması bile yok. Her katman kendi SIKI SINIRLAYICI KUTUSUNU da
 * taşıyor (hücre cinsinden) — actor'lerin ne kadar yer kaplayacağı ondan
 * hesaplanıyor.
 */

/** Boş hücre. Hiçbir katmana girmez. */
const BOSLUK = '.';

/** Katman → o katmana giren karakterler.
 *
 * Anahtar sırası önemli değil; actor'lerin sahnedeki sırasını `extension.js`
 * kendi belirliyor. Yeni bir görsel parça (gölge, baloncuk) eklemek buraya
 * bir satır: paletten yeni bir karakter, ayrı bir actor, ayrı bir kutu.
 */
export const KATMANLAR = {
    karakter: ['#', 'o'],
    laptop: ['L'],
};

/** '#D87656' → [0.847, 0.463, 0.337]. Bozuk girdide null. */
export function parseColor(hex) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex ?? '');
    if (!m)
        return null;

    const n = parseInt(m[1], 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

/** Palet nesnesini bir kez ayrıştır: {'#': '#D87656'} → {'#': [r,g,b]}. */
export function parsePalette(palette) {
    const colors = {};
    for (const [ch, hex] of Object.entries(palette ?? {})) {
        const rgb = parseColor(hex);
        if (rgb)
            colors[ch] = rgb;
    }
    return colors;
}

/** Bir karenin TEK BİR KATMANINI şeritlere böler.
 *
 * `rows`  : h tane, w uzunluğunda satır
 * `chars` : bu katmana giren karakterler
 *
 * Döner: `{strips, box}`
 *   `strips` — karakter → [[x, y, uzunluk], …], koordinatlar IZGARAYA göre
 *   `box`    — hücre cinsinden sıkı sınırlayıcı kutu, katman boşsa `null`
 *
 * Çizim sırası önemsiz: her hücrede tek bir karakter var, şeritler
 * birbirinin üstüne binmiyor.
 */
export function compileLayer(rows, chars) {
    const strips = {};
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;

    rows.forEach((row, y) => {
        let x = 0;
        while (x < row.length) {
            const ch = row[x];
            let run = 1;
            while (x + run < row.length && row[x + run] === ch)
                run++;

            if (ch !== BOSLUK && chars.includes(ch)) {
                (strips[ch] ??= []).push([x, y, run]);
                if (x < x0) x0 = x;
                if (y < y0) y0 = y;
                if (x + run > x1) x1 = x + run;
                if (y + 1 > y1) y1 = y + 1;
            }

            x += run;
        }
    });

    return {strips, box: x1 > x0 ? {x: x0, y: y0, w: x1 - x0, h: y1 - y0} : null};
}

/** Bir kareyi bütün katmanlara böler: {karakter: {…}, laptop: {…}}. */
export function compileFrame(rows) {
    const layers = {};
    for (const [ad, chars] of Object.entries(KATMANLAR))
        layers[ad] = compileLayer(rows, chars);
    return layers;
}

/** Kutuların birleşimi. Hepsi boşsa null.
 *
 * Actor boyutu bundan geliyor: bir animasyonun BÜTÜN karelerini içine alan
 * tek kutu. Neden kare başına sıkı kutu değil — `extension.js::_syncSize`.
 */
export function unionBox(boxes) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;

    for (const b of boxes ?? []) {
        if (!b)
            continue;
        if (b.x < x0) x0 = b.x;
        if (b.y < y0) y0 = b.y;
        if (b.x + b.w > x1) x1 = b.x + b.w;
        if (b.y + b.h > y1) y1 = b.y + b.h;
    }

    return x1 > x0 ? {x: x0, y: y0, w: x1 - x0, h: y1 - y0} : null;
}

/** Derlenmiş bir KATMANI çizer.
 *
 * `layer`  : `compileLayer` çıktısı (ya da null/undefined — hiçbir şey çizmez)
 * `colors` : `parsePalette` çıktısı
 * `cell`   : bir hücrenin piksel kenarı (ölçek burada uygulanmış olmalı)
 * `origin` : tuvalin sol üst köşesinin IZGARADAKİ hücre koordinatı
 *
 * Şerit koordinatları ızgaraya göre mutlak; `origin` onları tuvale taşıyor.
 * Tuval o animasyonun birleşim kutusu olduğu için `origin` animasyon boyunca
 * sabit — yani kare değişimi actor'ün içeriğini değiştiriyor, yerini değil.
 *
 * Bağlamı bırakmak (`$dispose`) çağıranın işi — bu fonksiyon bağlamı
 * kendisi yaratmadığı için kapatmaz da.
 */
export function drawLayer(cr, layer, colors, cell, origin) {
    if (!layer)
        return;

    const ox = origin?.x ?? 0;
    const oy = origin?.y ?? 0;

    for (const [ch, strips] of Object.entries(layer.strips)) {
        const rgb = colors[ch];
        if (!rgb)
            continue;

        cr.setSourceRGB(rgb[0], rgb[1], rgb[2]);
        for (const [x, y, run] of strips)
            cr.rectangle((x - ox) * cell, (y - oy) * cell, run * cell, cell);

        // Bütün şeritler tek fill'de basılıyor.
        cr.fill();
    }
}

/** Bir katmandaki şerit sayısı — ölçüm/rapor için. */
export function stripCount(layer) {
    let n = 0;
    for (const strips of Object.values(layer?.strips ?? {}))
        n += strips.length;
    return n;
}

/** Bir karedeki (bütün katmanlar) şerit sayısı. */
export function frameStripCount(frame) {
    let n = 0;
    for (const layer of Object.values(frame ?? {}))
        n += stripCount(layer);
    return n;
}
