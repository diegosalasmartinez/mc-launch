import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { GamePaths } from "../config/paths.js";
import {
  IPC,
  type ContentType,
  type PlayOptions,
  type Settings,
} from "../shared/ipc.js";
import {
  findUpdates,
  getReleaseNotes,
  installContent,
  listInstalled,
  listRecommendedMods,
  listRecommendedResourcepacks,
  listRecommendedShaders,
  listVersions,
  play,
  removeInstalled,
  updateContent,
} from "./launcherService.js";
import { loadSettings, saveSettings } from "./settings.js";

// keep dev and packaged on the same userData dir (else dev="mc-launch", packaged="MC Launch")
app.setName("MC Launch");

// set under `electron-vite dev` (renderer served over http)
const devRendererUrl = process.env["ELECTRON_RENDERER_URL"];

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 920,
    height: 640,
    show: false,
    backgroundColor: "#0f1115",
    webPreferences: {
      // renderer gets no node access; it talks to main only through the preload contextBridge
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.on("ready-to-show", () => win.show());

  // keep the app single-page: open link clicks (e.g. in release notes) in the os browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  win.webContents.on("did-finish-load", () => {
    console.log("[main] renderer loaded");

    // test hook: MCL_SCREENSHOT=<path> captures the window to a png, then quits
    const shot = process.env["MCL_SCREENSHOT"];
    if (shot) {
      const delay = Number(process.env["MCL_SCREENSHOT_DELAY"] ?? 2500);
      setTimeout(() => {
        win.webContents
          .capturePage()
          .then((img) => writeFile(shot, img.toPNG()))
          .then(() => console.log(`[main] screenshot -> ${shot}`))
          .catch((e) => console.error("[main] screenshot failed", e))
          .finally(() => app.quit());
      }, delay);
    }
  });

  // test hook: MCL_AUTOPLAY=1 auto-invokes play() through the real ipc path (verify launch without a click)
  const qs: string[] = [];
  if (process.env["MCL_AUTOPLAY"] === "1") {
    qs.push("autoplay=1");
    qs.push(`u=${encodeURIComponent(process.env["MCL_USERNAME"] ?? "Player")}`);
    qs.push(`v=${encodeURIComponent(process.env["MCL_VERSION"] ?? "")}`);
  }
  // MCL_PROGRESS forces the progress line; MCL_ERROR seeds the friendly error mapper (ui tests)
  if (process.env["MCL_PROGRESS"]) {
    qs.push(`progress=${encodeURIComponent(process.env["MCL_PROGRESS"])}`);
  }
  if (process.env["MCL_ERROR"]) {
    qs.push(`error=${encodeURIComponent(process.env["MCL_ERROR"])}`);
  }
  const query = qs.join("&");

  if (devRendererUrl) {
    void win.loadURL(query ? `${devRendererUrl}?${query}` : devRendererUrl);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"), {
      search: query,
    });
  }

  return win;
}

function registerIpc(): void {
  ipcMain.handle(IPC.listVersions, async () => {
    const versions = await listVersions();
    console.log(`[main] listVersions -> ${versions.length} versions`);
    return versions;
  });

  ipcMain.handle(IPC.getReleaseNotes, (_event, version: string) =>
    getReleaseNotes(version),
  );

  ipcMain.handle(IPC.getSettings, () => loadSettings());
  ipcMain.handle(IPC.saveSettings, (_event, settings: Settings) =>
    saveSettings(settings),
  );

  ipcMain.handle(IPC.openModsFolder, async (_event, version: string) => {
    const dir = new GamePaths().modsDir(version);
    await mkdir(dir, { recursive: true });
    await shell.openPath(dir);
  });

  ipcMain.handle(IPC.openShadersFolder, async () => {
    const dir = new GamePaths().shaderpacksDir;
    await mkdir(dir, { recursive: true });
    await shell.openPath(dir);
  });

  ipcMain.handle(IPC.openResourcepacksFolder, async () => {
    const dir = new GamePaths().resourcepacksDir;
    await mkdir(dir, { recursive: true });
    await shell.openPath(dir);
  });

  ipcMain.handle(IPC.listRecommendedMods, (_event, version: string) =>
    listRecommendedMods(version),
  );
  ipcMain.handle(IPC.listRecommendedShaders, (_event, version: string) =>
    listRecommendedShaders(version),
  );
  ipcMain.handle(IPC.listRecommendedResourcepacks, (_event, version: string) =>
    listRecommendedResourcepacks(version),
  );
  ipcMain.handle(
    IPC.installContent,
    (_event, type: ContentType, slug: string, version: string) => {
      console.log(`[main] install ${type} ${slug} for ${version}`);
      return installContent(type, slug, version);
    },
  );

  ipcMain.handle(
    IPC.listInstalled,
    (_event, type: ContentType, version: string) =>
      listInstalled(type, version),
  );

  ipcMain.handle(
    IPC.removeInstalled,
    (_event, type: ContentType, version: string, fileName: string) => {
      console.log(`[main] remove ${type} ${fileName} (${version})`);
      return removeInstalled(type, version, fileName);
    },
  );

  ipcMain.handle(
    IPC.findUpdates,
    (_event, type: ContentType, version: string) =>
      findUpdates(type, version),
  );

  ipcMain.handle(
    IPC.updateContent,
    (_event, type: ContentType, version: string, oldFileName: string) => {
      console.log(`[main] update ${type} ${oldFileName} (${version})`);
      return updateContent(type, version, oldFileName);
    },
  );

  ipcMain.handle(
    IPC.play,
    async (event: IpcMainInvokeEvent, opts: PlayOptions) => {
      console.log(`[main] play ${opts.version} as ${opts.username}`);
      return play(opts, (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(IPC.progress, progress);
        }
      });
    },
  );
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // drop the default File/Edit/View menu bar
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // non-macos: quit when the last window closes
  if (process.platform !== "darwin") app.quit();
});
