import { spawn } from "node:child_process";

export interface SpawnOptions {
  javaBin: string;
  args: string[];
  cwd: string;
  // when set, pipe + forward child stdio line-by-line (gui logs); else inherit stdio (cli)
  onLog?: (line: string) => void;
}

export function spawnGame(options: SpawnOptions): Promise<number> {
  return new Promise((resolve, reject) => {
    const piped = typeof options.onLog === "function";
    const child = spawn(options.javaBin, options.args, {
      cwd: options.cwd,
      stdio: piped ? ["ignore", "pipe", "pipe"] : "inherit",
    });

    if (piped) {
      const forward = (buf: Buffer) => {
        for (const line of buf.toString().split(/\r?\n/)) {
          if (line.trim()) options.onLog!(line);
        }
      };
      child.stdout?.on("data", forward);
      child.stderr?.on("data", forward);
    }

    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 0));
  });
}
