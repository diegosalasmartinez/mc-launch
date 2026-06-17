import path from "node:path";
import { getHostPlatform, homeDir } from "./platform.js";

// standard .minecraft root per os, matching vanilla so files interoperate with it
export function minecraftRoot(): string {
  const { os } = getHostPlatform();
  if (os === "windows") {
    const appData = process.env["APPDATA"];
    if (appData) return path.join(appData, ".minecraft");
    return path.join(homeDir(), "AppData", "Roaming", ".minecraft");
  }
  return path.join(homeDir(), ".minecraft");
}

export class GamePaths {
  constructor(public readonly root: string = minecraftRoot()) {}

  get versionsDir(): string {
    return path.join(this.root, "versions");
  }

  get librariesDir(): string {
    return path.join(this.root, "libraries");
  }

  get assetsDir(): string {
    return path.join(this.root, "assets");
  }

  get assetIndexesDir(): string {
    return path.join(this.assetsDir, "indexes");
  }

  get assetObjectsDir(): string {
    return path.join(this.assetsDir, "objects");
  }

  get runtimeRoot(): string {
    return path.join(this.root, "runtime");
  }

  // mirrors vanilla's nesting (runtime/<component>/<platformKey>/<component>/) so the official launcher can reuse it
  runtimeDir(component: string, platformKey: string): string {
    return path.join(this.runtimeRoot, component, platformKey, component);
  }

  versionDir(version: string): string {
    return path.join(this.versionsDir, version);
  }

  versionJar(version: string): string {
    return path.join(this.versionDir(version), `${version}.jar`);
  }

  versionJson(version: string): string {
    return path.join(this.versionDir(version), `${version}.json`);
  }

  nativesDir(version: string): string {
    return path.join(this.versionDir(version), "natives");
  }

  library(relativePath: string): string {
    return path.join(this.librariesDir, relativePath);
  }

  assetIndexJson(id: string): string {
    return path.join(this.assetIndexesDir, `${id}.json`);
  }

  assetObject(hash: string): string {
    return path.join(this.assetObjectsDir, hash.slice(0, 2), hash);
  }
}
