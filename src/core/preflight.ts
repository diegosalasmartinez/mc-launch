import { statfs } from "node:fs/promises";

// pre-download checks so we fail early with a clear message instead of partway through a big download

const MANIFEST_URL =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const NETWORK_TIMEOUT_MS = 8000;
const REQUIRED_FREE_BYTES = 1_500_000_000; // ~1.5 GB, headroom for game + managed jre

export async function checkNetwork(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    // any http response means we reached the server; only a thrown error (dns/refused/timeout) means offline
    await fetch(MANIFEST_URL, { method: "HEAD", signal: controller.signal });
  } catch {
    throw new Error("Couldn’t reach Mojang’s servers (network check failed).");
  } finally {
    clearTimeout(timer);
  }
}

// best-effort: if statfs is unavailable we skip rather than block the launch
export async function checkDiskSpace(probePath: string): Promise<void> {
  let freeBytes: number;
  try {
    const stat = await statfs(probePath);
    freeBytes = stat.bsize * stat.bavail;
  } catch {
    return; // statfs unsupported / path missing
  }
  if (freeBytes < REQUIRED_FREE_BYTES) {
    const freeMb = Math.round(freeBytes / 1_000_000);
    throw new Error(
      `Not enough disk space: about ${freeMb} MB free, but ~1.5 GB is needed.`,
    );
  }
}
