import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import yauzl from "yauzl";
import type { GamePaths } from "../config/paths.js";
import type { ResolvedArtifact } from "./libraries.js";

// unpack the .dll/.so/.dylib files from native jars into versions/<version>/natives/.
export async function extractNatives(
  paths: GamePaths,
  version: string,
  resolved: ResolvedArtifact[],
): Promise<void> {
  const nativesDir = paths.nativesDir(version);
  // start clean so stale natives from a previous run never linger
  await rm(nativesDir, { recursive: true, force: true });
  await mkdir(nativesDir, { recursive: true });

  for (const r of resolved) {
    if (!r.isNative) continue;
    await extractJar(r.dest, nativesDir, r.extractExclude ?? []);
  }
}

function isExcluded(entryName: string, excludes: string[]): boolean {
  if (entryName.startsWith("META-INF/")) return true;
  return excludes.some((ex) => entryName.startsWith(ex));
}

function extractJar(
  jarPath: string,
  destDir: string,
  excludes: string[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(jarPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("failed to open jar"));

      zip.on("error", reject);
      zip.on("end", resolve);
      zip.readEntry();

      zip.on("entry", (entry) => {
        const name = entry.fileName;
        if (name.endsWith("/") || isExcluded(name, excludes)) {
          zip.readEntry();
          return;
        }

        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) {
            return reject(streamErr ?? new Error("failed to read entry"));
          }
          const chunks: Buffer[] = [];
          stream.on("data", (c: Buffer) => chunks.push(c));
          stream.on("error", reject);
          stream.on("end", () => {
            // flatten into the natives dir using the entry's basename
            const outPath = path.join(destDir, path.basename(name));
            writeFile(outPath, Buffer.concat(chunks))
              .then(() => zip.readEntry())
              .catch(reject);
          });
        });
      });
    });
  });
}
