import { GamePaths } from "../config/paths.js";
import { fetchManifest, resolveVersion } from "./manifest.js";
import { fetchVersionJson, fetchAssetIndex } from "./version.js";
import { downloadClientJar } from "./client.js";
import { resolveLibraries, downloadLibraries } from "./libraries.js";
import type { ResolvedArtifact } from "./libraries.js";
import { downloadAssets } from "./assets.js";
import { extractNatives } from "./natives.js";
import { ensureJavaRuntime } from "./javaRuntime.js";
import { findSystemJava, validateJava } from "../launch/java.js";
import type { VersionJson } from "../types/version.js";

export interface PreparedVersion {
  paths: GamePaths;
  version: VersionJson;
  resolved: ResolvedArtifact[];
  javaBin: string;
  /** true when javaBin is a managed jre rather than system java */
  managedJava: boolean;
}

// frontends map these to their own copy (cli prints the technical message, gui shows friendly text)
export type PreparePhase =
  | "manifest"
  | "version"
  | "assetIndex"
  | "client"
  | "libraries"
  | "natives"
  | "assets"
  | "java"
  | "done";

export interface PrepareHooks {
  onStep?: (phase: PreparePhase, message: string) => void;
  onAssetProgress?: (done: number, total: number) => void;
  onJavaProgress?: (done: number, total: number) => void;
}

// full download pipeline minus auth/launch. idempotent: re-running skips valid files.
export async function prepareVersion(
  versionId: string,
  hooks: PrepareHooks = {},
): Promise<PreparedVersion> {
  const { onStep, onAssetProgress } = hooks;
  const paths = new GamePaths();

  onStep?.("manifest", "Fetching version manifest…");
  const manifest = await fetchManifest();
  const entry = resolveVersion(manifest, versionId);

  onStep?.("version", `Fetching version.json for ${entry.id}…`);
  const version = await fetchVersionJson(paths, entry);

  onStep?.("assetIndex", "Fetching asset index…");
  const assetIndex = await fetchAssetIndex(paths, version);

  onStep?.("client", "Downloading client jar…");
  await downloadClientJar(paths, version);

  onStep?.("libraries", "Resolving + downloading libraries…");
  const resolved = resolveLibraries(paths, version.libraries);
  await downloadLibraries(resolved);

  onStep?.("natives", "Extracting native libraries…");
  await extractNatives(paths, version.id, resolved);

  onStep?.("assets", "Downloading assets…");
  await downloadAssets(paths, assetIndex, onAssetProgress);

  const { javaBin, managedJava } = await resolveJava(paths, version, hooks);

  onStep?.("done", "Preparation complete.");
  return { paths, version, resolved, javaBin, managedJava };
}

// prefer the managed jre; fall back to validated system java only when mojang
// offers no runtime for this host (e.g. linux-arm64) or the version predates javaVersion.
async function resolveJava(
  paths: GamePaths,
  version: VersionJson,
  hooks: PrepareHooks,
): Promise<{ javaBin: string; managedJava: boolean }> {
  const managed = await ensureJavaRuntime(paths, version, {
    ...(hooks.onStep
      ? { onStep: (message: string) => hooks.onStep?.("java", message) }
      : {}),
    ...(hooks.onJavaProgress ? { onFileProgress: hooks.onJavaProgress } : {}),
  });
  if (managed) return { javaBin: managed.javaBin, managedJava: true };

  hooks.onStep?.("java", "No managed runtime for this host — using system Java…");
  const javaBin = findSystemJava();
  const versionLine = await validateJava(javaBin);
  if (!versionLine) {
    throw new Error(
      `No managed Java runtime is available for this platform and no working ` +
        `system Java was found (tried "${javaBin}"). Install a JDK matching ` +
        `Java ${version.javaVersion?.majorVersion ?? "?"}.`,
    );
  }
  hooks.onStep?.("java", `Using system Java: ${versionLine}`);
  return { javaBin, managedJava: false };
}
