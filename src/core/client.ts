import type { GamePaths } from "../config/paths.js";
import type { VersionJson } from "../types/version.js";
import { downloadVerified } from "../net/download.js";

export async function downloadClientJar(
  paths: GamePaths,
  version: VersionJson,
): Promise<void> {
  const { client } = version.downloads;
  await downloadVerified({
    url: client.url,
    sha1: client.sha1,
    dest: paths.versionJar(version.id),
  });
}
