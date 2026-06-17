export interface VersionSummary {
  id: string;
  type: string;
  releaseTime: string;
}

export interface PlayOptions {
  version: string;
  username: string;
}

export interface Settings {
  username?: string;
  version?: string;
  /** set once the first-run welcome is dismissed */
  seenWelcome?: boolean;
}

export interface PlayResult {
  exitCode: number;
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
  play: "launcher:play",
  progress: "launcher:progress",
} as const;

export interface LauncherApi {
  listVersions(): Promise<VersionSummary[]>;
  getReleaseNotes(version: string): Promise<ReleaseNotes | null>;
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;
  play(opts: PlayOptions): Promise<PlayResult>;
  /** returns an unsubscribe function */
  onProgress(cb: (event: ProgressEvent) => void): () => void;
}
