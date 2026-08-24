#!/usr/bin/env python3
"""claude-pet paket kontrolu -- `make check`.

Bu betik "kod dogru mu" diye sormuyor, "bu agac baska bir makinede kurulur mu"
diye soruyor. Faz 6'nin tamami bu soru.

Dort bolum:
  1. metadata.json     -- uuid, sema kimligi, kabuk surumu tutarli mi
  2. animations.json   -- kareler bicimli mi, palet disi karakter var mi
  3. sema              -- glib-compile-schemas --strict gecer mi
  4. sozdizimi         -- JS ve Python dosyalari ayristirilabiliyor mu

JS icin `node --check` KULLANILMIYOR. Olculdu: Node 24, ESM algilamasiyla
`const a = {;` iceren bir dosyaya 0 donuyor -- yani hicbir sey yakalamiyor.
Onun yerine gjs'in SpiderMonkey'i: `Reflect.parse(kaynak, {target:'module'})`
ayristirir, CALISTIRMAZ ve import'lari cozmez. gjs zaten her GNOME kurulumunda
var; node yok.
"""

import json
import os
import re
import subprocess
import sys

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Eklentinin gercekten aradigi klipler. Eksikse pet `idle`'a dusuyor
# (Faz 4, states.js::resolve) -- yani kurulum "calisiyor" gorunup sessizce
# yanlis davraniyor. Bu yuzden paket kontrolunde HATA.
GEREKLI_KLIPLER = [
    'idle', 'laptop_out', 'typing', 'laptop_away',
    'waiting_in', 'waiting', 'waiting_out',
]

hata_sayisi = 0
uyari_sayisi = 0


def tamam(mesaj):
    print(f'TAMAM  {mesaj}')


def hata(mesaj):
    global hata_sayisi
    hata_sayisi += 1
    print(f'HATA   {mesaj}')


def uyari(mesaj):
    global uyari_sayisi
    uyari_sayisi += 1
    print(f'UYARI  {mesaj}')


def baslik(mesaj):
    print(f'\n--- {mesaj} ---')


def oku_json(yol):
    with open(yol, encoding='utf-8') as f:
        return json.load(f)


# --------------------------------------------------------------- metadata.json

def metadata_kontrol():
    baslik('metadata.json')
    yol = os.path.join(KOK, 'src', 'metadata.json')
    try:
        meta = oku_json(yol)
    except Exception as e:
        hata(f'metadata.json okunamadi: {e}')
        return None

    tamam('gecerli JSON')

    uuid = meta.get('uuid')
    if not uuid:
        hata('uuid yok')
        return meta

    # UUID kurulum DIZIN ADI oluyor; Makefile da ayni degeri kullaniyor.
    # Ikisi ayrisirsa `make install` bir dizine kurar, kabuk baskasini arar.
    makefile = open(os.path.join(KOK, 'Makefile'), encoding='utf-8').read()
    m = re.search(r'^UUID\s*:?=\s*(\S+)', makefile, re.M)
    if not m:
        uyari('Makefile icinde UUID satiri bulunamadi')
    elif m.group(1) != uuid:
        hata(f'uuid ({uuid}) Makefile UUID ({m.group(1)}) ile ayni degil')
    else:
        tamam(f'uuid = kurulum dizini adi = {uuid}')

    if '46' not in (meta.get('shell-version') or []):
        hata(f'shell-version 46 icermiyor: {meta.get("shell-version")}')
    else:
        tamam(f'shell-version {meta["shell-version"]}')

    if not isinstance(meta.get('version'), int):
        hata('version tam sayi degil')
    else:
        tamam(f'version {meta["version"]}')

    return meta


# ---------------------------------------------------------------------- sema

def sema_kontrol(meta):
    baslik('sema')
    dizin = os.path.join(KOK, 'src', 'schemas')
    dosyalar = [d for d in os.listdir(dizin) if d.endswith('.gschema.xml')]
    if not dosyalar:
        hata('schemas/ icinde .gschema.xml yok')
        return

    sonuc = subprocess.run(
        ['glib-compile-schemas', '--strict', '--dry-run', dizin],
        capture_output=True, text=True)
    if sonuc.returncode != 0:
        hata(f'glib-compile-schemas --strict: {sonuc.stderr.strip()}')
    else:
        tamam(f'glib-compile-schemas --strict --dry-run ({len(dosyalar)} dosya)')

    # metadata'daki settings-schema semada gercekten tanimli mi?
    xml = open(os.path.join(dizin, dosyalar[0]), encoding='utf-8').read()
    kimlikler = re.findall(r'<schema[^>]*\bid="([^"]+)"', xml)
    beklenen = (meta or {}).get('settings-schema')
    if beklenen and beklenen not in kimlikler:
        hata(f'metadata settings-schema ({beklenen}) sema dosyasinda yok: {kimlikler}')
    elif beklenen:
        tamam(f'settings-schema {beklenen}')


# ------------------------------------------------------------ animations.json

