import { homedir } from "node:os";
import { fetchManifest } from "../core/manifest.js";
import { getReleaseNotes } from "../core/patchNotes.js";
import { prepareVersion, type PreparePhase } from "../core/prepare.js";
import { checkDiskSpace, checkNetwork } from "../core/preflight.js";
import { OfflineAuthProvider } from "../auth/OfflineAuthProvider.js";
import { buildClasspath } from "../launch/classpath.js";
import { buildLaunchArgs } from "../launch/command.js";
import { spawnGame } from "../launch/spawn.js";
import { GamePaths } from "../config/paths.js";
import { mapLimit } from "../net/pool.js";
import {
  getCompatibleVersion,
  getProject,
  primaryFile,
} from "../core/modrinth.js";
import {
  FABRIC_LOADER,
  RESOURCEPACK_LOADER,
  SHADER_LOADER,
  applyUpdate,
  detectUpdates,
  installMod,
  installResourcepack,
  installShader,
  isInstalled,
  listInstalledFiles,
  removeInstalledFile,
  type ModUpdate,
} from "../core/mods.js";
import {
  RECOMMENDED_MODS,
  RECOMMENDED_RESOURCEPACKS,
  RECOMMENDED_SHADERS,
  type RecommendedEntry,
} from "../core/recommended.js";
import type {
  ContentType,
  ContentUpdate,
  InstallResult,
  PlayOptions,
  PlayResult,
  ProgressEvent,
  RecommendedItem,
  VersionSummary,
} from "../shared/ipc.js";

export type ProgressSink = (event: ProgressEvent) => void;

const DESCRIBE_CONCURRENCY = 6;

const PHASE_COPY: Record<PreparePhase, string> = {
  manifest: "Getting things ready…",
  version: "Getting things ready…",
  assetIndex: "Getting things ready…",
  client: "Downloading game files…",
  libraries: "Downloading game files…",
  natives: "Downloading game files…",
  assets: "Downloading game files…",
  fabric: "Setting up Fabric…",
  java: "Setting up Java…",
  done: "Almost there…",
};

export async function listVersions(): Promise<VersionSummary[]> {
  const manifest = await fetchManifest();
  return manifest.versions
    .filter((v) => v.type === "release")
    .map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }));
}

export { getReleaseNotes };

// enrich each curated entry with live Modrinth metadata + on-disk install state.
// entries that fail to load (bad slug, network hiccup) are dropped rather than failing the list.
async function describeRecommended(
  entries: RecommendedEntry[],
  type: ContentType,
  mcVersion: string,
): Promise<RecommendedItem[]> {
  const loader = loaderFor(type);
  const dir = contentDir(type, mcVersion);

  const items = await mapLimit(entries, DESCRIBE_CONCURRENCY, async (entry) => {
    try {
      const [project, version] = await Promise.all([
        getProject(entry.slug),
        getCompatibleVersion(entry.slug, mcVersion, loader),
      ]);
      const file = version ? primaryFile(version) : null;
      const item: RecommendedItem = {
        slug: entry.slug,
        type,
        blurb: entry.blurb,
        title: project.title,
        description: project.description,
        iconUrl: project.icon_url,
        pageUrl: `https://modrinth.com/${type}/${entry.slug}`,
        license: project.license?.id ?? null,
        compatible: version !== null,
        installed: version ? await isInstalled(version, dir) : false,
        fileName: file?.filename ?? null,
      };
      return item;
    } catch {
      return null;
    }
  });
  return items.filter((i): i is RecommendedItem => i !== null);
}

export function listRecommendedMods(
  version: string,
): Promise<RecommendedItem[]> {
  return describeRecommended(RECOMMENDED_MODS, "mod", version);
}

export function listRecommendedShaders(
  version: string,
): Promise<RecommendedItem[]> {
  return describeRecommended(RECOMMENDED_SHADERS, "shader", version);
}

