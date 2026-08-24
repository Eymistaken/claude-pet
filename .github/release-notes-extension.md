The **GNOME Shell 46** extension. Requires GNOME Shell 46 on Wayland.

Installing from this zip:

```bash
gnome-extensions install --force claude-pet@eymistaken.local.shell-extension.zip
gnome-extensions enable claude-pet@eymistaken.local
```

Then log out and back in — on Wayland the shell cannot be restarted, and
GNOME 45+ caches extension modules, so a new install only takes effect in a
new session.

The pet needs Claude Code's hooks to hear anything. From a clone of the
repository:

```bash
make hooks
```

Full setup, settings and troubleshooting:
**[README.md](https://github.com/Eymistaken/claude-pet/blob/master/README.md)**

> **On KDE, Sway, Hyprland or COSMIC?** This extension will not work there —
> Mutter is the only compositor it targets. Use the AppImage build instead;
> it is tagged `v*` on this releases page.
