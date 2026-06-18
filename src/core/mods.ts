import path from "node:path";
import { access } from "node:fs/promises";
import type { GamePaths } from "../config/paths.js";
import { downloadVerified } from "../net/download.js";
import { mapLimit } from "../net/pool.js";
import {
  getCompatibleVersion,
  primaryFile,
  resolveRequiredDeps,
} from "./modrinth.js";
import type { ModrinthVersion } from "../types/modrinth.js";

const DOWNLOAD_CONCURRENCY = 8;

// Fabric mods declare the "fabric" loader; shaderpacks declare the "iris" shader loader.
export const FABRIC_LOADER = "fabric";
export const SHADER_LOADER = "iris";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// has this version's primary file already been written into `dir`?
export async function isInstalled(
  version: ModrinthVersion,
  dir: string,
): Promise<boolean> {
  const file = primaryFile(version);
  if (!file) return false;
  return fileExists(path.join(dir, file.filename));
}

async function downloadPrimaryFiles(
  versions: ModrinthVersion[],
  destDir: string,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const files = versions
    .map((v) => primaryFile(v))
    .filter((f): f is NonNullable<typeof f> => f !== null);

  let done = 0;
  await mapLimit(files, DOWNLOAD_CONCURRENCY, async (f) => {
    await downloadVerified({
      url: f.url,
      dest: path.join(destDir, f.filename),
      ...(f.hashes.sha1 ? { sha1: f.hashes.sha1 } : {}),
    });
    done++;
    onProgress?.(done, files.length);
  });
  return files.map((f) => f.filename);
}

// download a Fabric mod (plus its required deps, e.g. Fabric API) into mods/.
export async function installMod(
  paths: GamePaths,
  mcVersion: string,
  slug: string,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const version = await getCompatibleVersion(slug, mcVersion, FABRIC_LOADER);
  if (!version) {
    throw new Error(`"${slug}" has no Fabric build for Minecraft ${mcVersion}`);
  }
  const deps = await resolveRequiredDeps(version, mcVersion, FABRIC_LOADER);
  return downloadPrimaryFiles([version, ...deps], paths.modsDir, onProgress);
}

// shaders need the Iris loader + Sodium renderer as mods, plus the shaderpack .zip
// dropped (unextracted) into shaderpacks/ — Iris reads the zip directly.
export async function installShader(
  paths: GamePaths,
  mcVersion: string,
  slug: string,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  await installMod(paths, mcVersion, "sodium");
  await installMod(paths, mcVersion, "iris");

  const version = await getCompatibleVersion(slug, mcVersion, SHADER_LOADER);
  if (!version) {
    throw new Error(`"${slug}" has no build for Minecraft ${mcVersion}`);
  }
  return downloadPrimaryFiles([version], paths.shaderpacksDir, onProgress);
}
