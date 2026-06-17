import type { GamePaths } from "../config/paths.js";
import { getHostPlatform } from "../config/platform.js";
import type { ResolvedArtifact } from "../core/libraries.js";

export function buildClasspath(
  paths: GamePaths,
  version: string,
  resolved: ResolvedArtifact[],
): string {
  const entries = resolved
    .filter((r) => !r.isNative)
    .map((r) => r.dest);
  entries.push(paths.versionJar(version));
  return entries.join(getHostPlatform().classpathSeparator);
}
