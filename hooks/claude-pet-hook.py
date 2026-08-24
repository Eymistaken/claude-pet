#!/usr/bin/env python3
"""claude-pet — Claude Code hook koprusu.

IKI MOD, TEK DOSYA:

  (argumansiz)  YAZICI. stdin'den hook JSON'unu okur, inbox'a kucuk bir olay
                dosyasi birakir, biter. Claude Code her olayda bunu calistiriyor.
  install       ~/.claude/settings.json'a kendi hook girdilerini ekler
  uninstall     yalnizca KENDI girdilerini siler
  status        ne kurulu, nerede yaziyor, inbox'ta ne var

YAZICI MODU ICIN UC KURAL:

1. HIC HATA VERMEZ. Her sey try/except icinde ve cikis kodu her zaman 0.
   Bu betigin basarisizligi Claude Code'un isini bozmamali -- kullanicinin
   oturumu bir maskot yuzunden takilmaz.
2. HIZLI. Yalnizca gomulu C modulleri iceri aliniyor (json, os, sys, time);
   kurulum modunun ihtiyaclari fonksiyonlarin ICINDE import ediliyor. Olculdu:
   yazma yolu ~15 ms (hedef 50 ms alti).
3. KUCUK. Hook yukleri megabaytlarca olabiliyor (arac girdileri, dosya
   icerikleri). Yalnizca uc alan saklaniyor; gerisi diske hic inmiyor.

ATOMIK YAZMA: gecici dosya inbox'in DISINA, ust dizine yaziliyor ve oraya
rename ediliyor. Boylece izleyici yalnizca tam yazilmis dosyayi goruyor --
`Gio.FileMonitor` yarim bir dosyayi okuyup "bozuk" diye silmiyor.
"""

import json
import os
import sys
import time

# Kendi girdilerimizi taniyan sabit isaret. `uninstall` yalnizca komut satirinda
# bunu gorenleri siliyor; elle yazilmis hook'lar bu yuzden guvende.
ISARET = "claude-pet-hook.py"

# Kaydolunan olaylar. `PreToolUse` disinda matcher yok -- hangi arac oldugu
# umurumuzda degil, herhangi bir arac cagrisi "calisiyor" demek.
OLAYLAR = (
    ("UserPromptSubmit", None),   # ise basladi
    ("PreToolUse", "*"),          # calisiyor
    ("PermissionRequest", None),  # sana soruyor
    ("Notification", None),       # sana soruyor / dikkat
    ("Stop", None),               # bitti
    ("StopFailure", None),        # rate limit ve diger API hatalari
    ("SessionEnd", None),         # kapandi
)

# Saklanan alanlar. Durum makinesinin ihtiyaci tam olarak bu kadar.
ALANLAR = ("hook_event_name", "notification_type", "error_type")

# SessionEnd'de yapilan temizligin yas siniri (saniye). Eklenti kapaliyken
# hook'lar yazmaya devam ediyor; kimse okumazsa dizin sinirsiz buyur.
BAYAT_SN = 3600


def durum_dizini():
    """Olay dosyalarinin kok dizini. Test icin ortam degiskeniyle ezilebilir."""
    ozel = os.environ.get("CLAUDE_PET_STATE_DIR")
    if ozel:
        return ozel
    taban = os.environ.get("XDG_STATE_HOME") or os.path.expanduser("~/.local/state")
    return os.path.join(taban, "claude-pet")


def inbox_dizini():
    return os.path.join(durum_dizini(), "inbox")


# --------------------------------------------------------------------- yazici

def bayatlari_temizle(inbox):
    """Cok eski olay dosyalarini at.

    YALNIZCA SessionEnd'de cagriliyor: bir listdir'in bedeli var ve o olay
    oturum basina bir kez geliyor. Her yazmada yapilsa hook'un suresi
    dizin buyudukce artardi.
    """
    simdi = time.time()
    for ad in os.listdir(inbox):
        yol = os.path.join(inbox, ad)
        try:
            if simdi - os.stat(yol).st_mtime > BAYAT_SN:
                os.unlink(yol)
        except OSError:
            pass


