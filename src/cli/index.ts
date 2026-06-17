import { prepareVersion } from "../core/prepare.js";
import { OfflineAuthProvider } from "../auth/OfflineAuthProvider.js";
import { buildClasspath } from "../launch/classpath.js";
import { buildLaunchArgs } from "../launch/command.js";
import { spawnGame } from "../launch/spawn.js";

interface CliArgs {
  version: string;
  username: string;
  prepareOnly: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    version: "latest",
    username: "Player",
    prepareOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--version":
      case "-v":
        args.version = argv[++i] ?? args.version;
        break;
      case "--username":
      case "-u":
        args.username = argv[++i] ?? args.username;
        break;
      case "--prepare-only":
        args.prepareOnly = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        if (arg?.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`mc-launch — vanilla Minecraft launcher (Phase 0)

Usage:
  npm run launch -- [options]

Options:
  -v, --version <id>     Version to launch (default: latest release).
                         Accepts "latest", "snapshot", or an explicit id like 1.21.1.
  -u, --username <name>  Offline username (default: Player).
      --prepare-only     Download + verify everything, but don't launch.
  -h, --help             Show this help.
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  let lastAssetLine = 0;
  let lastJavaLine = 0;
  const prepared = await prepareVersion(args.version, {
    onStep: (_phase, m) => console.log(`• ${m}`),
    onAssetProgress: (done, total) => {
      // throttle so we don't flood the terminal
      if (done === total || done - lastAssetLine >= 50) {
        lastAssetLine = done;
        process.stdout.write(`\r  assets ${done} / ${total}`);
        if (done === total) process.stdout.write("\n");
      }
    },
    onJavaProgress: (done, total) => {
      if (done === total || done - lastJavaLine >= 25) {
        lastJavaLine = done;
        process.stdout.write(`\r  java files ${done} / ${total}`);
        if (done === total) process.stdout.write("\n");
      }
    },
  });

  if (args.prepareOnly) {
    console.log("\n✓ Prepared. Re-run without --prepare-only to launch.");
    return;
  }

  const { paths, version, resolved, javaBin, managedJava } = prepared;

  const auth = await new OfflineAuthProvider(args.username).authenticate();
  console.log(`• Offline auth: ${auth.username} (${auth.uuid})`);

  const classpath = buildClasspath(paths, version.id, resolved);
  const launchArgs = buildLaunchArgs({
    paths,
    version,
    auth,
    classpath,
    nativesDir: paths.nativesDir(version.id),
  });

  console.log(
    `• Launching with ${managedJava ? "managed" : "system"} Java: ${javaBin}`,
  );
  console.log("──────────────────────────────────────────");

  const code = await spawnGame({
    javaBin,
    args: launchArgs,
    cwd: paths.root,
  });
  console.log(`\nGame exited with code ${code}.`);
  process.exit(code);
}

main().catch((err) => {
  console.error("\n✗ Launch failed:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
