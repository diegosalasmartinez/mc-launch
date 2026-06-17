import { getJson } from "../net/http.js";
import type { VersionManifest, ManifestVersionEntry } from "../types/manifest.js";

const MANIFEST_URL =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

export function fetchManifest(): Promise<VersionManifest> {
  return getJson<VersionManifest>(MANIFEST_URL);
}

export function resolveVersion(
  manifest: VersionManifest,
  versionId: string,
): ManifestVersionEntry {
  let id = versionId;
  if (versionId === "latest" || versionId === "release") {
    id = manifest.latest.release;
  } else if (versionId === "snapshot") {
    id = manifest.latest.snapshot;
  }

  const entry = manifest.versions.find((v) => v.id === id);
  if (!entry) {
    throw new Error(
      `Version "${versionId}" not found in manifest (resolved to "${id}").`,
    );
  }
  return entry;
}
