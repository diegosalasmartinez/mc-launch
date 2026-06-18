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
import { getCompatibleVersion, getProject } from "../core/modrinth.js";
import {
  FABRIC_LOADER,
  SHADER_LOADER,
  installMod,
  installShader,
  isInstalled,
} from "../core/mods.js";
import {
  RECOMMENDED_MODS,
  RECOMMENDED_SHADERS,
  type RecommendedEntry,
} from "../core/recommended.js";
import type {
  ContentType,
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
  const loader = type === "shader" ? SHADER_LOADER : FABRIC_LOADER;
  const dir = type === "shader"
    ? new GamePaths().shaderpacksDir
    : new GamePaths().modsDir;

  const items = await mapLimit(entries, DESCRIBE_CONCURRENCY, async (entry) => {
    try {
      const [project, version] = await Promise.all([
        getProject(entry.slug),
        getCompatibleVersion(entry.slug, mcVersion, loader),
      ]);
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

export async function installContent(
  type: ContentType,
  slug: string,
  version: string,
): Promise<InstallResult> {
  const paths = new GamePaths();
  const files =
    type === "shader"
      ? await installShader(paths, version, slug)
      : await installMod(paths, version, slug);
  return { files };
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
