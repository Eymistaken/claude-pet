# claude-pet — GNOME Shell 46 eklentisi
#
# Sudo YOK: her sey kullanici dizinine kuruluyor.
# Gelistirme dongusu icin `make nested` (gercek oturuma dokunmaz).

UUID    := claude-pet@eymistaken.local
SRC     := src
ASSETS  := assets
BUILD   := build
STAGE   := $(BUILD)/stage
EXT_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
# Hook'larin olay biraktigi yer; tracker.js ayni yolu hesapliyor.
STATE_DIR := $(HOME)/.local/state/claude-pet

.PHONY: help schemas install uninstall enable disable check gif \
        nested nested-kill nested-clean nested-log preview logs pack prefs \
        hooks unhooks hooks-status replay replay-canli

help:
	@echo "claude-pet — hedefler"
	@echo
	@echo "  make install       eklentiyi $(EXT_DIR) altina kur"
	@echo "  make uninstall     kurulu eklentiyi sil"
	@echo "  make enable        GERCEK oturumda etkinlestir"
	@echo "  make disable       GERCEK oturumda devre disi birak"
	@echo "  make prefs         ayarlar penceresini ac"
	@echo
	@echo "  make nested        izole bir test oturumu baslat (gercek oturuma dokunmaz)"
	@echo "  make nested-log    test oturumunun logunu izle"
	@echo "  make nested-kill   test oturumunu ve yetim servisleri kapat"
	@echo "  make nested-clean  yalnizca yetim servisleri topla"
	@echo "  make preview       kareleri bagimsiz pencerede ciz (kabuga dokunmaz)"
	@echo "  make gif           README'deki docs/pet.gif'i yeniden uret"
	@echo "  make replay        hook/durum/klip/konum mantigini izole olarak sina"
	@echo "  make replay-canli  CANLI pet'i senaryoyla sur (tur|izin|ratelimit)"
	@echo "  make check         paket kontrolu (metadata, varlik, sema, sozdizimi)"
	@echo
	@echo "  make hooks         Claude Code hook'larini ~/.claude/settings.json'a ekle"
	@echo "  make unhooks       yalnizca claude-pet girdilerini geri al"
	@echo "  make hooks-status  ne kurulu, inbox'ta ne bekliyor"
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
# Poz atolyesinden kalan elle alinmis yedekler kuruluma girmesin (~300 KB,
# eklenti yalnizca animations.json okuyor).
	rm -f $(EXT_DIR)/assets/animations.yedek*.json
	@echo "kuruldu: $(EXT_DIR)"
	@echo "NOT: kurmak etkinlestirmek DEGIL. Test icin 'make nested'."

# Kaldirmak UC yer birakiyor: eklenti dizini, ~/.claude/settings.json'daki
# hook girdileri ve olay kutusu. Ucu de burada gidiyor.
#
# GSettings anahtarlari BILEREK kaliyor: onlar kullanicinin tercihi (konum,
# boyut), yeniden kurunca pet ayni yerde aciliyor. Silmek isteyen icin komut
# asagida yaziliyor.
uninstall:
	rm -rf $(EXT_DIR)
	@echo "silindi: $(EXT_DIR)"
	-@python3 hooks/claude-pet-hook.py uninstall
	rm -rf $(STATE_DIR)
	@echo "silindi: $(STATE_DIR)"
	@echo "ayarlar duruyor. Onlari da silmek icin:"
	@echo "  dconf reset -f /org/gnome/shell/extensions/claude-pet/"

# Bu iki hedef GERCEK masaustunu etkiler. Yeni kod once `make nested` ile
# denenmeli: bozuk bir eklenti Wayland'de butun oturumu dusurebilir.
enable:
	@echo "DIKKAT: gercek oturum. Geri alma: make disable"
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

# Nested oturumda calistirmak icin komutu o oturumun DISPLAY/DBUS'i ile
# vermek gerekir; `tools/nested.sh` ortami yaziyor.
prefs:
	gnome-extensions prefs $(UUID)

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

