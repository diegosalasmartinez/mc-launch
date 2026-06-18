import type { GamePaths } from "../config/paths.js";
import { getHostPlatform } from "../config/platform.js";
import type { AuthResult } from "../auth/AuthProvider.js";
import type { ArgumentEntry, VersionJson } from "../types/version.js";
import { rulesAllow } from "../core/rules.js";

const LAUNCHER_NAME = "mc-launch";
const LAUNCHER_VERSION = "0.0";

export interface LaunchInputs {
  paths: GamePaths;
  version: VersionJson;
  auth: AuthResult;
  classpath: string;
  nativesDir: string;
  // mod loader (Fabric): overrides mainClass and adds its own args
  fabric?: { mainClass: string; jvmArgs: string[]; gameArgs: string[] };
}

export function buildLaunchArgs(inputs: LaunchInputs): string[] {
  const { version, fabric } = inputs;
  const placeholders = buildPlaceholders(inputs);

  let jvmArgs: string[];
  let gameArgs: string[];

  if (version.arguments) {
    jvmArgs = resolveArguments(version.arguments.jvm, placeholders);
    gameArgs = resolveArguments(version.arguments.game, placeholders);
  } else {
    // legacy (pre-1.13): fixed jvm stanza + a single templated game string
    jvmArgs = legacyJvmArgs(inputs.nativesDir, inputs.classpath);
    gameArgs = substituteAll(
      (version.minecraftArguments ?? "").split(/\s+/).filter(Boolean),
      placeholders,
    );
  }

  if (fabric) {
    jvmArgs = [...jvmArgs, ...substituteAll(fabric.jvmArgs, placeholders)];
    gameArgs = [...gameArgs, ...substituteAll(fabric.gameArgs, placeholders)];
  }

  return [...jvmArgs, fabric?.mainClass ?? version.mainClass, ...gameArgs];
}

function buildPlaceholders(inputs: LaunchInputs): Record<string, string> {
  const { paths, version, auth, classpath, nativesDir } = inputs;
  return {
    natives_directory: nativesDir,
    launcher_name: LAUNCHER_NAME,
    launcher_version: LAUNCHER_VERSION,
    classpath,
    classpath_separator: getHostPlatform().classpathSeparator,
    library_directory: paths.librariesDir,
    auth_player_name: auth.username,
    version_name: version.id,
    game_directory: paths.root,
    assets_root: paths.assetsDir,
    assets_index_name: version.assetIndex.id,
    auth_uuid: auth.uuid,
    auth_access_token: auth.accessToken,
    auth_xuid: "0",
    clientid: "0",
    user_type: auth.userType,
    version_type: version.type,
    user_properties: "{}",
    resolution_width: "854",
    resolution_height: "480",
  };
}

function resolveArguments(
  entries: ArgumentEntry[],
  placeholders: Record<string, string>,
): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    if (typeof entry === "string") {
      out.push(entry);
    } else if (rulesAllow(entry.rules)) {
      const values = Array.isArray(entry.value) ? entry.value : [entry.value];
      out.push(...values);
    }
  }
  return substituteAll(out, placeholders);
}

function substituteAll(
  args: string[],
  placeholders: Record<string, string>,
): string[] {
  return args.map((arg) =>
    arg.replace(/\$\{([^}]+)\}/g, (whole, key: string) =>
      key in placeholders ? (placeholders[key] as string) : whole,
    ),
  );
}

function legacyJvmArgs(nativesDir: string, classpath: string): string[] {
  return [
    `-Djava.library.path=${nativesDir}`,
    "-cp",
    classpath,
  ];
}
