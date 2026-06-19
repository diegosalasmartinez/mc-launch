// Subset of the Modrinth v2 API shapes we consume. Full schema: https://docs.modrinth.com/api/

export interface ModrinthFileHashes {
  sha1?: string;
  sha512?: string;
}

export interface ModrinthFile {
  url: string;
  filename: string;
  /** the main artifact when a version ships several files (jar vs sources) */
  primary: boolean;
  hashes: ModrinthFileHashes;
}

export type DependencyType = "required" | "optional" | "incompatible" | "embedded";

export interface ModrinthDependency {
  project_id: string | null;
  version_id: string | null;
  dependency_type: DependencyType;
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  /** "release" | "beta" | "alpha" */
  version_type: string;
  game_versions: string[];
  loaders: string[];
  files: ModrinthFile[];
  dependencies: ModrinthDependency[];
}

export interface ModrinthProject {
  slug: string;
  title: string;
  description: string;
  icon_url: string | null;
  license?: { id: string; name?: string };
}
