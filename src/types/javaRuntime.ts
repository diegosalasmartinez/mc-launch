// two documents: all.json (platform -> component -> runtimes, each pointing at a
// file manifest) and the per-runtime file manifest (every file/dir with its hash).

export interface RuntimeManifestRef {
  sha1: string;
  size: number;
  url: string;
}

export interface RuntimeVersion {
  name: string;
  released: string;
}

export interface RuntimeEntry {
  availability: { group: number; progress: number };
  manifest: RuntimeManifestRef;
  version: RuntimeVersion;
}

// platform key (e.g. "windows-x64") -> component (e.g. "java-runtime-delta") -> runtimes
export type AllRuntimes = Record<string, Record<string, RuntimeEntry[]>>;

export interface RuntimeDownload {
  sha1: string;
  size: number;
  url: string;
}

export interface RuntimeFileEntry {
  type: "file" | "directory" | "link";
  /** files only: marks binaries needing the executable bit on posix */
  executable?: boolean;
  /** links only: the symlink target */
  target?: string;
  // we use raw, not lzma (no extra decompression step)
  downloads?: {
    raw: RuntimeDownload;
    lzma?: RuntimeDownload;
  };
}

export interface RuntimeManifest {
  /** relative path (e.g. "bin/java.exe") -> entry */
  files: Record<string, RuntimeFileEntry>;
}
