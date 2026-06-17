import path from "node:path";
import type { GamePaths } from "../config/paths.js";
import { getHostPlatform } from "../config/platform.js";
import type { Artifact, Library } from "../types/version.js";
import { rulesAllow } from "./rules.js";
import { downloadVerified } from "../net/download.js";
import { mapLimit } from "../net/pool.js";

const DOWNLOAD_CONCURRENCY = 8;

export interface ResolvedArtifact {
  artifact: Artifact;
  dest: string;
  isNative: boolean;
  /** for natives: entry-name prefixes to skip when extracting */
  extractExclude?: string[];
}

// resolves the native classifier for the host, applying mojang's ${arch} substitution
// (e.g. "natives-windows-${arch}"). undefined if no native for this os.
function nativeClassifierFor(lib: Library): string | undefined {
  if (!lib.natives) return undefined;
  const { os, arch } = getHostPlatform();
  const template = lib.natives[os];
  if (!template) return undefined;
  return template.replace("${arch}", arch === "x64" ? "64" : "32");
}

export function resolveLibraries(
  paths: GamePaths,
  libraries: Library[],
): ResolvedArtifact[] {
  const resolved: ResolvedArtifact[] = [];

  for (const lib of libraries) {
    if (!rulesAllow(lib.rules)) continue;

    const { artifact, classifiers } = lib.downloads;

    if (artifact?.path) {
      resolved.push({
        artifact,
        dest: paths.library(artifact.path),
        isNative: false,
      });
    }

    const classifier = nativeClassifierFor(lib);
    if (classifier && classifiers) {
      const nativeArtifact = classifiers[classifier];
      if (nativeArtifact) {
        // native path may be absent; fall back to a name under libraries/
        const rel =
          nativeArtifact.path ??
          path.join("natives-cache", `${lib.name}-${classifier}.jar`);
        resolved.push({
          artifact: nativeArtifact,
          dest: paths.library(rel),
          isNative: true,
          ...(lib.extract?.exclude
            ? { extractExclude: lib.extract.exclude }
            : {}),
        });
      }
    }
  }

  return resolved;
}

export async function downloadLibraries(
  resolved: ResolvedArtifact[],
): Promise<void> {
  await mapLimit(resolved, DOWNLOAD_CONCURRENCY, async (r) => {
    await downloadVerified({
      url: r.artifact.url,
      sha1: r.artifact.sha1,
      dest: r.dest,
    });
  });
}
