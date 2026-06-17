export interface Artifact {
  /** maven-style relative path under libraries/, present for library artifacts */
  path?: string;
  sha1: string;
  size: number;
  url: string;
}

export interface Rule {
  action: "allow" | "disallow";
  os?: {
    name?: string;
    version?: string;
    arch?: string;
  };
  features?: Record<string, boolean>;
}

export interface LibraryDownloads {
  artifact?: Artifact;
  classifiers?: Record<string, Artifact>;
}

export interface Library {
  name: string;
  downloads: LibraryDownloads;
  rules?: Rule[];
  // maps an os to a classifier key in downloads.classifiers, e.g. { windows: "natives-windows" }.
  // may contain ${arch} to substitute.
  natives?: Record<string, string>;
  extract?: {
    exclude?: string[];
  };
}

export interface AssetIndexRef {
  id: string;
  sha1: string;
  size: number;
  totalSize: number;
  url: string;
}

export interface JavaVersionRef {
  component: string;
  majorVersion: number;
}

export type ArgumentEntry =
  | string
  | {
      rules: Rule[];
      value: string | string[];
    };

export interface VersionArguments {
  game: ArgumentEntry[];
  jvm: ArgumentEntry[];
}

export interface VersionJson {
  id: string;
  type: string;
  mainClass: string;
  assetIndex: AssetIndexRef;
  assets: string;
  javaVersion?: JavaVersionRef;
  libraries: Library[];
  downloads: {
    client: Artifact;
    server?: Artifact;
  };
  // modern (1.13+) split args
  arguments?: VersionArguments;
  // legacy (pre-1.13) single arg string
  minecraftArguments?: string;
}
