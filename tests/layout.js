#!/usr/bin/env -S gjs -m
/* Konum aritmetiği testi.
 *
 * NEDEN AYRI BİR DOSYA: konum mantığı Faz 5'in en sinsi kısmı — monitör
 * çıkarılıyor, çözünürlük değişiyor, ölçek değişiyor ve pet'in ekran dışında
 * kalması sessiz bir hata oluyor (kimse görmüyor, kimse şikâyet edemiyor).
 * `layout.js` kabuktan bağımsız yazıldığı için burada gnome-shell açmadan
 * sınanabiliyor.
 *
 * Ölçüler gerçek: karakter kutusu `idle` klibinin ölçülmüş birleşim kutusu
 * (31×21 hücre @(17,13)), monitörler iki 1920×1080.
 *
 * Kullanım:  gjs -m tests/layout.js     (`make replay` bunu da çalıştırır)
 */

import {
    KAYITSIZ, characterRect, clampOrigin, defaultOrigin, fromRelative,
    kacinKayitsiz, kayitliMi, monitorIndexForOrigin, pickMonitor,
    resolveOrigin, toRelative,
} from '../src/lib/layout.js';

let gecti = 0;
let kaldi = 0;

function ol(ad, kosul, ayrinti = '') {
    if (kosul)
        gecti++;
    else
        kaldi++;
    print(`${kosul ? 'GEÇTİ' : 'KALDI'}  ${ad}${ayrinti ? `  — ${ayrinti}` : ''}`);
}

function esit(ad, bulunan, beklenen) {
    const a = JSON.stringify(bulunan);
    const b = JSON.stringify(beklenen);
    ol(ad, a === b, a === b ? a : `bulunan ${a} · beklenen ${b}`);
}

/** `idle` klibinin gerçek karakter birleşim kutusu. */
const KUTU = {x: 17, y: 13, w: 31, h: 21};
const HUCRE = 3;
const KENAR = 24;

const IKI_MONITOR = [
    {x: 0, y: 0, width: 1920, height: 1080},
    {x: 1920, y: 0, width: 1920, height: 1080},
];
const TEK_MONITOR = [IKI_MONITOR[0]];

// ------------------------------------------------------------ kayıt işareti

ol('tek -1 kayıt sayılır (ızgara başlangıcı eksi olabilir)', kayitliMi(-1, 400));
ol('iki -1 kayıtsız demek', !kayitliMi(KAYITSIZ, KAYITSIZ));
esit('kaydedilecek değer sıfırlama işaretiyle çakışmıyor',
    kacinKayitsiz(-1, -1), [-1, 0]);
esit('normal değer olduğu gibi kalıyor', kacinKayitsiz(-51, 900), [-51, 900]);

// -------------------------------------------------------------- monitör seçimi

esit('-1 → birincil', pickMonitor(IKI_MONITOR, -1, 1).index, 1);
esit('geçerli indis korunuyor', pickMonitor(IKI_MONITOR, 0, 1).index, 0);
esit('artık bağlı olmayan monitör → birincil',
    pickMonitor(TEK_MONITOR, 1, 0).index, 0);
esit('hiç monitör yoksa -1', pickMonitor([], 0, 0).index, -1);

// Karakterin merkezi ikinci monitörde: ızgara başlangıcı 1900 iken karakter
// 1900 + 17*3 = 1951'de başlıyor, merkezi 1951 + 93/2 ≈ 1997.
esit('merkeze göre monitör: ikinci',
    monitorIndexForOrigin(IKI_MONITOR, KUTU, HUCRE, 1900, 500), 1);
esit('merkeze göre monitör: birinci',
    monitorIndexForOrigin(IKI_MONITOR, KUTU, HUCRE, 100, 500), 0);
esit('hiçbir monitörde değilse birincile düşüyor',
    monitorIndexForOrigin(IKI_MONITOR, KUTU, HUCRE, 5000, 5000, 1), 1);

// ------------------------------------------------------------------ sıkıştırma

{
    const [x, y] = clampOrigin(IKI_MONITOR[0], KUTU, HUCRE, 400, 400);
    esit('içerideki konuma dokunulmuyor', [x, y], [400, 400]);
}

{
    // Karakter sağ kenardan taşıyor: sağ kenara yapıştırılmalı.
    const [x] = clampOrigin(IKI_MONITOR[0], KUTU, HUCRE, 1900, 400);
    const r = characterRect(KUTU, HUCRE, x, 400);
    ol('sağdan taşan karakter içeri çekiliyor', r.x + r.width === 1920,
        `sağ kenar ${r.x + r.width}`);
}

{
    // Eksi tarafa taşıyor: sol kenara yapışmalı, ızgara başlangıcı eksi kalır.
    const [x] = clampOrigin(IKI_MONITOR[0], KUTU, HUCRE, -500, 400);
    const r = characterRect(KUTU, HUCRE, x, 400);
    ol('soldan taşan karakter içeri çekiliyor', r.x === 0, `sol kenar ${r.x}`);
    ol('ızgara başlangıcı eksi kalabiliyor', x < 0, `origin ${x}`);
}

{
    // İkinci monitöre sıkıştırma: sonuç o monitörün içinde olmalı.
    const [x, y] = clampOrigin(IKI_MONITOR[1], KUTU, HUCRE, 100, 100);
    const r = characterRect(KUTU, HUCRE, x, y);
    ol('ikinci monitöre sıkıştırma o monitörün içine koyuyor',
        r.x >= 1920 && r.x + r.width <= 3840, `x ${r.x}`);
}

