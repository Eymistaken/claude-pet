The **KDE / Wayland** build of the mascot. Download one file, run it — gjs,
GTK4, libadwaita and `gtk4-layer-shell` are all inside the package.

```bash
chmod +x Claude_Pet-x86_64.AppImage && ./Claude_Pet-x86_64.AppImage
```

Running the AppImage a second time opens the settings — it does not start a
second pet. Install, settings, uninstall and troubleshooting:
**[README-appimage.md](https://github.com/Eymistaken/claude-pet/blob/appimage/README-appimage.md)**

| | |
|---|---|
| Compositor | KWin · Sway · Hyprland · COSMIC · Mir — anything that speaks `wlr-layer-shell` |
| Session | **Wayland.** X11 is not supported. |
| glibc | **≥ 2.39** — Arch, Fedora 40+, Ubuntu 24.04+, KDE neon 24.04, Debian 13, openSUSE Tumbleweed |
| FUSE | not required (static runtime) |

**On GNOME this is the wrong build** — install the GNOME Shell extension from
the repository instead. Mutter does not support `wlr-layer-shell`.

### ⚠️ Pre-release

Verified at the code level — 110 unit assertions, the package check and a
complete dependency closure, all run in CI — but **window behaviour has not
been exercised in a real KWin session**: click-through, fullscreen, dragging,
the right-click menu and monitor selection. Please open an issue either way.

Verify the download with `sha256sum -c SHA256SUMS`.
