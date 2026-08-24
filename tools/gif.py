#!/usr/bin/env python3
"""README'deki GIF'i uretir -- `make gif`.

Iki adim: `tools/kayit.js` kareleri PNG'ye basiyor (cizim src/lib/sprite.js'ten
geliyor, yani kabugun cizdiginin aynisi), burasi onlari GIF'e diziyor. Kare
sureleri varligin kendi ritmi (holds/fps), yani GIF gercek hizinda oynuyor.

GIF'i Cairo yazamiyor, PIL yaziyor; bu betigin tek sebebi o.

  python3 tools/gif.py [--sira laptop_out,typing,...] [--hucre 8]
                       [--cikti docs/pet.gif]
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VARSAYILAN_SIRA = 'laptop_out,typing,typing,laptop_away,idle'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sira', default=VARSAYILAN_SIRA)
    ap.add_argument('--hucre', type=int, default=8)
    ap.add_argument('--cikti', default=os.path.join(KOK, 'docs', 'pet.gif'))
    args = ap.parse_args()

    gecici = tempfile.mkdtemp(prefix='claude-pet-kare-')
    shutil.rmtree(gecici)               # kayit.js dizini kendi yaratiyor

    sonuc = subprocess.run(
        ['gjs', '-m', os.path.join('tools', 'kayit.js'),
         args.sira, gecici, str(args.hucre)],
        cwd=KOK, capture_output=True, text=True)
    print(sonuc.stdout.strip() or sonuc.stderr.strip())
    if sonuc.returncode != 0:
        return 1

    sureler = json.load(open(os.path.join(gecici, 'sureler.json')))
    adlar = sorted(d for d in os.listdir(gecici) if d.endswith('.png'))
    if len(adlar) != len(sureler):
        print(f'HATA: {len(adlar)} PNG, {len(sureler)} sure')
        return 1

    # Palet 4 renk (zemin + govde + goz + laptop); ADAPTIVE ile 8'e yuvarlaniyor,
    # dosya boyutu buradan geliyor.
    kareler = [Image.open(os.path.join(gecici, a)).convert('RGB')
               .convert('P', palette=Image.ADAPTIVE, colors=8) for a in adlar]

    os.makedirs(os.path.dirname(args.cikti), exist_ok=True)
    kareler[0].save(args.cikti, save_all=True, append_images=kareler[1:],
                    duration=sureler, loop=0, optimize=True, disposal=2)
    shutil.rmtree(gecici, ignore_errors=True)

    boyut = os.path.getsize(args.cikti)
    print(f'{args.cikti} · {len(kareler)} kare · {boyut // 1024} KB')
    return 0


if __name__ == '__main__':
    sys.exit(main())
