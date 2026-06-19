import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Settings } from "../shared/ipc.js";

// best-effort: a missing/corrupt file just yields defaults.
function settingsFile(): string {
  return join(app.getPath("userData"), "mc-launch-settings.json");
}

export async function loadSettings(): Promise<Settings> {
  try {
    return JSON.parse(await readFile(settingsFile(), "utf8")) as Settings;
  } catch {
    return {};
  }
}

// merge over what's already saved, so a partial update (e.g. just toggling fabric)
// doesn't wipe unrelated fields like seenWelcome.
export async function saveSettings(settings: Settings): Promise<void> {
  const file = settingsFile();
  const current = await loadSettings();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify({ ...current, ...settings }, null, 2),
  );
}
