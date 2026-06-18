export interface VersionSummary {
  id: string;
  type: string;
  releaseTime: string;
}

export interface PlayOptions {
  version: string;
  username: string;
  /** launch with the Fabric mod loader */
  fabric?: boolean;
}

export interface Settings {
  username?: string;
  version?: string;
  fabric?: boolean;
  /** set once the first-run welcome is dismissed */
  seenWelcome?: boolean;
}

export interface PlayResult {
  exitCode: number;
}

export type ContentType = "mod" | "shader";

/** a curated mod/shader, enriched with live metadata from Modrinth */
export interface RecommendedItem {
  slug: string;
  type: ContentType;
  /** editorial one-liner on why it's recommended */
  blurb: string;
  title: string;
  description: string;
  iconUrl: string | null;
  pageUrl: string;
  license: string | null;
  /** a build exists for the requested Minecraft version */
  compatible: boolean;
  /** its files are already present on disk */
  installed: boolean;
}

export interface InstallResult {
  /** filenames written or skipped, for a friendly summary */
  files: string[];
}

export interface ReleaseNotes {
  version: string;
  title: string;
  imageUrl: string | null;
  /** article body html, urls already absolutized */
  bodyHtml: string;
  date: string;
}

export type ProgressEvent =
  | { kind: "step"; message: string }
  | { kind: "assets"; done: number; total: number }
  | { kind: "java"; done: number; total: number }
  | { kind: "launched"; message: string }
  | { kind: "log"; line: string }
  | { kind: "exit"; code: number };

export const IPC = {
  listVersions: "launcher:listVersions",
  getReleaseNotes: "launcher:getReleaseNotes",
  getSettings: "launcher:getSettings",
  saveSettings: "launcher:saveSettings",
  openModsFolder: "launcher:openModsFolder",
  listRecommendedMods: "launcher:listRecommendedMods",
  listRecommendedShaders: "launcher:listRecommendedShaders",
  installContent: "launcher:installContent",
  play: "launcher:play",
  progress: "launcher:progress",
} as const;

export interface LauncherApi {
  listVersions(): Promise<VersionSummary[]>;
  getReleaseNotes(version: string): Promise<ReleaseNotes | null>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
  openModsFolder(): Promise<void>;
  listRecommendedMods(version: string): Promise<RecommendedItem[]>;
  listRecommendedShaders(version: string): Promise<RecommendedItem[]>;
  installContent(
    type: ContentType,
    slug: string,
    version: string,
  ): Promise<InstallResult>;
  play(opts: PlayOptions): Promise<PlayResult>;
  /** returns an unsubscribe function */
  onProgress(cb: (event: ProgressEvent) => void): () => void;
}
