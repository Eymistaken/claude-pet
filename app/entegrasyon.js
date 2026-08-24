/* Sistemle butunlesme — hook betigi, otomatik baslatma, menu girdisi.
 *
 * HEPSININ ORTAK SEBEBI: AppImage'in bagli oldugu dizin (`/tmp/.mount_XXXX`)
 * her acilista degisiyor. Disariya yazilan hicbir yol oraya isaret edemez:
 * AppImage kapandigi anda kirilir. O yuzden
 *
 *   hook betigi   ~/.local/share/claude-pet/ altina KOPYALANIYOR,
 *   autostart     `Exec=` satirinda $APPIMAGE (dosyanin kendisi) kullaniyor.
 *
 * `$APPIMAGE` degiskenini AppImage runtime'i veriyor ve bagli dizini degil,
 * kullanicinin diskindeki .AppImage dosyasini gosteriyor.
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const LOG = '[claude-pet]';

const MASAUSTU_ADI = 'io.github.eymistaken.ClaudePet.desktop';

/** Kalici veri dizini: hook betigi ve ilk calisma isareti burada. */
export function veriDizini() {
    return GLib.build_filenamev([GLib.get_user_data_dir(), 'claude-pet']);
}

export function hookYolu() {
    return GLib.build_filenamev([veriDizini(), 'claude-pet-hook.py']);
}

/** Calistirilabilir AppImage'in kendisi. AppImage disinda calisiyorsak
 *  (gelistirme) betigin kendi yolu. */
export function calistirilabilir() {
    return GLib.getenv('APPIMAGE') ?? GLib.build_filenamev([
        GLib.get_current_dir(), 'claude-pet']);
}

/** Hook betigini pakete degil, kalici yere kopyala. Her acilista tazeleniyor:
 *  yeni AppImage surumu yeni betigi de getirsin. */
export function hookuKopyala(kaynak) {
    try {
        GLib.mkdir_with_parents(veriDizini(), 0o755);
        const hedef = hookYolu();
        Gio.File.new_for_path(kaynak).copy(
            Gio.File.new_for_path(hedef), Gio.FileCopyFlags.OVERWRITE, null, null);
        GLib.chmod?.(hedef, 0o755);
        return hedef;
    } catch (error) {
        console.warn(`${LOG} hook betigi kopyalanamadi: ${error}`);
        return null;
    }
}

/** AppImage'in kutuphane ortamini TASIMAYAN bir ortam.
 *
 * AppRun `LD_PRELOAD` ve `LD_LIBRARY_PATH`i pakete cevirmis durumda; bunlarla
 * calistirilan konak `python3` bizim glib/gtk kopyalarimizi yuklemeye calisir
 * ve surumler tutmazsa acilmaz. Cocuk surece temiz bir ortam veriliyor.
 */
function temizOrtam() {
    let env = GLib.get_environ();
    for (const anahtar of ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'GI_TYPELIB_PATH',
        'GSETTINGS_SCHEMA_DIR', 'GSETTINGS_BACKEND', 'GIO_MODULE_DIR',
        'GDK_PIXBUF_MODULEDIR', 'GDK_PIXBUF_MODULE_FILE', 'GSK_RENDERER'])
        env = GLib.environ_unsetenv(env, anahtar);
    return env;
}

/** Hook betigini bir altkomutla calistir. Donen: [basarili, cikti]. */
function hookCalistir(...argv) {
    try {
        const [ok, cikti, hata, kod] = GLib.spawn_sync(
            null, ['python3', hookYolu(), ...argv], temizOrtam(),
            GLib.SpawnFlags.SEARCH_PATH, null);
        const metin = new TextDecoder().decode(ok ? cikti : hata);
        return [kod === 0, metin];
    } catch (error) {
        return [false, `${error}`];
    }
}

export function hooklariKur() {
    const [ok, cikti] = hookCalistir('install');
    console.log(`${LOG} hook kurulumu ${ok ? 'tamam' : 'BASARISIZ'}\n${cikti}`);
    return ok;
}

export function hooklariKaldir() {
    const [ok] = hookCalistir('uninstall');
    return ok;
}

