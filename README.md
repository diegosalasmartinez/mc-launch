# mc-launch

A small Minecraft launcher that just gets you into the game. Pick a version, type
a name, hit Play. It downloads the game files and the right version of Java for
you, so there's nothing to install first.

I built it from scratch to understand how launchers actually work, so it talks
straight to Mojang's servers the same way the official launcher does — no
third-party server in the middle.

Right now it runs in **offline mode**: you can play singleplayer under any name.
Joining official online servers or Realms needs a Microsoft login, which isn't
wired up yet (the code has a clean seam for it).

## Running it

```
npm install
npm run dev
```

To build an installer for your machine:

```
npm run dist
```

The result lands in `release/` — an `.msi` installer on Windows, a `.dmg` on
macOS, an AppImage on Linux. Each one has to be built on its own OS.

On Windows that first build can fail while unpacking `winCodeSign` with
*"A required privilege is not held by the client"*. electron-builder is
extracting a tool that contains macOS symlinks, and Windows won't create
symlinks without permission. Turn on **Developer Mode** (Settings → Privacy &
security → For developers) or run the terminal as administrator, then it builds
fine.

There's also a CLI if you'd rather skip the window:

```
npm run launch -- --version 1.21.1 --username Steve
npm run launch -- --prepare-only   # download + verify, don't launch
```

## How it works

It's the same pipeline every launcher runs: fetch Mojang's version manifest,
read the chosen version's metadata, download the client jar + libraries + assets
(each one checked against its SHA1), make sure a matching Java runtime is
present, then build the `java …` command and spawn it. Files go into the usual
`.minecraft` folder so they're shared with the official launcher.

The auto-Java part is the bit the reference projects leave to you: the launcher
reads which Java version the game needs, pulls the matching runtime from Mojang,
and points the launch at that — so the player never installs Java.

It's an Electron app. The main process is the "backend" — it owns all the
downloads, file I/O, and process launching. The React UI is a separate renderer
that can't touch the filesystem; it only calls the few methods exposed on
`window.mcl` over IPC. Keeping that boundary tight from the start meant the UI
never needed Node access.

## Where the code lives

```
src/
  core/      the launcher itself: manifest → downloads → java runtime → prepare
  net/       fetch wrapper, sha1-verified downloads, a small concurrency pool
  launch/    classpath, the java argument builder, spawning the process
  auth/      offline auth (and the seam a Microsoft provider would drop into)
  config/    .minecraft paths + os/arch detection
  types/     the shapes of Mojang's manifests
  main/      Electron main process + IPC handlers
  preload/   the contextBridge that exposes window.mcl
  renderer/  the React UI
  cli/       terminal entry point (same core, no window)
  shared/    the IPC contract both sides import
```

## Status

Works end to end on Windows, Linux and macOS: downloads and verifies everything,
fetches Java on its own, shows the version's release notes, and remembers your
last name and version. No Java required on the machine.

Not there yet: real Microsoft login (singleplayer only for now) and mod loaders.