def yaz():
    """stdin'deki hook yukunden inbox'a bir olay dosyasi birak."""
    ham = sys.stdin.read()
    yuk = json.loads(ham)

    olay = {alan: yuk.get(alan) for alan in ALANLAR if yuk.get(alan) is not None}
    ad = olay.get("hook_event_name")
    if not isinstance(ad, str) or not ad:
        return

    inbox = inbox_dizini()
    os.makedirs(inbox, exist_ok=True)

    # Dosya adi: <nanosaniye>-<olay>.json. Nanosaniye hem sirayi veriyor hem
    # de ayni olayin ust uste gelmesinde carpismayi onluyor.
    guvenli = "".join(c for c in ad if c.isalnum() or c in "-_")
    hedef = os.path.join(inbox, "%019d-%s.json" % (time.time_ns(), guvenli))

    # Gecici dosya inbox'in DISINA: izleyici yalnizca rename'i gorsun.
    gecici = os.path.join(durum_dizini(), ".yaz-%d-%d" % (os.getpid(), time.time_ns()))
    with open(gecici, "w", encoding="utf-8") as f:
        json.dump(olay, f)
    os.replace(gecici, hedef)

    if ad == "SessionEnd":
        bayatlari_temizle(inbox)


# -------------------------------------------------------------------- kurulum

def ayar_yolu():
    return os.path.join(os.path.expanduser("~"), ".claude", "settings.json")


def ayarlari_oku(yol):
    """settings.json'u oku. Yoksa bos sozluk; BOZUKSA hata firlat.

    Bozuk bir dosyanin uzerine yazmak kullanicinin butun yapilandirmasini
    silmek olurdu. O yuzden burada bilerek durulacak.
    """
    if not os.path.exists(yol):
        return {}
    with open(yol, encoding="utf-8") as f:
        metin = f.read()
    if not metin.strip():
        return {}
    veri = json.loads(metin)
    if not isinstance(veri, dict):
        raise ValueError("settings.json bir JSON nesnesi degil")
    return veri


def yedekle(yol):
    """Zaman damgali yedek. Var olan settings.json.bak'a DOKUNULMUYOR."""
    import shutil
    if not os.path.exists(yol):
        return None
    damga = time.strftime("%Y%m%d-%H%M%S")
    yedek = "%s.claude-pet-yedek-%s" % (yol, damga)
    shutil.copy2(yol, yedek)
    return yedek


def atomik_yaz(yol, veri):
    """Once gecerliligi dogrula, sonra gecici dosya + rename ile yaz."""
    metin = json.dumps(veri, ensure_ascii=False, indent=2) + "\n"
    # Uretilen metin gercekten ayristirilabiliyor mu? Bozuk bir settings.json
    # Claude Code'u acilista dusurur; kontrol bedava, riski buyuk.
    json.loads(metin)

    os.makedirs(os.path.dirname(yol), exist_ok=True)
    gecici = "%s.claude-pet-tmp-%d" % (yol, os.getpid())
    with open(gecici, "w", encoding="utf-8") as f:
        f.write(metin)
        f.flush()
        os.fsync(f.fileno())
    os.replace(gecici, yol)


def bizim_mu(girdi):
    """Bir hook grubu bize mi ait? Komut satirinda ISARET geciyorsa evet."""
    if not isinstance(girdi, dict):
        return False
    for kanca in girdi.get("hooks") or []:
        if isinstance(kanca, dict) and ISARET in str(kanca.get("command", "")):
            return True
    return False


def komut():
    import shlex
    return "python3 " + shlex.quote(os.path.realpath(__file__))


