#!/usr/bin/env python3
"""Ekran kaydindan maskot karelerini cikarip poz atolyesinin JSON'una cevirir.

Kullanim
--------
    python3 tools/extract_frames.py kayit.mp4 -o poses.json --preview kontrol.png
    python3 tools/extract_frames.py kayit.mp4 --name typing --start 00:00:03 --duration 4
    python3 tools/extract_frames.py kareler_dizini/ --canvas 53x37

Cikan JSON'u poz atolyesindeki JSON kutusuna yapistirip "Ice al"a bas.

Nasil calisir
-------------
1. Maskotun ekrandaki yeri renginden bulunur, tum kareler ffmpeg ile dogrudan
   o bolgeye kirpilarak cikarilir.
2. Piksel siniflandirmasi ve izgaraya indirgeme Pillow'un C tarafinda yapilir;
   Python yalnizca kucuk izgara (orn 55x40) uzerinde calisir. 1920x1080 60fps
   bir kayit bu sayede saniyeler icinde islenir.
3. Maskot kaba bir izgaraya cizildigi icin ekrandaki hucre boyutu otomatik
   bulunur: her renk siniri hucre sinirina denk duser.
4. Benzer ardisik kareler kumelenip hucre bazinda cogunluk oyuyla tek kareye
   indirilir; kac kaynak karesi tuttugu `hold` olarak yazilir, yani
   animasyonun gercek ritmi korunur.

Bagimliliklar: ffmpeg, ffprobe, Pillow. numpy gerekmez.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
import tempfile
from collections import Counter, deque
from pathlib import Path

try:
    from PIL import Image, ImageChops
except ImportError:
    sys.exit("Pillow gerekli:  pip install --user pillow")

VIDEO_SUFFIXES = {".mp4", ".webm", ".mkv", ".mov", ".gif", ".avi", ".m4v"}
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}

BODY_CH, EYE_CH, LAPTOP_CH, EMPTY_CH = "#", "o", "L", "."
PALETTE = {BODY_CH: "#D87656", EYE_CH: "#2B2A26", LAPTOP_CH: "#8B8B8B"}

R_MIN, RB_MIN, RG_MIN = 95, 38, 14
GREY_SPREAD, GREY_LO, GREY_HI = 34, 70, 215
DARK_MAX = 95


def _thr(img, lo=None, hi=None):
    """Tek kanalli goruntuden 1-bit maske."""
    if lo is not None and hi is not None:
        tbl = [255 if lo < v < hi else 0 for v in range(256)]
    elif lo is not None:
        tbl = [255 if v > lo else 0 for v in range(256)]
    else:
        tbl = [255 if v < hi else 0 for v in range(256)]
    return img.point(tbl).convert("1")


def masks(im):
    """Bir kareden govde / gri / koyu maskelerini uretir. Hepsi C tarafinda."""
    r, g, b = im.split()
    lum = im.convert("L")

    body = _thr(r, lo=R_MIN)
    body = ImageChops.logical_and(body, _thr(ImageChops.subtract(r, b), lo=RB_MIN))
    body = ImageChops.logical_and(body, _thr(ImageChops.subtract(r, g), lo=RG_MIN))
    body = ImageChops.logical_and(body, _thr(ImageChops.subtract(b, g), hi=1))

    mx = ImageChops.lighter(ImageChops.lighter(r, g), b)
    mn = ImageChops.darker(ImageChops.darker(r, g), b)
    grey = ImageChops.logical_and(
        _thr(ImageChops.subtract(mx, mn), hi=GREY_SPREAD),
        _thr(lum, lo=GREY_LO, hi=GREY_HI))

    dark = _thr(lum, hi=DARK_MAX)
    return body, grey, dark


def shrink(mask, cell, phase, grid_wh, thresh=0.5):
    """Maskeyi hucre izgarasina indirger: BOX yeniden orneklemesi = cogunluk oyu."""
    phx, phy = phase
    gw, gh = grid_wh
    # BOX kutusu kesirli koordinat kabul eder, hucre tam sayi olmak zorunda degil
    small = mask.convert("L").resize(
        (gw, gh), Image.BOX,
        box=(phx, phy, phx + gw * cell, phy + gh * cell))
    px = small.load()
    cut = 255 * thresh
    return [[1 if px[x, y] >= cut else 0 for x in range(gw)] for y in range(gh)]


def need(tool):
    path = shutil.which(tool)
    if not path:
        sys.exit(f"{tool} bulunamadi. Kur:  sudo apt install ffmpeg")
    return path


def source_fps(path):
    try:
        out = subprocess.run(
            [need("ffprobe"), "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, check=True).stdout.strip()
        num, _, den = out.partition("/")
        return float(num) / float(den or 1)
    except Exception:
        return 30.0


def _io_args(src, start, duration):
    cmd = [need("ffmpeg"), "-v", "error", "-y"]
    if start:
        cmd += ["-ss", str(start)]
    cmd += ["-i", str(src)]
    if duration:
        cmd += ["-t", str(duration)]
    return cmd


def dump_frames(src, dest, crop=None, start=None, duration=None, every=1):
    cmd = _io_args(src, start, duration)
    filters = []
    if crop:
        x0, y0, w, h = crop
        filters.append(f"crop={w}:{h}:{x0}:{y0}")
    if every > 1:
        filters.append(f"select='not(mod(n\\,{every}))'")
    if filters:
        cmd += ["-vf", ",".join(filters), "-vsync", "0"]
    cmd += ["-start_number", "0", str(dest / "%05d.png")]
    subprocess.run(cmd, check=True)
    return sorted(dest.glob("*.png"))


def locate(src, start, duration, pad_ratio):
    """Ornek karelerden maskotun kapsayan kutusunu bulur (getbbox, C hizinda)."""
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        cmd = _io_args(src, start, duration)
        cmd += ["-vf", "select='not(mod(n\\,7))'", "-vsync", "0",
                "-frames:v", "16", str(tmp / "s%03d.png")]
        subprocess.run(cmd, check=True)
        shots = sorted(tmp.glob("*.png"))
        if not shots:
            sys.exit("Kayittan kare alinamadi.")
        boxes, size = [], None
        for s in shots:
            im = Image.open(s).convert("RGB")
            size = im.size
            bb = masks(im)[0].getbbox()
            if bb:
                boxes.append(bb)
        if not boxes:
            sys.exit("Maskotun rengi hicbir karede bulunamadi.\n"
                     "Kayitta maskot goruniyorsa --no-locate ile tum kareyi isle.")
        x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
        x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)

    bw, bh = x1 - x0, y1 - y0
    pad = int(max(bw, bh) * pad_ratio) + 4
    W, H = size
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(W, x1 + pad); y1 = min(H, y1 + pad)
    w = (x1 - x0) // 2 * 2
    h = (y1 - y0) // 2 * 2
    return (x0, y0, max(w, 2), max(h, 2))


# --------------------------------------------------------------------------
# olcek
# --------------------------------------------------------------------------
#
# Maskotun izgarasi DUZGUN DEGIL: bacak yariklarinin genisligi birbirini
# tutmuyor, dolayisiyla "her renk siniri hucre sinirina duser" varsayimi
# yanlis ve otomatik periyot aramanin tutar tarafi yok.
#
# Bunun yerine olcegi bilinen bir seye sabitliyoruz: referans karelerde
# maskotun kollari acikken eni 34 hucre. Kayittaki en genis govde kutusunu
# 34'e bolunce hucre boyutu cikar -- ve sonuc editordeki referans karelerle
# ayni olcekte olur, yani ikisi yan yana kullanilabilir.

REFERENCE_BODY_CELLS = 34


def body_union(mask_list):
    """Tum karelerdeki govde kutularinin birlesimi."""
    x0 = y0 = 10 ** 9; x1 = y1 = -1
    for bm, _, _ in mask_list:
        bb = bm.getbbox()
        if not bb:
            continue
        x0 = min(x0, bb[0]); y0 = min(y0, bb[1])
        x1 = max(x1, bb[2]); y1 = max(y1, bb[3])
    if x1 < 0:
        sys.exit("Hicbir karede maskot bulunamadi.")
    return x0, y0, x1, y1


def components(grid, gw, gh):
    seen = [[False] * gw for _ in range(gh)]
    out = []
    for sy in range(gh):
        for sx in range(gw):
            if grid[sy][sx] and not seen[sy][sx]:
                q = deque([(sx, sy)]); seen[sy][sx] = True; cells = []
                while q:
                    x, y = q.popleft(); cells.append((x, y))
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < gw and 0 <= ny < gh and grid[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = True; q.append((nx, ny))
                out.append(cells)
    return out


def build_frame(body, grey, dark, gw, gh, want_laptop):
    """Uc maskeden tek bir karakter izgarasi uretir."""
    comps = components(body, gw, gh)
    if comps:
        biggest = max(len(c) for c in comps)
        keep = [[0] * gw for _ in range(gh)]
        for c in comps:
            if len(c) >= biggest * 0.25:
                for x, y in c:
                    keep[y][x] = 1
        body = keep

    seen = [[False] * gw for _ in range(gh)]
    q = deque()
    for x in range(gw):
        for y in (0, gh - 1):
            if not body[y][x] and not seen[y][x]:
                seen[y][x] = True; q.append((x, y))
    for y in range(gh):
        for x in (0, gw - 1):
            if not body[y][x] and not seen[y][x]:
                seen[y][x] = True; q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < gw and 0 <= ny < gh and not body[ny][nx] and not seen[ny][nx]:
                seen[ny][nx] = True; q.append((nx, ny))

    out = [[EMPTY_CH] * gw for _ in range(gh)]
    for y in range(gh):
        for x in range(gw):
            if body[y][x]:
                out[y][x] = BODY_CH
            elif not seen[y][x] and dark[y][x]:
                out[y][x] = EYE_CH

    if want_laptop:
        bxs = [x for y in range(gh) for x in range(gw) if body[y][x]]
        bys = [y for y in range(gh) for x in range(gw) if body[y][x]]
        if bxs:
            bx0, bx1 = min(bxs), max(bxs)
            by0, by1 = min(bys), max(bys)
            bw, bh = bx1 - bx0 + 1, by1 - by0 + 1
            area = len(bxs)
            nx0, nx1 = bx0 - 1.5 * bw, bx1 + 1.5 * bw
            ny0, ny1 = by0 - 1.0 * bh, by1 + 0.12 * bh
            cand = [[1 if (out[y][x] == EMPTY_CH and grey[y][x]) else 0
                     for x in range(gw)] for y in range(gh)]
            for cells in components(cand, gw, gh):
                if not (2 <= len(cells) <= max(24, area * 0.9)):
                    continue
                cxs = [c[0] for c in cells]; cys = [c[1] for c in cells]
                if (min(cxs) < nx0 or max(cxs) > nx1
                        or min(cys) < ny0 or max(cys) > ny1):
                    continue
                for x, y in cells:
                    out[y][x] = LAPTOP_CH
    return ["".join(r) for r in out]


def trim(frames):
    gh = len(frames[0]); gw = len(frames[0][0])
    x0 = y0 = 10 ** 9; x1 = y1 = -1
    for f in frames:
        for y in range(gh):
            row = f[y]
            for x in range(gw):
                if row[x] != EMPTY_CH:
                    if x < x0: x0 = x
                    if x > x1: x1 = x
                    if y < y0: y0 = y
                    if y > y1: y1 = y
    if x1 < 0:
        sys.exit("Hicbir karede maskot bulunamadi.")
    x0 = max(0, x0 - 1); y0 = max(0, y0 - 1)
    x1 = min(gw - 1, x1 + 1); y1 = min(gh - 1, y1 + 1)
    return [[r[x0:x1 + 1] for r in f[y0:y1 + 1]] for f in frames]


def fit_canvas(frames, cw, ch):
    gh = len(frames[0]); gw = len(frames[0][0])
    ox = (cw - gw) // 2
    oy = ch - gh - 2
    out = []
    for f in frames:
        canvas = [[EMPTY_CH] * cw for _ in range(ch)]
        for y in range(gh):
            for x in range(gw):
                tx, ty = x + ox, y + oy
                if 0 <= tx < cw and 0 <= ty < ch:
                    canvas[ty][tx] = f[y][x]
        out.append(["".join(r) for r in canvas])
    return out


def vote(run, gw, gh):
    """Kume icindeki karelerden hucre bazinda cogunluk karesi."""
    if len(run) == 1:
        return run[0]
    return ["".join(Counter(f[y][x] for f in run).most_common(1)[0][0]
                    for x in range(gw)) for y in range(gh)]


def contact_sheet(frames, path, scale=4):
    gh = len(frames[0]); gw = len(frames[0][0])
    cols = min(8, len(frames)); rows = math.ceil(len(frames) / cols)
    pad = 3
    sheet = Image.new("RGB", (cols * (gw + pad) * scale, rows * (gh + pad) * scale),
                      (18, 20, 24))
    rgb = {BODY_CH: (216, 118, 86), EYE_CH: (43, 42, 38), LAPTOP_CH: (139, 139, 139)}
    for i, f in enumerate(frames):
        tile = Image.new("RGB", (gw, gh), (30, 33, 39))
        tp = tile.load()
        for y in range(gh):
            for x in range(gw):
                if f[y][x] in rgb:
                    tp[x, y] = rgb[f[y][x]]
        tile = tile.resize((gw * scale, gh * scale), Image.NEAREST)
        sheet.paste(tile, ((i % cols) * (gw + pad) * scale,
                           (i // cols) * (gh + pad) * scale))
    sheet.save(path)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("kaynak", type=Path, help="video, gif ya da PNG dizini")
    ap.add_argument("-o", "--out", type=Path, default=Path("poses.json"))
    ap.add_argument("--name", default="laptop_code", help="animasyon adi")
    ap.add_argument("--preview", type=Path, help="kontrol icin kare tablosu PNG'si")
    ap.add_argument("--canvas", help="cikti tuvalini sabitle, orn 53x37")
    ap.add_argument("--grid", type=int, default=REFERENCE_BODY_CELLS,
                    help=f"maskotun eni kac hucre olsun "
                         f"(varsayilan {REFERENCE_BODY_CELLS} = referansla ayni olcek). "
                         "Daha fazla ayrinti icin buyut, daha iri blok icin kucult.")
    ap.add_argument("--cell", type=float,
                    help="hucre boyutunu piksel cinsinden elle ver (--grid'i gecersiz kilar)")
    ap.add_argument("--fps", type=float, help="cikti fps'ini elle ver")
    ap.add_argument("--start", help="kayitta baslangic, orn 00:00:03")
    ap.add_argument("--duration", help="islenecek sure, orn 6")
    ap.add_argument("--every", type=int, default=0,
                    help="her N kareden birini al (0 = otomatik: 35 fps altina indirir)")
    ap.add_argument("--no-laptop", action="store_true", help="gri parcalari arama")
    ap.add_argument("--no-locate", action="store_true", help="kirpma, tum kareyi isle")
    ap.add_argument("--keep-dupes", action="store_true", help="ayni kareleri katlama")
    ap.add_argument("--tol", type=int,
                    help="kac hucre farka kadar iki kare ayni sayilsin")
    ap.add_argument("--pad", type=float, default=0.55,
                    help="maskot cevresine birakilacak pay orani")
    a = ap.parse_args()

    if not a.kaynak.exists():
        sys.exit(f"Bulunamadi: {a.kaynak}")

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        if a.kaynak.is_dir():
            shots = sorted(p for p in a.kaynak.iterdir()
                           if p.suffix.lower() in IMAGE_SUFFIXES)[:: max(1, a.every)]
            if not shots:
                sys.exit("Dizinde goruntu yok.")
            fps_in = (a.fps or 30.0)
        else:
            if a.kaynak.suffix.lower() not in VIDEO_SUFFIXES:
                sys.exit(f"Desteklenmeyen dosya: {a.kaynak.suffix}")
            fps_in = source_fps(a.kaynak)
            if not a.every:
                a.every = max(1, math.ceil(fps_in / 35))
                if a.every > 1:
                    print(f"kare atlama    : her {a.every} kareden biri "
                          f"({fps_in:.4g} fps gereginden hizli)")
            crop = None if a.no_locate else locate(a.kaynak, a.start, a.duration, a.pad)
            if crop:
                print(f"maskot bolgesi : x{crop[0]} y{crop[1]}  {crop[2]}x{crop[3]}")
            shots = dump_frames(a.kaynak, tmp, crop, a.start, a.duration, a.every)
        fps_in /= max(1, a.every)
        print(f"kaynak         : {len(shots)} kare @ {fps_in:.4g} fps")
        if not shots:
            sys.exit("Islenecek kare yok.")

        mask_list = [masks(Image.open(s).convert("RGB")) for s in shots]
        bx0, by0, bx1, by1 = body_union(mask_list)
        cell = float(a.cell) if a.cell else (bx1 - bx0) / a.grid
        if cell < 1.2:
            sys.exit(f"Maskot cok kucuk gorunuyor ({bx1-bx0} px). Uygulamayi "
                     "buyutup yeniden kaydet, ya da --grid degerini dusur.")

        # Izgara tum kirpilmis kareyi kapsasin: laptop govdenin epey solunda
        # duruyor, dar bir pay onu kesiyor. Fazla kalan bosluk zaten en sonda
        # trim() ile kirpiliyor, yani comert olmanin bedeli yok.
        full_w, full_h = mask_list[0][0].size
        phx = phy = 0.0
        gw = int(full_w / cell)
        gh = int(full_h / cell)
        print(f"govde           : {bx1-bx0} x {by1-by0} px")
        print(f"hucre boyutu   : {cell:.2f} px  ->  {gw}x{gh} izgara "
              f"(govde eni {a.grid} hucre)")

        frames = []
        for bm, gm, dm in mask_list:
            frames.append(build_frame(
                shrink(bm, cell, (phx, phy), (gw, gh)),
                shrink(gm, cell, (phx, phy), (gw, gh)),
                shrink(dm, cell, (phx, phy), (gw, gh)),
                gw, gh, not a.no_laptop))
        del mask_list

    frames = trim(frames)
    # esik kirpilmis icerige gore hesaplanir; --canvas ile eklenen bos pay
    # esigi sisirmesin
    tol_w, tol_h = len(frames[0][0]), len(frames[0])

    if a.canvas:
        try:
            cw, ch = (int(v) for v in a.canvas.lower().split("x"))
        except ValueError:
            sys.exit("--canvas bicimi: GENISLIKxYUKSEKLIK, orn 53x37")
        frames = fit_canvas(frames, cw, ch)

    holds = [1] * len(frames)
    if not a.keep_dupes:
        fw, fh = len(frames[0][0]), len(frames[0])
        tol = a.tol if a.tol is not None else max(2, round(tol_w * tol_h * 0.006))
        runs = [[frames[0]]]
        for f in frames[1:]:
            ref = runs[-1][0]
            diff = sum(1 for y in range(fh) for x in range(fw) if f[y][x] != ref[y][x])
            if diff <= tol:
                runs[-1].append(f)
            else:
                runs.append([f])
        frames = [vote(r, fw, fh) for r in runs]
        holds = [len(r) for r in runs]
        print(f"esik           : {tol} hucre farkina kadar ayni sayildi")

    g = 0
    for hc in holds:
        g = math.gcd(g, hc)
    g = max(1, g)
    holds = [hc // g for hc in holds]
    fps_out = a.fps or (fps_in / g)
    while fps_out > 24:
        fps_out /= 2
        holds = [max(1, round(hc / 2)) for hc in holds]
    fps_out = max(2, round(fps_out))

    print(f"benzersiz kare : {len(frames)}   tutma: {holds}")
    print(f"onerilen fps   : {fps_out}")
    print(f"tuval          : {len(frames[0][0])} x {len(frames[0])}")

    payload = {
        "w": len(frames[0][0]),
        "h": len(frames[0]),
        "palette": PALETTE,
        "format": "grid",
        "animations": [{
            "name": a.name,
            "fps": fps_out,
            "loop": False,
            "holds": holds,
            "frames": frames,
        }],
    }
    a.out.write_text(json.dumps(payload, indent=1), encoding="utf-8")
    print(f"yazildi        : {a.out}")

    if a.preview:
        contact_sheet(frames, a.preview)
        print(f"kontrol tablosu: {a.preview}")


if __name__ == "__main__":
    main()
