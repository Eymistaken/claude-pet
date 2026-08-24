# claude-pet — AppImage (KDE and other Wayland desktops)

This repository ships **two builds** of the mascot. They use the same
animations and the same state machine; they differ only in how the mascot gets
onto the screen.

| Your desktop | What to use |
|---|---|
| **GNOME** (Wayland) | the GNOME Shell extension — [README.md](README.md) |
| **KDE Plasma** (Wayland) | **this AppImage** |
| Sway · Hyprland · COSMIC · Mir | **this AppImage** |
| any X11 session | neither — see [Why no X11](#why-no-x11) |

It comes down to a single protocol: `wlr-layer-shell`. KWin, wlroots and
Smithay speak it; GNOME's compositor Mutter does not. The extension works
around its absence by drawing into the shell itself; the AppImage just uses
the protocol.

---

## Install

1. Download `Claude_Pet-x86_64.AppImage` from the
   [Releases](https://github.com/Eymistaken/claude-pet/releases) page.
2. Make it executable and run it:

```bash
chmod +x Claude_Pet-x86_64.AppImage && ./Claude_Pet-x86_64.AppImage
```

On first run three things are set up automatically — all three are reversible
from the settings window:

- **Claude Code hooks** (`~/.claude/settings.json`). This is the only way the
  pet hears what Claude is doing. The script is copied to
  `~/.local/share/claude-pet/` first, because the directory an AppImage is
  mounted at changes on every launch.
- **Autostart** (`~/.config/autostart/claude-pet.desktop`), so the pet is
  ready in the background when you log in.
- **A menu entry** and icon.

> A Claude Code session that is already open may not pick up the new hooks
> immediately; the reliable path is to start a new session.

## Using it

**Running the AppImage a second time opens the settings.** It does not start a
second pet: it reaches the running instance and asks it to show the settings
window. Autostart passes `--daemon`, so no window appears at login.

**Right-click** the pet: Pause · Settings · Reset position · Quit.
Move it by **dragging**; where you drop it is saved relative to the monitor.

| Setting | What it does |
|---|---|
| **Pet** | Master switch. Turned off, the mascot never appears and process polling stops. |
| Size | Pixel edge of one sprite cell (1–8). |
| Laptop | Whether the laptop layer is drawn. |
| Idle timeout | If no event arrives for this many seconds, the pet stops counting as working. 0: off. |
| Notify while waiting for input | Desktop notification when Claude Code asks a question. |
| Monitor | Which monitor the pet sits on. |
| Start with the system | The autostart entry. |
| Show in the application menu | Menu entry and icon. |
| Claude Code hooks | Whether they are installed; install / remove. |

Settings are **not in dconf** — they are plain text in
`~/.config/claude-pet/ayarlar.conf`. That is deliberate: dconf is not
guaranteed to be present on a KDE installation.

## Requirements

| | |
|---|---|
| Session | **Wayland.** Does not work on X11 (see below). |
| Compositor | must support `wlr-layer-shell`: KWin, Sway, Hyprland, COSMIC, Mir |
| glibc | **≥ 2.39** |
| Python | 3.8+ — for the hook script, standard library only |
| FUSE | **not required** — packaged with a static runtime |

The glibc 2.39 floor covers Arch, Fedora 40+, Ubuntu 24.04+, KDE neon 24.04,
Debian 13 and openSUSE Tumbleweed.
**It does not cover** Debian 12, Ubuntu 22.04 or Linux Mint 21.

GTK4, libadwaita, gjs and `gtk4-layer-shell` are inside the package — you do
not need to install any of them.

## Why no X11

Layer shell is a Wayland protocol. Doing the same job on X11 means an
override-redirect window plus an input shape via
`XShapeCombineRectangles`; GTK4 exposes neither directly, and you have to
reach through the XID down to Xlib. That was left out of scope for this build.
Plasma 6 defaults to Wayland; on Plasma 5 pick "Plasma (Wayland)" in the
session chooser.

## How it differs from the extension

The same: animations (`assets/animations.json` is literally the same file),
the state machine, clip timing, position arithmetic — all of it comes from the
**same eight files** under `src/lib/`, not copies of them.

Different:

- **Fullscreen costs nothing.** The extension has to stop GNOME from
  "unredirecting" fullscreen windows, and that costs a few frames per second
  in fullscreen games. Nothing like that exists on the `overlay` layer.
- **Sharper click-through.** On Wayland the extension's input region was never
  applied at all, so the gap between the laptop and the character swallowed
  clicks. Here the input region is exactly the character's rectangle.
- **HiDPI.** The size setting is not multiplied by the screen scale factor;
  GTK4 draws in logical pixels and does the scaling itself.

## Uninstalling

Turn off all three system switches in the settings window (hooks, autostart,
menu entry), then delete the AppImage file. By hand — **note the order**, the
hook script has to remove its own entries before you delete it:

```bash
python3 ~/.local/share/claude-pet/claude-pet-hook.py uninstall
rm -f ~/.config/autostart/claude-pet.desktop
rm -f ~/.local/share/applications/io.github.eymistaken.ClaudePet.desktop
rm -f ~/.local/share/icons/hicolor/256x256/apps/claude-pet.png
rm -rf ~/.local/share/claude-pet ~/.local/state/claude-pet
rm -f ~/.config/claude-pet/ayarlar.conf
```

## Troubleshooting

**"this compositor does not support the wlr-layer-shell protocol"** — you are
on GNOME. Install the extension instead: [README.md](README.md).

**"no Wayland session found"** — you are in an X11 session.

**No pet, but no error either.** The pet only exists while Claude is running.
Run it from a terminal and watch the log:

```bash
./Claude_Pet-x86_64.AppImage --daemon
```

If it says `claude KAPALI (pet gizli)` the criterion is not met: it looks for
a process named `claude` or `claude-desktop` in `/proc`.

**The pet is there but does not react.** Check the "Claude Code hooks" row in
the settings; if it says 0 entries, press **Install** and start a new Claude
Code session.

## Building from source

```bash
make appimage
```

`tools/appimage.sh`, in order: sets up a local sysroot without sudo
(`apt-get download` + `dpkg-deb -x`), builds `gtk4-layer-shell` from source,
assembles the AppDir, walks the `ldd` closure, and calls `appimagetool`.
Nothing is written outside `build/`.

## Status

**Window behaviour has not been tested on KDE yet.** This build was verified
at the code level — 110 unit assertions, the package check, a complete
dependency closure — and it was confirmed to exit cleanly with "not
supported" on GNOME. But click-through, fullscreen, dragging and the
right-click menu have not been exercised in a real KWin session:

- [ ] The pet appears, bottom-right, at the right size
- [ ] Clicking outside the character reaches the window underneath (laptop included)
- [ ] The pet stays on top of fullscreen video and games
- [ ] Dragging works and the position survives a restart
- [ ] The right-click menu opens: Pause / Settings / Reset position / Quit
- [ ] Running the AppImage a second time opens the settings (no second pet)
- [ ] After a reboot the pet comes back on its own
- [ ] No pet while Claude is closed; it appears within seconds of `claude` starting

Please open an issue either way — whether you hit a problem or not.
