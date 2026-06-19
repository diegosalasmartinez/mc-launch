import { getJson, postJson } from "../net/http.js";
import { mapLimit } from "../net/pool.js";
import type {
  ModrinthFile,
  ModrinthProject,
  ModrinthVersion,
} from "../types/modrinth.js";

const API = "https://api.modrinth.com/v2";
const DEP_CONCURRENCY = 4;

// Modrinth wants array filters as a json-encoded query string, e.g. loaders=["fabric"]
function arrayParam(values: string[]): string {
  return encodeURIComponent(JSON.stringify(values));
}

export async function getProject(slug: string): Promise<ModrinthProject> {
  return getJson<ModrinthProject>(`${API}/project/${encodeURIComponent(slug)}`);
}

// the version list comes back newest-first. Prefer the newest stable release over
// betas/alphas (a "latest" beta of one mod often breaks its pairing with another,
// e.g. a Sodium beta that Iris doesn't support yet). Fall back to newest if no release.
export async function getCompatibleVersion(
  idOrSlug: string,
  gameVersion: string,
  loader: string,
): Promise<ModrinthVersion | null> {
  const url =
    `${API}/project/${encodeURIComponent(idOrSlug)}/version` +
    `?loaders=${arrayParam([loader])}&game_versions=${arrayParam([gameVersion])}`;
  const versions = await getJson<ModrinthVersion[]>(url);
  return versions.find((v) => v.version_type === "release") ?? versions[0] ?? null;
}

export function primaryFile(version: ModrinthVersion): ModrinthFile | null {
  return version.files.find((f) => f.primary) ?? version.files[0] ?? null;
}

// given file hashes (sha512), return the version each file belongs to, keyed by
// the input hash. Used to figure out which project an installed file is.
export async function versionsByHash(
  hashes: string[],
): Promise<Record<string, ModrinthVersion>> {
  if (hashes.length === 0) return {};
  return postJson<Record<string, ModrinthVersion>>(`${API}/version_files`, {
    hashes,
    algorithm: "sha512",
  });
}

// given file hashes (sha512), return the latest version matching loader + game
// version for each, keyed by the input hash. Hashes with no match are omitted.
export async function latestVersionsByHash(
  hashes: string[],
  loader: string,
  gameVersion: string,
): Promise<Record<string, ModrinthVersion>> {
  if (hashes.length === 0) return {};
  return postJson<Record<string, ModrinthVersion>>(
    `${API}/version_files/update`,
    {
      hashes,
      algorithm: "sha512",
      loaders: [loader],
      game_versions: [gameVersion],
    },
  );
}

// resolve only required deps (e.g. Fabric API). skip embedded (already bundled) and
// optional/incompatible. a pinned version_id is fetched directly, otherwise we pick the
// newest build matching the same game version + loader.
export async function resolveRequiredDeps(
  version: ModrinthVersion,
  gameVersion: string,
  loader: string,
): Promise<ModrinthVersion[]> {
  const required = version.dependencies.filter(
    (d) => d.dependency_type === "required" && d.project_id,
  );
  const resolved = await mapLimit(required, DEP_CONCURRENCY, async (dep) => {
    if (dep.version_id) {
      return getJson<ModrinthVersion>(`${API}/version/${dep.version_id}`);
    }
    return getCompatibleVersion(dep.project_id as string, gameVersion, loader);
  });
  return resolved.filter((v): v is ModrinthVersion => v !== null);
}
