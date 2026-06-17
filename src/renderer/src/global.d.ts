import type { LauncherApi } from "../../shared/ipc.js";

declare global {
  interface Window {
    mcl: LauncherApi;
  }
}

export {};
