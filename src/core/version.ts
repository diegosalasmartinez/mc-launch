import { readFile } from "node:fs/promises";
import { downloadVerified } from "../net/download.js";
import type { GamePaths } from "../config/paths.js";
import type { ManifestVersionEntry } from "../types/manifest.js";
import type { VersionJson } from "../types/version.js";
import type { AssetIndex } from "../types/assetIndex.js";

export async function fetchVersionJson(
  paths: GamePaths,
  entry: ManifestVersionEntry,
): Promise<VersionJson> {
  const dest = paths.versionJson(entry.id);
  await downloadVerified({ url: entry.url, sha1: entry.sha1, dest });
  const raw = await readFile(dest, "utf8");
  return JSON.parse(raw) as VersionJson;
}

export async function fetchAssetIndex(
  paths: GamePaths,
  version: VersionJson,
): Promise<AssetIndex> {
  const ref = version.assetIndex;
  const dest = paths.assetIndexJson(ref.id);
  await downloadVerified({ url: ref.url, sha1: ref.sha1, dest });
  const raw = await readFile(dest, "utf8");
  return JSON.parse(raw) as AssetIndex;
}