def kur():
    yol = ayar_yolu()
    veri = ayarlari_oku(yol)
    yedek = yedekle(yol)

    hooks = veri.setdefault("hooks", {})
    if not isinstance(hooks, dict):
        raise ValueError("settings.json icindeki 'hooks' bir nesne degil")

    komut_satiri = komut()
    eklenen = 0
    for olay, matcher in OLAYLAR:
        liste = hooks.setdefault(olay, [])
        if not isinstance(liste, list):
            raise ValueError("settings.json icindeki hooks.%s bir dizi degil" % olay)
        # Kendi girdimiz zaten varsa tazele; ELLE YAZILMIS girdilere dokunma.
        liste[:] = [g for g in liste if not bizim_mu(g)]
        girdi = {"hooks": [{"type": "command", "command": komut_satiri}]}
        if matcher is not None:
            girdi = {"matcher": matcher, "hooks": girdi["hooks"]}
        liste.append(girdi)
        eklenen += 1

    atomik_yaz(yol, veri)
    print("kuruldu: %d olay -> %s" % (eklenen, yol))
    if yedek:
        print("yedek  : %s" % yedek)
    print("komut  : %s" % komut_satiri)
    print("inbox  : %s" % inbox_dizini())
    print()
    print("NOT: Yeni acilan her oturum bu girdileri gorur. Zaten acik olan bir")
    print("     oturumun gormesi settings.json'u yeniden okumasina bagli --")
    print("     olculdu: acik bir oturum kurulumdan ~1 dk sonra olay yazmaya")
    print("     basladi, ama buna guvenme. Kesin yol: yeni oturum.")


def kaldir():
    yol = ayar_yolu()
    veri = ayarlari_oku(yol)
    hooks = veri.get("hooks")
    if not isinstance(hooks, dict):
        print("kurulu degil (hooks yok)")
        return

    yedek = yedekle(yol)
    silinen = 0
    for olay in list(hooks):
        liste = hooks.get(olay)
        if not isinstance(liste, list):
            continue
        once = len(liste)
        liste[:] = [g for g in liste if not bizim_mu(g)]
        silinen += once - len(liste)
        # Bosalan olay anahtarini da kaldir -- ama YALNIZCA biz bosalttiysak.
        if not liste:
            del hooks[olay]
    # `hooks` tamamen bosaldiysa anahtari birak; kullanici onu biz koymadan
    # once yazmis olabilir, bos bir nesne zararsiz.

    atomik_yaz(yol, veri)
    print("silinen girdi: %d" % silinen)
    if yedek:
        print("yedek        : %s" % yedek)


def durum():
    yol = ayar_yolu()
    print("settings.json : %s" % yol)
    try:
        veri = ayarlari_oku(yol)
    except Exception as hata:
        print("  OKUNAMADI: %s" % hata)
        return
    hooks = veri.get("hooks") or {}
    bizim, yabanci = [], []
    for olay, liste in hooks.items():
        for g in liste if isinstance(liste, list) else []:
            (bizim if bizim_mu(g) else yabanci).append(olay)
    print("  claude-pet girdileri : %d  %s" % (len(bizim), sorted(set(bizim))))
    print("  elle yazilmis hook'lar: %d  %s" % (len(yabanci), sorted(set(yabanci))))

    inbox = inbox_dizini()
    print("inbox         : %s" % inbox)
    try:
        dosyalar = sorted(os.listdir(inbox))
        print("  bekleyen olay: %d %s" % (len(dosyalar), dosyalar[-3:] if dosyalar else ""))
    except OSError:
        print("  (dizin henuz yok)")


# ----------------------------------------------------------------------- giris

def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else ""

    if arg == "install":
        kur()
    elif arg == "uninstall":
        kaldir()
    elif arg == "status":
        durum()
    elif arg in ("-h", "--help", "help"):
        print(__doc__)
    elif arg:
        print("bilinmeyen komut: %s  (install | uninstall | status)" % arg,
              file=sys.stderr)
        sys.exit(2)
    else:
        yaz()


if __name__ == "__main__":
    # Kurulum modu hatayi GOSTERMELI: kullanici komutu kendi calistiriyor ve
    # sessizce basarisiz olmasi en kotu sonuc. Yazici modu ise ASLA sikayet
    # etmez -- Claude Code'un isini bozmamak her seyden onemli.
    if len(sys.argv) > 1:
        try:
            main()
        except SystemExit:
            raise
        except Exception as hata:
            # Kurulum modu hatayi GOSTERIR ama yigin izi basmaz: en sik sebep
            # bozuk bir settings.json ve kullanicinin gormesi gereken sey o.
            # Hicbir sey yazilmadi -- yazma yolu once dogrulama yapiyor.
            print("HATA: %s" % hata, file=sys.stderr)
            print("settings.json'a HICBIR SEY yazilmadi.", file=sys.stderr)
            sys.exit(1)
    else:
        try:
            main()
        except Exception:
            pass
        sys.exit(0)