/** Kac hook girdisi kurulu? `status` ciktisindan okunuyor. */
export function hookSayisi() {
    const [ok, cikti] = hookCalistir('status');
    if (!ok)
        return 0;
    const m = /kurulu girdi\s*:\s*(\d+)/i.exec(cikti) ?? /(\d+)\s*girdi/i.exec(cikti);
    return m ? Number(m[1]) : (cikti.includes('kurulu degil') ? 0 : -1);
}

// ------------------------------------------------------------- otomatik baslat

export function autostartYolu() {
    return GLib.build_filenamev([
        GLib.get_user_config_dir(), 'autostart', 'claude-pet.desktop']);
}

export function autostartAcikMi() {
    return GLib.file_test(autostartYolu(), GLib.FileTest.EXISTS);
}

export function autostartYaz(acik) {
    const yol = autostartYolu();
    try {
        if (!acik) {
            GLib.unlink(yol);
            return true;
        }
        GLib.mkdir_with_parents(GLib.path_get_dirname(yol), 0o755);
        // `--daemon`: acilista ayarlar penceresi ACILMASIN, yalnizca pet.
        GLib.file_set_contents(yol, [
            '[Desktop Entry]',
            'Type=Application',
            'Name=Claude Pet',
            'Comment=Claude Code durumunu masaustunde gosteren maskot',
            `Exec="${calistirilabilir()}" --daemon`,
            'Icon=claude-pet',
            'Terminal=false',
            'X-GNOME-Autostart-enabled=true',
            '',
        ].join('\n'));
        return true;
    } catch (error) {
        console.warn(`${LOG} autostart yazilamadi: ${error}`);
        return false;
    }
}

// ---------------------------------------------------------------- menu girdisi

export function masaustuGirdisiYolu() {
    return GLib.build_filenamev([
        GLib.get_user_data_dir(), 'applications', MASAUSTU_ADI]);
}

export function masaustuGirdisiVarMi() {
    return GLib.file_test(masaustuGirdisiYolu(), GLib.FileTest.EXISTS);
}

/** Uygulama menusune girdi + bildirim simgesi. Simge, bildirimlerin
 *  uygulamayi tanimasi icin de gerekiyor (GNotification .desktop'a bakiyor). */
export function masaustuGirdisiYaz(acik, ikonKaynagi) {
    const yol = masaustuGirdisiYolu();
    try {
        if (!acik) {
            GLib.unlink(yol);
            return true;
        }
        GLib.mkdir_with_parents(GLib.path_get_dirname(yol), 0o755);
        GLib.file_set_contents(yol, [
            '[Desktop Entry]',
            'Type=Application',
            'Name=Claude Pet',
            'Comment=Claude Code durumunu masaustunde gosteren maskot',
            `Exec="${calistirilabilir()}"`,
            'Icon=claude-pet',
            'Terminal=false',
            'Categories=Utility;',
            'StartupNotify=false',
            '',
        ].join('\n'));

        if (ikonKaynagi) {
            const ikonDizin = GLib.build_filenamev([GLib.get_user_data_dir(),
                'icons', 'hicolor', '256x256', 'apps']);
            GLib.mkdir_with_parents(ikonDizin, 0o755);
            Gio.File.new_for_path(ikonKaynagi).copy(
                Gio.File.new_for_path(
                    GLib.build_filenamev([ikonDizin, 'claude-pet.png'])),
                Gio.FileCopyFlags.OVERWRITE, null, null);
        }
        return true;
    } catch (error) {
        console.warn(`${LOG} masaustu girdisi yazilamadi: ${error}`);
        return false;
    }
}

// ----------------------------------------------------------------- ilk calisma

function isaretYolu() {
    return GLib.build_filenamev([veriDizini(), 'kuruldu']);
}

export function ilkCalismaMi() {
    return !GLib.file_test(isaretYolu(), GLib.FileTest.EXISTS);
}

export function ilkCalismayiIsaretle() {
    try {
        GLib.mkdir_with_parents(veriDizini(), 0o755);
        GLib.file_set_contents(isaretYolu(), `${new Date().toISOString()}\n`);
    } catch (error) {
        console.warn(`${LOG} ilk calisma isareti yazilamadi: ${error}`);
    }
}
