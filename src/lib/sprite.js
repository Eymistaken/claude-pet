/* Kare çizimi.
 *
 * BU DOSYA KABUĞA BAĞIMLI DEĞİL. `St`, `Main`, `global` geçmez — yalnızca
 * kendisine verilen Cairo bağlamıyla çalışır. Sebep: `tools/preview.js`
 * gnome-shell'in dışında, düz gjs + GTK4 ile aynı çizimi yapabilsin.
 * Ölçek bu yüzden parametre; `scale_factor`'ı çağıran hesaplar.
 *
 * HÜCRE HÜCRE ÇİZİLMEZ. Her satır yatay şeritlere (aynı karakterin ardışık
 * dizisi) bölünür ve şerit başına tek `rectangle()` yazılır. 53×37'lik bir
 * karede 1961 hücre yerine ~200 dikdörtgen oluyor. Üstelik şeritler karaktere
 * göre gruplandığı için kare başına yalnızca 3 renk değişimi ve 3 `fill()`
 * gerekiyor.
 */

/** Boş hücre. Şeritlere hiç girmez. */
const BOSLUK = '.';

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

/** Bir kareyi şeritlere böler.
 *
 * `rows`: h tane, w uzunluğunda satır.
 * Döner: karakter → [[x, y, uzunluk], ...]
 *
 * Çizim sırası önemsiz: her hücrede tek bir karakter var, şeritler
 * birbirinin üstüne binmiyor.
 */
export function compileFrame(rows) {
    const strips = {};

    rows.forEach((row, y) => {
        let x = 0;
        while (x < row.length) {
            const ch = row[x];
            let run = 1;
            while (x + run < row.length && row[x + run] === ch)
                run++;

            if (ch !== BOSLUK)
                (strips[ch] ??= []).push([x, y, run]);

            x += run;
        }
    });

    return strips;
}

/** Derlenmiş kareyi çizer.
 *
 * `compiled`: `compileFrame` çıktısı
 * `colors`:   `parsePalette` çıktısı
 * `cell`:     bir hücrenin piksel kenarı (ölçek burada uygulanmış olmalı)
 *
 * Bağlamı bırakmak (`$dispose`) çağıranın işi — bu fonksiyon bağlamı
 * kendisi yaratmadığı için kapatmaz da.
 */
export function drawFrame(cr, compiled, colors, cell) {
    if (!compiled)
        return;

    for (const [ch, strips] of Object.entries(compiled)) {
        const rgb = colors[ch];
        if (!rgb)
            continue;

        cr.setSourceRGB(rgb[0], rgb[1], rgb[2]);
        for (const [x, y, run] of strips)
            cr.rectangle(x * cell, y * cell, run * cell, cell);

        // Bütün şeritler tek fill'de basılıyor.
        cr.fill();
    }
}

/** Bir karedeki şerit sayısı — ölçüm/rapor için. */
export function stripCount(compiled) {
    let n = 0;
    for (const strips of Object.values(compiled ?? {}))
        n += strips.length;
    return n;
}