{
    // Karakter monitörden büyük (ölçek 8, küçük sanal ekran): sol üste hizalan.
    const kucuk = {x: 0, y: 0, width: 200, height: 150};
    const [x, y] = clampOrigin(kucuk, KUTU, 8, 500, 500);
    const r = characterRect(KUTU, 8, x, y);
    esit('karakter monitörden büyükse sol üste hizalanıyor', [r.x, r.y], [0, 0]);
}

// -------------------------------------------------------------- varsayılan yer

{
    const [x, y] = defaultOrigin(IKI_MONITOR[0], KUTU, HUCRE, KENAR);
    const r = characterRect(KUTU, HUCRE, x, y);
    esit('varsayılan yer sağ altta, boşluk KARAKTERE göre',
        [1920 - (r.x + r.width), 1080 - (r.y + r.height)], [KENAR, KENAR]);
}

// ------------------------------------------------------------------ göreli

{
    const [rx, ry] = toRelative(IKI_MONITOR[1], 2000, 300);
    esit('global → göreli', [rx, ry], [80, 300]);
    esit('göreli → global', fromRelative(IKI_MONITOR[1], rx, ry), [2000, 300]);
}

// --------------------------------------------------------------- çözüm yolu

{
    const r = resolveOrigin({
        monitors: IKI_MONITOR, primaryIndex: 0, box: KUTU, cell: HUCRE,
        saved: {x: KAYITSIZ, y: KAYITSIZ, monitorIndex: -1}, margin: KENAR,
    });
    const [dx, dy] = defaultOrigin(IKI_MONITOR[0], KUTU, HUCRE, KENAR);
    esit('kayıt yoksa birincil monitörün sağ altı', [r.x, r.y, r.placed],
        [dx, dy, false]);
}

{
    // İkinci monitörde kaydedilmiş bir konum aynı yere geri geliyor.
    const r = resolveOrigin({
        monitors: IKI_MONITOR, primaryIndex: 0, box: KUTU, cell: HUCRE,
        saved: {x: 80, y: 300, monitorIndex: 1}, margin: KENAR,
    });
    esit('kayıtlı konum geri geliyor', [r.x, r.y, r.monitorIndex], [2000, 300, 1]);
}

{
    // O monitör artık bağlı değil: birincile düşüyor ve içeride kalıyor.
    const r = resolveOrigin({
        monitors: TEK_MONITOR, primaryIndex: 0, box: KUTU, cell: HUCRE,
        saved: {x: 1800, y: 900, monitorIndex: 1}, margin: KENAR,
    });
    const rect = characterRect(KUTU, HUCRE, r.x, r.y);
    ol('monitör çıkarıldı → birincil, ekran içinde',
        r.monitorIndex === 0 && rect.x + rect.width <= 1920 &&
        rect.y + rect.height <= 1080,
        `monitör ${r.monitorIndex} · sağ alt (${rect.x + rect.width}, ${rect.y + rect.height})`);
}

{
    // Çözünürlük küçüldü: aynı kayıt artık dışarıda kalırdı, sıkıştırılıyor.
    const kucuk = [{x: 0, y: 0, width: 1280, height: 720}];
    const r = resolveOrigin({
        monitors: kucuk, primaryIndex: 0, box: KUTU, cell: HUCRE,
        saved: {x: 1750, y: 950, monitorIndex: 0}, margin: KENAR,
    });
    const rect = characterRect(KUTU, HUCRE, r.x, r.y);
    ol('çözünürlük küçülünce pet ekran içinde kalıyor',
        rect.x + rect.width <= 1280 && rect.y + rect.height <= 720,
        `sağ alt (${rect.x + rect.width}, ${rect.y + rect.height})`);
}

{
    // Ölçek büyüdü: karakter büyüyor, kenardaki pet içeri çekiliyor.
    const kayit = {x: 1750, y: 950, monitorIndex: 0};
    const kucukOlcek = resolveOrigin({
        monitors: TEK_MONITOR, primaryIndex: 0, box: KUTU, cell: 3,
        saved: kayit, margin: KENAR,
    });
    const buyukOlcek = resolveOrigin({
        monitors: TEK_MONITOR, primaryIndex: 0, box: KUTU, cell: 8,
        saved: kayit, margin: KENAR,
    });
    const r3 = characterRect(KUTU, 3, kucukOlcek.x, kucukOlcek.y);
    const r8 = characterRect(KUTU, 8, buyukOlcek.x, buyukOlcek.y);
    ol('ölçek büyüyünce de ekran içinde kalıyor',
        r3.x + r3.width <= 1920 && r8.x + r8.width <= 1920 &&
        r8.y + r8.height <= 1080,
        `3px → ${r3.x + r3.width} · 8px → ${r8.x + r8.width}`);
}

{
    // Kaydet → oku turu: sürükleme sonundaki değerler aynı yeri geri veriyor.
    const originX = 1500, originY = 800;
    const i = monitorIndexForOrigin(IKI_MONITOR, KUTU, HUCRE, originX, originY);
    const [rx, ry] = toRelative(IKI_MONITOR[i], originX, originY);
    const geri = resolveOrigin({
        monitors: IKI_MONITOR, primaryIndex: 0, box: KUTU, cell: HUCRE,
        saved: {x: rx, y: ry, monitorIndex: i}, margin: KENAR,
    });
    esit('kaydet → oku turu aynı yeri veriyor', [geri.x, geri.y],
        [originX, originY]);
}

print('');
print(`${gecti}/${gecti + kaldi} geçti`);
if (kaldi)
    imports.system.exit(1);
