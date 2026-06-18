import { homedir } from "node:os";
import { fetchManifest } from "../core/manifest.js";
import { getReleaseNotes } from "../core/patchNotes.js";
import { prepareVersion, type PreparePhase } from "../core/prepare.js";
import { checkDiskSpace, checkNetwork } from "../core/preflight.js";
import { OfflineAuthProvider } from "../auth/OfflineAuthProvider.js";
import { buildClasspath } from "../launch/classpath.js";
import { buildLaunchArgs } from "../launch/command.js";
import { spawnGame } from "../launch/spawn.js";
import type {
  PlayOptions,
  PlayResult,
  ProgressEvent,
  VersionSummary,
} from "../shared/ipc.js";

export type ProgressSink = (event: ProgressEvent) => void;

const PHASE_COPY: Record<PreparePhase, string> = {
  manifest: "Getting things ready…",
  version: "Getting things ready…",
  assetIndex: "Getting things ready…",
  client: "Downloading game files…",
  libraries: "Downloading game files…",
  natives: "Downloading game files…",
  assets: "Downloading game files…",
  fabric: "Setting up Fabric…",
  java: "Setting up Java…",
  done: "Almost there…",
};

export async function listVersions(): Promise<VersionSummary[]> {
  const manifest = await fetchManifest();
  return manifest.versions
    .filter((v) => v.type === "release")
    .map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }));
}

export { getReleaseNotes };

export async function play(
  opts: PlayOptions,
  emit: ProgressSink,
): Promise<PlayResult> {
  emit({ kind: "step", message: "Checking your connection and disk space…" });
  await checkNetwork();
  await checkDiskSpace(homedir());

  const prepared = await prepareVersion(
    opts.version,
    {
      onStep: (phase) => emit({ kind: "step", message: PHASE_COPY[phase] }),
      onAssetProgress: (done, total) => emit({ kind: "assets", done, total }),
      onJavaProgress: (done, total) => emit({ kind: "java", done, total }),
    },
    { fabric: opts.fabric ?? false },
  );

  const auth = await new OfflineAuthProvider(opts.username).authenticate();

  const { fabric } = prepared;
  const classpath = buildClasspath(prepared.paths, prepared.version.id, [
    ...prepared.resolved,
    ...(fabric?.libs ?? []),
  ]);
  const launchArgs = buildLaunchArgs({
    paths: prepared.paths,
    version: prepared.version,
    auth,
    classpath,
    nativesDir: prepared.paths.nativesDir(prepared.version.id),
    ...(fabric
      ? {
          fabric: {
            mainClass: fabric.mainClass,
            jvmArgs: fabric.jvmArgs,
            gameArgs: fabric.gameArgs,
          },
        }
      : {}),
  });

  emit({ kind: "launched", message: "Starting Minecraft…" });

  const exitCode = await spawnGame({
    javaBin: prepared.javaBin,
    args: launchArgs,
    cwd: prepared.paths.root,
    onLog: (line) => emit({ kind: "log", line }),
  });

  emit({ kind: "exit", code: exitCode });
  return { exitCode };
}
