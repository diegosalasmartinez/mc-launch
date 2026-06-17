import path from "node:path";
import { spawn } from "node:child_process";
import { isWindows } from "../config/platform.js";

// fallback when no managed runtime exists. prefer $JAVA_HOME/bin/java, else trust PATH.
export function findSystemJava(): string {
  const exe = isWindows() ? "java.exe" : "java";
  const javaHome = process.env["JAVA_HOME"];
  if (javaHome) return path.join(javaHome, "bin", exe);
  return exe; // resolved via PATH by child_process
}

export function validateJava(javaBin: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(javaBin, ["-version"]);
    let output = "";
    // java -version writes to stderr
    child.stderr.on("data", (d: Buffer) => (output += d.toString()));
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code === 0) {
        resolve(output.split("\n")[0]?.trim() ?? "");
      } else {
        resolve(null);
      }
    });
  });
}
