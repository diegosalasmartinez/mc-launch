import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  IPC,
  type ContentType,
  type LauncherApi,
  type PlayOptions,
  type ProgressEvent,
  type Settings,
} from "../shared/ipc.js";

// the whole capability surface the renderer gets: one ipc channel per method, nothing else crosses contextIsolation
const api: LauncherApi = {
  listVersions: () => ipcRenderer.invoke(IPC.listVersions),
  getReleaseNotes: (version: string) =>
    ipcRenderer.invoke(IPC.getReleaseNotes, version),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (settings: Settings) =>
    ipcRenderer.invoke(IPC.saveSettings, settings),
  openModsFolder: (version: string) =>
    ipcRenderer.invoke(IPC.openModsFolder, version),
  openShadersFolder: () => ipcRenderer.invoke(IPC.openShadersFolder),
  listRecommendedMods: (version: string) =>
    ipcRenderer.invoke(IPC.listRecommendedMods, version),
  listRecommendedShaders: (version: string) =>
    ipcRenderer.invoke(IPC.listRecommendedShaders, version),
  installContent: (type: ContentType, slug: string, version: string) =>
    ipcRenderer.invoke(IPC.installContent, type, slug, version),
  play: (opts: PlayOptions) => ipcRenderer.invoke(IPC.play, opts),
  onProgress: (cb: (event: ProgressEvent) => void) => {
    const listener = (_e: IpcRendererEvent, data: ProgressEvent) => cb(data);
    ipcRenderer.on(IPC.progress, listener);
    return () => ipcRenderer.removeListener(IPC.progress, listener);
  },
};

contextBridge.exposeInMainWorld("mcl", api);