# Belgelerdeki GIF. Ekran KAYDI DEGIL: kareler dogrudan sprite.js ile
# ciziliyor, yani imlec/duvar kagidi/pencere kenari yok ve goruntu kabugun
# cizdiginin aynisi. GIF'i Cairo yazamadigi icin dizme isi PIL'de.
gif:
	python3 tools/gif.py

# Hook -> dosya -> FileMonitor -> durum zincirinin tamami, GECICI bir durum
# dizininde. Gercek inbox'a ve gercek oturuma dokunmuyor. Ilk is olarak bir
# kanarya kuruyor: inotify limiti doluysa FileMonitor SESSIZCE calismiyor ve
# bu mantik hatasi gibi gorunuyor.
replay:
	gjs -m tests/replay.js
	@echo
	gjs -m tests/director.js
	@echo
	gjs -m tests/layout.js

# Paket kontrolu: "baska bir makinede kurulur mu". Metadata/UUID tutarliligi,
# varlik dosyasinin bicimi, semanin --strict gecmesi, JS ve Python
# sozdizimi. Ayrintilar tools/kontrol.py basliginda.
check:
	@python3 tools/kontrol.py

# ------------------------------------------------------------------ hook'lar
#
# GERCEK ~/.claude/settings.json'a dokunuyor. Betik once zaman damgali bir
# yedek aliyor, elle yazilmis hook'lara dokunmuyor ve atomik yaziyor
# (gecici dosya + rename), yani yarim yazilmis bir settings.json olamaz.

# GERCEK inbox'a yaziyor, yani CALISAN pet'e. Izlemek icin: make nested
# baska bir terminalde acikken bunu calistir.
replay-canli:
	gjs -m tests/replay.js --canli $(SENARYO)

hooks:
	python3 hooks/claude-pet-hook.py install

unhooks:
	python3 hooks/claude-pet-hook.py uninstall

hooks-status:
	@python3 hooks/claude-pet-hook.py status

# Nested oturumun logu journalctl'e DEGIL dosyaya gidiyor; onun icin
# `make nested-log`. Bu hedef gercek oturumun kabugunu izler.
logs:
	journalctl -f -o cat /usr/bin/gnome-shell

# --------------------------------------------------------------------- paketleme

pack: check schemas
	rm -rf $(STAGE)
	mkdir -p $(STAGE)
# Varliklar once bir sahne dizinine kopyalanip yedekler ATILIYOR; dogrudan
# assets/ verilseydi poz atolyesinden kalan yedekler de pakete girerdi.
	cp -r $(ASSETS) $(STAGE)/
	rm -f $(STAGE)/assets/animations.yedek*.json
# `gnome-extensions pack` yalnizca BILDIGI dosyalari aliyor (metadata.json,
# extension.js, prefs.js, stylesheet.css, schemas/, locale/). lib/ ve assets/
# ACIKCA verilmezse pakete GIRMIYOR ve zip sessizce bozuk cikiyor --
# kurulunca eklenti "Unknown module: ./lib/sprite.js" ile olur.
	gnome-extensions pack $(SRC) --force --out-dir=$(BUILD) \
	  --extra-source=$(CURDIR)/$(SRC)/lib \
	  --extra-source=$(CURDIR)/$(STAGE)/assets
# DERLENMIS SEMA elle ekleniyor. `gnome-extensions pack` yalnizca .gschema.xml
# koyuyor (olculdu: zip listesinde gschemas.compiled yok), oysa
# `getSettings()` -> `SettingsSchemaSource.new_from_directory()` derlenmis
# dosyayi ariyor. Zip'ten kuran biri icin bu, eklentinin acilmamasi demek.
	cd $(SRC) && zip -q $(CURDIR)/$(BUILD)/$(UUID).shell-extension.zip \
	  schemas/gschemas.compiled
	@echo "paket: $(BUILD)/$(UUID).shell-extension.zip"
	@unzip -l $(BUILD)/$(UUID).shell-extension.zip | tail -n +4 | head -n -2
