import { getJson } from "../net/http.js";
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

// the version list comes back newest-first; the first match is the one we want
export async function getCompatibleVersion(
  idOrSlug: string,
  gameVersion: string,
  loader: string,
): Promise<ModrinthVersion | null> {
  const url =
    `${API}/project/${encodeURIComponent(idOrSlug)}/version` +
    `?loaders=${arrayParam([loader])}&game_versions=${arrayParam([gameVersion])}`;
  const versions = await getJson<ModrinthVersion[]>(url);
  return versions[0] ?? null;
}

export function primaryFile(version: ModrinthVersion): ModrinthFile | null {
  return version.files.find((f) => f.primary) ?? version.files[0] ?? null;
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
