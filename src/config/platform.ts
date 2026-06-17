import os from "node:os";

// mojang's os/arch strings, used verbatim since they match version.json rules and natives classifiers.
export type MojangOs = "windows" | "linux" | "osx";
export type MojangArch = "x86" | "x64" | "arm64";

export interface HostPlatform {
  os: MojangOs;
  arch: MojangArch;
  classpathSeparator: string;
}

function detectOs(): MojangOs {
  switch (process.platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "osx";
    case "linux":
      return "linux";
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

function detectArch(): MojangArch {
  switch (process.arch) {
    case "x64":
      return "x64";
    case "ia32":
      return "x86";
    case "arm64":
      return "arm64";
    default:
      throw new Error(`Unsupported CPU architecture: ${process.arch}`);
  }
}

let cached: HostPlatform | undefined;

export function getHostPlatform(): HostPlatform {
  if (!cached) {
    const os = detectOs();
    cached = {
      os,
      arch: detectArch(),
      classpathSeparator: os === "windows" ? ";" : ":",
    };
  }
  return cached;
}

export function isWindows(): boolean {
  return getHostPlatform().os === "windows";
}

export function homeDir(): string {
  return os.homedir();
}
