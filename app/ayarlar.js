/* Ayar deposu — eklentiden AYRI ve dconf'suz.
 *
 * NEDEN KENDI DEPOSU: bu uygulama bir AppImage; sisteme sema kurma imkani
 * yok ve dconf'un kurulu oldugu da garanti degil (KDE'nin kendi ayar sistemi
 * ayri, minimal bir kurulumda dconf hic bulunmayabilir). Ikisi de cozuluyor:
 *
 *   sema     : paketin kendi dizininden `SettingsSchemaSource` ile okunuyor,
 *              `GSETTINGS_SCHEMA_DIR` ortam degiskenine bile gerek yok.
 *   arka uc  : `keyfile` — ayarlar duz metin olarak
 *              ~/.config/claude-pet/ayarlar.conf icinde. Hicbir servis
 *              gerekmiyor, kullanici dosyayi acip okuyabiliyor.
 *
 * ANAHTARLAR EKLENTIDEKININ AYNISI. Sema dosyasi `src/schemas/`tekinden
 * yalnizca id ve path degistirilerek turetildi; ayni `settings.bind` /
 * `changed::` mekanigi, dolayisiyla `src/prefs.js` de neredeyse birebir
 * tasinabiliyor.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const SEMA_ID = 'io.github.eymistaken.ClaudePet';
export const SEMA_YOLU = '/io/github/eymistaken/ClaudePet/';

/** Ayarlarin yazildigi duz metin dosya. */
export function ayarDosyasi() {
    return GLib.build_filenamev([
        GLib.get_user_config_dir(), 'claude-pet', 'ayarlar.conf']);
}

let _backend = null;
let _sema = null;

/** Semayi ve arka ucu bir kez kur. `semaDizini` derlenmis semanin (yani
 *  `gschemas.compiled`) bulundugu dizin. */
export function ayarlariKur(semaDizini) {
    if (_sema)
        return;

    const kaynak = Gio.SettingsSchemaSource.new_from_directory(
        semaDizini, Gio.SettingsSchemaSource.get_default(), true);
    _sema = kaynak.lookup(SEMA_ID, true);
    if (!_sema)
        throw new Error(`sema bulunamadi: ${SEMA_ID} (${semaDizini})`);

    const dosya = ayarDosyasi();
    GLib.mkdir_with_parents(GLib.path_get_dirname(dosya), 0o700);
    _backend = Gio.keyfile_settings_backend_new(dosya, SEMA_YOLU, null);
}

/** Yeni bir `Gio.Settings` tutamagi — hepsi AYNI arka ucu paylasiyor.
 *
 * Birden fazla tutamak gerekiyor cunku `delay()` KALICI: bir kez cagrildiktan
 * sonra o nesne bir daha aninda yazmiyor ve `undelay` diye bir sey yok
 * (eklentide olculdu, `extension.js::_writeInts`). Toplu yazma bu yuzden tek
 * kullanimlik bir tutamaktan geciyor.
 */
export function ayarlar() {
    if (!_sema)
        throw new Error('ayarlariKur() cagrilmadi');
    return Gio.Settings.new_full(_sema, _backend, null);
}

/** Birkac tam sayiyi TEK yazma olarak gonder.
 *
 * Ayri ayri yazmak, aradaki `changed` dinleyicisinin YARIM bir ucluyu
 * gormesi demek — yeni monitor + eski koordinat — ve pet bir kare boyunca
 * yanlis yere sicrar.
 */
export function tamSayilariYaz(degerler) {
    const yazici = ayarlar();
    yazici.delay();
    for (const [anahtar, deger] of Object.entries(degerler))
        yazici.set_int(anahtar, deger);
    yazici.apply();
}