def varlik_kontrol():
    baslik('assets/animations.json')
    yol = os.path.join(KOK, 'assets', 'animations.json')
    try:
        veri = oku_json(yol)
    except Exception as e:
        hata(f'animations.json okunamadi: {e}')
        return

    tamam('gecerli JSON')

    w, h = veri.get('w'), veri.get('h')
    if not (isinstance(w, int) and isinstance(h, int) and w > 0 and h > 0):
        hata(f'w/h gecersiz: {w}x{h}')
        return
    tamam(f'izgara {w}x{h}')

    palet = veri.get('palette') or {}
    kotu = [k for k, v in palet.items()
            if len(k) != 1 or not re.fullmatch(r'#[0-9a-fA-F]{6}', str(v))]
    if kotu:
        hata(f'palet girdileri bicimsiz: {kotu}')
    else:
        tamam(f'palet {len(palet)} renk: {" ".join(sorted(palet))}')

    # Bos hucre paletin disinda ama gecerli.
    izinli = set(palet) | {'.'}

    animasyonlar = veri.get('animations') or []
    if not animasyonlar:
        hata('animations dizisi bos')
        return

    adlar = []
    toplam_kare = 0
    for i, anim in enumerate(animasyonlar):
        ad = anim.get('name') or f'#{i}'
        adlar.append(ad)
        kareler = anim.get('frames')

        if not isinstance(kareler, list) or not kareler:
            hata(f'{ad}: kare yok')
            continue

        for k, satirlar in enumerate(kareler):
            if not isinstance(satirlar, list) or len(satirlar) != h:
                hata(f'{ad}: kare {k} {len(satirlar) if isinstance(satirlar, list) else "?"} satir, {h} bekleniyordu')
                break
            kotu_satir = next((s for s in satirlar
                               if not isinstance(s, str) or len(s) != w), None)
            if kotu_satir is not None:
                hata(f'{ad}: kare {k} satir uzunlugu {w} degil')
                break
            disarda = set(''.join(satirlar)) - izinli
            if disarda:
                hata(f'{ad}: kare {k} palet disi karakter {sorted(disarda)}')
                break
        else:
            toplam_kare += len(kareler)

        holds = anim.get('holds')
        if holds is not None and len(holds) != len(kareler):
            hata(f'{ad}: holds {len(holds)}, kare {len(kareler)} -- esit degil')

        fps = anim.get('fps')
        if fps is not None and not (isinstance(fps, (int, float)) and fps > 0):
            hata(f'{ad}: fps gecersiz ({fps})')

    tamam(f'{len(animasyonlar)} animasyon, {toplam_kare} kare bicimli')

    eksik = [k for k in GEREKLI_KLIPLER if k not in adlar]
    if eksik:
        hata(f'eklentinin aradigi klipler eksik: {eksik}')
    else:
        tamam(f'yedi klip de var: {" ".join(GEREKLI_KLIPLER)}')

    fazla = [a for a in adlar if a not in GEREKLI_KLIPLER]
    if fazla:
        print(f'       (ayrica ham/kaynak klipler: {" ".join(fazla)})')


# ----------------------------------------------------------------- sozdizimi

def js_kontrol():
    baslik('JS sozdizimi')
    hedefler = []
    for alt in ('src', 'src/lib', 'tools', 'tests'):
        dizin = os.path.join(KOK, alt)
        if not os.path.isdir(dizin):
            continue
        for d in sorted(os.listdir(dizin)):
            if d.endswith('.js'):
                hedefler.append(os.path.join(alt, d))

    # gjs'e tek seferde veriliyor: her dosya icin ayri process acmak
    # 15 dosyada gorunur sekilde yavas.
    betik = r'''
const GLib = imports.gi.GLib;
const yollar = ARGV;
let kaldi = 0;
for (const yol of yollar) {
    const [ok, bytes] = GLib.file_get_contents(yol);
    if (!ok) { print(`HATA ${yol}: okunamadi`); kaldi++; continue; }
    try {
        Reflect.parse(new TextDecoder().decode(bytes), {target: 'module'});
    } catch (e) {
        print(`HATA ${yol}: ${e.message}`);
        kaldi++;
    }
}
print(`SAYI ${yollar.length} ${kaldi}`);
'''
    # `--` KONULMUYOR: gjs onu da ARGV'ye koyuyor ve dosya adi sanip aciyor.
    sonuc = subprocess.run(['gjs', '-c', betik, *hedefler],
                           capture_output=True, text=True, cwd=KOK)
    if sonuc.returncode != 0 and not sonuc.stdout:
        hata(f'gjs calistirilamadi: {sonuc.stderr.strip()[:200]}')
        return

    for satir in sonuc.stdout.splitlines():
        if satir.startswith('HATA '):
            hata(satir[5:])
        elif satir.startswith('SAYI '):
            _, toplam, kaldi = satir.split()
            if kaldi == '0':
                tamam(f'{toplam} JS dosyasi ayristirildi (gjs Reflect.parse)')


def python_kontrol():
    baslik('Python sozdizimi')
    hedefler = []
    for alt in ('hooks', 'tools'):
        dizin = os.path.join(KOK, alt)
        if not os.path.isdir(dizin):
            continue
        for d in sorted(os.listdir(dizin)):
            if d.endswith('.py'):
                hedefler.append(os.path.join(alt, d))

    kaldi = 0
    for yol in hedefler:
        try:
            with open(os.path.join(KOK, yol), encoding='utf-8') as f:
                compile(f.read(), yol, 'exec')
        except SyntaxError as e:
            hata(f'{yol}: {e}')
            kaldi += 1
    if not kaldi:
        tamam(f'{len(hedefler)} Python dosyasi derlendi')


def main():
    print('claude-pet paket kontrolu')
    meta = metadata_kontrol()
    sema_kontrol(meta)
    varlik_kontrol()
    js_kontrol()
    python_kontrol()

    print()
    if hata_sayisi:
        print(f'{hata_sayisi} HATA, {uyari_sayisi} uyari')
        return 1
    print(f'hepsi gecti ({uyari_sayisi} uyari)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
