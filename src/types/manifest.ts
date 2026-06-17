export type VersionType = "release" | "snapshot" | "old_beta" | "old_alpha";

export interface ManifestVersionEntry {
  id: string;
  type: VersionType;
  url: string;
  time: string;
  releaseTime: string;
  sha1: string;
  complianceLevel: number;
}

export interface VersionManifest {
  latest: {
    release: string;
    snapshot: string;
  };
  versions: ManifestVersionEntry[];
}
