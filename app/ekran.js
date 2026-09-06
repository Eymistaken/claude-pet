/* Monitor listesi — Gdk'den `lib/layout.js`'in bekledigi bicime.
 *
 * `layout.js` monitorleri duz `{x, y, width, height}` nesneleri olarak
 * istiyor ve kabuktan bagimsiz duruyor; burasi o koprunun GTK ayagi.
 *
 * SIRA ONEMLI: `monitor-index` ayari bu listedeki SIRAYI sakliyor. GTK4'te
 * "birincil monitor" kavrami kaldirildigi icin birincil her zaman 0 — ayar
 * -1 dedigi surece pet listenin ilk monitorunde duruyor.
 */

import Gdk from 'gi://Gdk?version=4.0';

/** Sirali monitor listesi. Her ogede ayrica `gdk` alani var: layer-shell'e
 *  hangi ciktiya cakilacagini soylerken gerekiyor. */
export function monitorleriOku() {
    const liste = Gdk.Display.get_default()?.get_monitors();
    const n = liste?.get_n_items() ?? 0;
    const sonuc = [];

    for (let i = 0; i < n; i++) {
        const m = liste.get_item(i);
        const g = m?.get_geometry();
        if (!g)
            continue;
        sonuc.push({x: g.x, y: g.y, width: g.width, height: g.height, gdk: m});
    }

    return sonuc;
}