export function listRecommendedResourcepacks(
  version: string,
): Promise<RecommendedItem[]> {
  return describeRecommended(
    RECOMMENDED_RESOURCEPACKS,
    "resourcepack",
    version,
  );
}

export async function installContent(
  type: ContentType,
  slug: string,
  version: string,
): Promise<InstallResult> {
  const paths = new GamePaths();
  const files =
    type === "shader"
      ? await installShader(paths, version, slug)
      : type === "resourcepack"
        ? await installResourcepack(paths, version, slug)
        : await installMod(paths, version, slug);
  return { files };
}

function loaderFor(type: ContentType): string {
  if (type === "shader") return SHADER_LOADER;
  if (type === "resourcepack") return RESOURCEPACK_LOADER;
  return FABRIC_LOADER;
}

function contentDir(type: ContentType, version: string): string {
  const paths = new GamePaths();
  if (type === "shader") return paths.shaderpacksDir;
  if (type === "resourcepack") return paths.resourcepacksDir;
  return paths.modsDir(version);
}

export function listInstalled(
  type: ContentType,
  version: string,
): Promise<string[]> {
  return listInstalledFiles(contentDir(type, version));
}

export function removeInstalled(
  type: ContentType,
  version: string,
  fileName: string,
): Promise<void> {
  return removeInstalledFile(contentDir(type, version), fileName);
}

function coreUpdates(type: ContentType, version: string): Promise<ModUpdate[]> {
  return detectUpdates(contentDir(type, version), loaderFor(type), version);
}

export async function findUpdates(
  type: ContentType,
  version: string,
): Promise<ContentUpdate[]> {
  const updates = await coreUpdates(type, version);
  return updates.map((u) => ({
    oldFileName: u.oldFileName,
    newFileName: u.newFileName,
  }));
}

// re-resolve the update server-side (don't trust a renderer-supplied URL)
export async function updateContent(
  type: ContentType,
  version: string,
  oldFileName: string,
): Promise<void> {
  const update = (await coreUpdates(type, version)).find(
    (u) => u.oldFileName === oldFileName,
  );
  if (!update) return;
  await applyUpdate(contentDir(type, version), update);
}

export async function play(
  opts: PlayOptions,
  emit: ProgressSink,
): Promise<PlayResult> {
  emit({ kind: "step", message: "Checking your connection and disk space…" });
  await checkNetwork();
  await checkDiskSpace(homedir());

  const prepared = await prepareVersion(
    opts.version,
    {
      onStep: (phase) => emit({ kind: "step", message: PHASE_COPY[phase] }),
      onAssetProgress: (done, total) => emit({ kind: "assets", done, total }),
      onJavaProgress: (done, total) => emit({ kind: "java", done, total }),
    },
    { fabric: opts.fabric ?? false },
  );

  const auth = await new OfflineAuthProvider(opts.username).authenticate();

  const { fabric } = prepared;
  const classpath = buildClasspath(prepared.paths, prepared.version.id, [
    ...prepared.resolved,
    ...(fabric?.libs ?? []),
  ]);
  const launchArgs = buildLaunchArgs({
    paths: prepared.paths,
    version: prepared.version,
    auth,
    classpath,
    nativesDir: prepared.paths.nativesDir(prepared.version.id),
    ...(fabric
      ? {
          fabric: {
            mainClass: fabric.mainClass,
            jvmArgs: fabric.jvmArgs,
            gameArgs: fabric.gameArgs,
            // load only this version's mods, ignoring other versions' jars
            modsFolder: prepared.paths.modsDir(prepared.version.id),
          },
        }
      : {}),
  });

  emit({ kind: "launched", message: "Starting Minecraft…" });

  const exitCode = await spawnGame({
    javaBin: prepared.javaBin,
    args: launchArgs,
    cwd: prepared.paths.root,
    onLog: (line) => emit({ kind: "log", line }),
  });

  emit({ kind: "exit", code: exitCode });
  return { exitCode };
}
