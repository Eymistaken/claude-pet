# claude-pet — GNOME Shell 46 eklentisi
#
# Sudo YOK: her sey kullanici dizinine kuruluyor.
# Gelistirme dongusu icin `make nested` (gercek oturuma dokunmaz).

UUID    := claude-pet@eymistaken.local
SRC     := src
ASSETS  := assets
BUILD   := build
EXT_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: help schemas install uninstall enable disable \
        nested nested-kill nested-clean nested-log preview logs pack

help:
	@echo "claude-pet — hedefler"
	@echo
	@echo "  make install       eklentiyi $(EXT_DIR) altina kur"
	@echo "  make uninstall     kurulu eklentiyi sil"
	@echo "  make enable        GERCEK oturumda etkinlestir"
	@echo "  make disable       GERCEK oturumda devre disi birak"
	@echo
	@echo "  make nested        izole bir test oturumu baslat (gercek oturuma dokunmaz)"
	@echo "  make nested-log    test oturumunun logunu izle"
	@echo "  make nested-kill   test oturumunu ve yetim servisleri kapat"
	@echo "  make nested-clean  yalnizca yetim servisleri topla"
	@echo "  make preview       kareleri bagimsiz pencerede ciz (kabuga dokunmaz)"
	@echo
	@echo "  make logs          GERCEK oturumun gnome-shell logu"
	@echo "  make pack          dagitilabilir .zip uret"

# --------------------------------------------------------------------- kurulum

schemas:
	glib-compile-schemas $(SRC)/schemas/

# assets/ bilerek src/ disinda duruyor: o bir VARLIK, kod degil (poz
# atolyesinden dogrudan uzerine yaziliyor). Eklenti onu kendi dizininden
# okudugu icin kurulumda iceri kopyalaniyor.
install: schemas
	rm -rf $(EXT_DIR)
	mkdir -p $(EXT_DIR)
	cp -r $(SRC)/. $(EXT_DIR)/
	cp -r $(ASSETS) $(EXT_DIR)/
	@echo "kuruldu: $(EXT_DIR)"
	@echo "NOT: kurmak etkinlestirmek DEGIL. Test icin 'make nested'."

uninstall:
	rm -rf $(EXT_DIR)
	@echo "silindi: $(EXT_DIR)"

# Bu iki hedef GERCEK masaustunu etkiler. Yeni kod once `make nested` ile
# denenmeli: bozuk bir eklenti Wayland'de butun oturumu dusurebilir.
enable:
	@echo "DIKKAT: gercek oturum. Geri alma: make disable"
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

# ------------------------------------------------------------ gelistirme dongusu

nested:
	@tools/nested.sh

nested-kill:
	@tools/nested.sh --oldur

nested-clean:
	@tools/nested.sh --temizle

nested-log:
	@tools/nested.sh --log

# Sanat iterasyonunun tamami buradan: kabuk yeniden baslamiyor, saniyeler
# yerine aninda aciliyor. Cizimi src/lib/sprite.js'ten aliyor, yani burada
# gordugun kare kabugun cizdiginin aynisi.
preview:
	gjs -m tools/preview.js

# Nested oturumun logu journalctl'e DEGIL dosyaya gidiyor; onun icin
# `make nested-log`. Bu hedef gercek oturumun kabugunu izler.
logs:
	journalctl -f -o cat /usr/bin/gnome-shell

# --------------------------------------------------------------------- paketleme

pack: schemas
	mkdir -p $(BUILD)
# `gnome-extensions pack` yalnizca BILDIGI dosyalari aliyor (metadata.json,
# extension.js, prefs.js, stylesheet.css, schemas/, locale/). lib/ ve assets/
# ACIKCA verilmezse pakete GIRMIYOR ve zip sessizce bozuk cikiyor --
# kurulunca eklenti "Unknown module: ./lib/sprite.js" ile olur.
	gnome-extensions pack $(SRC) --force --out-dir=$(BUILD) \
	  --extra-source=$(CURDIR)/$(SRC)/lib \
	  --extra-source=$(CURDIR)/$(ASSETS)
	@echo "paket: $(BUILD)/$(UUID).shell-extension.zip"
