import { access, chmod, mkdir, readFile, symlink, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { GamePaths } from "../config/paths.js";
import { getHostPlatform, isWindows, type HostPlatform } from "../config/platform.js";
import { getJson, getBuffer } from "../net/http.js";
import { downloadVerified } from "../net/download.js";
import { mapLimit } from "../net/pool.js";
import type { VersionJson } from "../types/version.js";
import type {
  AllRuntimes,
  RuntimeManifest,
  RuntimeFileEntry,
} from "../types/javaRuntime.js";

// the all-platforms runtime index. the 2ec0cc96… segment has been stable for years
// and mojang keeps it current; if it ever moves, this is the one url to update.
const ALL_RUNTIMES_URL =
  "https://piston-meta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";

const DOWNLOAD_CONCURRENCY = 8;
const MARKER = ".mc-launch-runtime.json";

export interface JavaRuntimeResult {
  javaBin: string;
  component: string;
  version: string;
}

// host os/arch -> all.json platform key, or null if mojang ships no runtime for it
export function runtimePlatformKey(
  host: HostPlatform = getHostPlatform(),
): string | null {
  switch (host.os) {
    case "windows":
      if (host.arch === "x64") return "windows-x64";
      if (host.arch === "x86") return "windows-x86";
      if (host.arch === "arm64") return "windows-arm64";
      return null;
    case "linux":
      if (host.arch === "x64") return "linux";
      if (host.arch === "x86") return "linux-i386";
      // Mojang ships no linux-arm64 runtime here.
      return null;
    case "osx":
      if (host.arch === "arm64") return "mac-os-arm64";
      if (host.arch === "x64") return "mac-os";
      return null;
  }
}

export interface EnsureJavaHooks {
  onStep?: (message: string) => void;
  onFileProgress?: (done: number, total: number) => void;
}

// installs the managed jre for `version` if missing. returns its java binary, or
// null when mojang has no runtime for this host (caller falls back to system java).
export async function ensureJavaRuntime(
  paths: GamePaths,
  version: VersionJson,
  hooks: EnsureJavaHooks = {},
): Promise<JavaRuntimeResult | null> {
  const component = version.javaVersion?.component;
  if (!component) return null; // very old versions; fall back to system Java

  const key = runtimePlatformKey();
  if (!key) return null;

  hooks.onStep?.("Resolving Java runtime…");
  const all = await getJson<AllRuntimes>(ALL_RUNTIMES_URL);
  const entry = all[key]?.[component]?.[0];
  if (!entry) return null; // component not offered for this platform

  const targetDir = paths.runtimeDir(component, key);

  // matching marker means this exact runtime is already installed
  const installed = await readMarker(targetDir);
  if (installed?.manifestSha1 === entry.manifest.sha1) {
    const javaBin = await locateJavaBin(targetDir);
    if (javaBin) {
      hooks.onStep?.(`Java ${entry.version.name} already installed.`);
      return { javaBin, component, version: entry.version.name };
    }
  }

  hooks.onStep?.(`Downloading Java ${entry.version.name} (${component})…`);
  const manifest = await fetchRuntimeManifest(
    entry.manifest.url,
    entry.manifest.sha1,
  );

  await installRuntimeFiles(targetDir, manifest, hooks.onFileProgress);

  const javaBin = await locateJavaBin(targetDir);
  if (!javaBin) {
    throw new Error(
      `Java runtime installed but no java binary found under ${targetDir}`,
    );
  }

  await writeMarker(targetDir, {
    manifestSha1: entry.manifest.sha1,
    version: entry.version.name,
    component,
  });

  return { javaBin, component, version: entry.version.name };
}

async function fetchRuntimeManifest(
  url: string,
  sha1: string,
): Promise<RuntimeManifest> {
  const buf = await getBuffer(url);
  const actual = createHash("sha1").update(buf).digest("hex");
  if (actual !== sha1) {
    throw new Error(`Runtime manifest SHA1 mismatch for ${url}`);
  }
  return JSON.parse(buf.toString("utf8")) as RuntimeManifest;
}

async function installRuntimeFiles(
  targetDir: string,
  manifest: RuntimeManifest,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const entries = Object.entries(manifest.files);

  // create all dirs first so file writes never race on mkdir
  for (const [rel, entry] of entries) {
    if (entry.type === "directory") {
      await mkdir(path.join(targetDir, rel), { recursive: true });
    }
  }

  const fileEntries = entries.filter(([, e]) => e.type !== "directory");
  const total = fileEntries.length;
  let done = 0;

  await mapLimit(fileEntries, DOWNLOAD_CONCURRENCY, async ([rel, entry]) => {
    await installEntry(path.join(targetDir, rel), entry);
    done++;
    onProgress?.(done, total);
  });
}

async function installEntry(
  dest: string,
  entry: RuntimeFileEntry,
): Promise<void> {
  if (entry.type === "link") {
    if (entry.target && !isWindows()) {
      await mkdir(path.dirname(dest), { recursive: true });
      await rm(dest, { force: true });
      await symlink(entry.target, dest);
    }
    return;
  }

  const raw = entry.downloads?.raw;
  if (!raw) throw new Error(`Runtime file ${dest} has no raw download`);

  await downloadVerified({ url: raw.url, sha1: raw.sha1, dest });

  // jres ship unix executables that need the executable bit restored
  if (entry.executable && !isWindows()) {
    await chmod(dest, 0o755);
  }
}

async function locateJavaBin(targetDir: string): Promise<string | null> {
  const exe = isWindows() ? "java.exe" : "java";
  // Windows/Linux runtimes put the binary at bin/java; macOS nests the whole JRE
  // inside a .bundle (jre.bundle/Contents/Home/bin/java).
  const candidates = [
    path.join(targetDir, "bin", exe),
    path.join(targetDir, "jre.bundle", "Contents", "Home", "bin", exe),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try the next layout
    }
  }
  return null;
}

interface RuntimeMarker {
  manifestSha1: string;
  version: string;
  component: string;
}

async function readMarker(targetDir: string): Promise<RuntimeMarker | null> {
  try {
    const raw = await readFile(path.join(targetDir, MARKER), "utf8");
    return JSON.parse(raw) as RuntimeMarker;
  } catch {
    return null;
  }
}

async function writeMarker(
  targetDir: string,
  marker: RuntimeMarker,
): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(targetDir, MARKER), JSON.stringify(marker, null, 2));
}
