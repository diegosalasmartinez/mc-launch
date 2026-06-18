import type { GamePaths } from "../config/paths.js";
import { getJson } from "../net/http.js";
import { downloadVerified } from "../net/download.js";
import { mapLimit } from "../net/pool.js";
import type { ResolvedArtifact } from "./libraries.js";

const FABRIC_META = "https://meta.fabricmc.net/v2";
const FABRIC_MAVEN = "https://maven.fabricmc.net/";
const DOWNLOAD_CONCURRENCY = 8;

interface LoaderEntry {
  loader: { version: string; stable: boolean };
}

interface FabricLibrary {
  name: string;
  url?: string;
  sha1?: string;
  size?: number;
}

interface FabricProfile {
  inheritsFrom: string;
  mainClass: string;
  arguments?: { jvm?: string[]; game?: string[] };
  libraries: FabricLibrary[];
}

export interface FabricResolved {
  loaderVersion: string;
  mainClass: string;
  jvmArgs: string[];
  gameArgs: string[];
  libs: ResolvedArtifact[];
}

export async function latestFabricLoader(mcVersion: string): Promise<string> {
  const loaders = await getJson<LoaderEntry[]>(
    `${FABRIC_META}/versions/loader/${mcVersion}`,
  );
  const chosen = loaders.find((l) => l.loader.stable) ?? loaders[0];
  if (!chosen) throw new Error(`Fabric has no loader for Minecraft ${mcVersion}`);
  return chosen.loader.version;
}

// group:artifact:version[:classifier][@ext] -> group/with/slashes/.../file
function mavenPath(name: string): string {
  const [coords = "", ext = "jar"] = name.split("@");
  const [group, artifact, version, classifier] = coords.split(":");
  if (!group || !artifact || !version) {
    throw new Error(`Bad maven coordinate: ${name}`);
  }
  const file = classifier
    ? `${artifact}-${version}-${classifier}.${ext}`
    : `${artifact}-${version}.${ext}`;
  return `${group.replace(/\./g, "/")}/${artifact}/${version}/${file}`;
}

export async function prepareFabric(
  paths: GamePaths,
  mcVersion: string,
  loaderVersion?: string,
  onProgress?: (done: number, total: number) => void,
): Promise<FabricResolved> {
  const loader = loaderVersion ?? (await latestFabricLoader(mcVersion));
  const profile = await getJson<FabricProfile>(
    `${FABRIC_META}/versions/loader/${mcVersion}/${loader}/profile/json`,
  );

  const libs: ResolvedArtifact[] = profile.libraries.map((lib) => {
    const rel = mavenPath(lib.name);
    const base = (lib.url ?? FABRIC_MAVEN).replace(/\/?$/, "/");
    return {
      artifact: {
        url: base + rel,
        sha1: lib.sha1 ?? "",
        size: lib.size ?? 0,
        path: rel,
      },
      dest: paths.library(rel),
      isNative: false,
    };
  });

  let done = 0;
  await mapLimit(libs, DOWNLOAD_CONCURRENCY, async (r) => {
    await downloadVerified({
      url: r.artifact.url,
      dest: r.dest,
      ...(r.artifact.sha1 ? { sha1: r.artifact.sha1 } : {}),
    });
    done++;
    onProgress?.(done, libs.length);
  });

  return {
    loaderVersion: loader,
    mainClass: profile.mainClass,
    jvmArgs: profile.arguments?.jvm ?? [],
    gameArgs: profile.arguments?.game ?? [],
    libs,
  };
}
