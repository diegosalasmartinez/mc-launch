import path from "node:path";
import { access, readdir, rm } from "node:fs/promises";
import type { GamePaths } from "../config/paths.js";
import { downloadVerified, sha512OfFile } from "../net/download.js";
import { mapLimit } from "../net/pool.js";
import {
  getCompatibleVersion,
  latestVersionsByHash,
  primaryFile,
  resolveRequiredDeps,
} from "./modrinth.js";
import type { ModrinthVersion } from "../types/modrinth.js";

const DOWNLOAD_CONCURRENCY = 8;

// Fabric mods declare the "fabric" loader; shaderpacks declare the "iris" shader
// loader; resource packs declare the "minecraft" loader.
export const FABRIC_LOADER = "fabric";
export const SHADER_LOADER = "iris";
export const RESOURCEPACK_LOADER = "minecraft";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// every jar/zip currently sitting in `dir` (sorted). missing dir -> empty list.
export async function listInstalledFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter(
        (e) =>
          e.isFile() &&
          (e.name.endsWith(".jar") || e.name.endsWith(".zip")),
      )
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

// delete a single file from `dir`. basename-only, so it can't escape the folder.
export async function removeInstalledFile(
  dir: string,
  fileName: string,
): Promise<void> {
  await rm(path.join(dir, path.basename(fileName)), { force: true });
}

export interface ModUpdate {
  /** the installed file that's out of date */
  oldFileName: string;
  /** the newer file to download */
  newFileName: string;
  url: string;
  sha1?: string;
}

// hash every installed file, ask Modrinth for the latest build matching this
// loader + game version, and report the ones whose primary file differs.
export async function detectUpdates(
  dir: string,
  loader: string,
  gameVersion: string,
): Promise<ModUpdate[]> {
  const files = await listInstalledFiles(dir);
  const hashed = await mapLimit(files, DOWNLOAD_CONCURRENCY, async (file) => ({
    file,
    hash: await sha512OfFile(path.join(dir, file)),
  }));
  const valid = hashed.filter(
    (h): h is { file: string; hash: string } => h.hash !== null,
  );
  if (valid.length === 0) return [];

  const latest = await latestVersionsByHash(
    valid.map((v) => v.hash),
    loader,
    gameVersion,
  );

  const updates: ModUpdate[] = [];
  for (const { file, hash } of valid) {
    const version = latest[hash];
    if (!version) continue; // unknown file, or no build for this version
    const primary = primaryFile(version);
    if (!primary?.hashes.sha512) continue;
    if (primary.hashes.sha512 !== hash) {
      updates.push({
        oldFileName: file,
        newFileName: primary.filename,
        url: primary.url,
        ...(primary.hashes.sha1 ? { sha1: primary.hashes.sha1 } : {}),
      });
    }
  }
  return updates;
}

// download the newer file, then drop the old one (unless same name -> overwritten)
export async function applyUpdate(
  dir: string,
  update: ModUpdate,
): Promise<void> {
  await downloadVerified({
    url: update.url,
    dest: path.join(dir, update.newFileName),
    ...(update.sha1 ? { sha1: update.sha1 } : {}),
  });
  if (update.oldFileName !== update.newFileName) {
    await removeInstalledFile(dir, update.oldFileName);
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
  return downloadPrimaryFiles(
    [version, ...deps],
    paths.modsDir(mcVersion),
    onProgress,
  );
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

// resource packs are a single .zip dropped into resourcepacks/ — no deps, no mods.
export async function installResourcepack(
  paths: GamePaths,
  mcVersion: string,
  slug: string,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const version = await getCompatibleVersion(
    slug,
    mcVersion,
    RESOURCEPACK_LOADER,
  );
  if (!version) {
    throw new Error(
      `"${slug}" has no resource pack build for Minecraft ${mcVersion}`,
    );
  }
  return downloadPrimaryFiles([version], paths.resourcepacksDir, onProgress);
}
