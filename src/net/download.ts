import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getBuffer } from "./http.js";

export async function sha1OfFile(filePath: string): Promise<string | null> {
  try {
    const hash = createHash("sha1");
    const stream = createReadStream(filePath);
    for await (const chunk of stream) hash.update(chunk as Buffer);
    return hash.digest("hex");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

function sha1OfBuffer(buf: Buffer): string {
  return createHash("sha1").update(buf).digest("hex");
}

export interface DownloadSpec {
  url: string;
  /** expected sha1; verification enforced when present */
  sha1?: string;
  dest: string;
}

export type DownloadOutcome = "skipped" | "downloaded";

// skip if the existing file already matches sha1, else fetch, verify bytes, then write.
// mismatch throws. without an expected sha1, skip on existence alone.
export async function downloadVerified(
  spec: DownloadSpec,
): Promise<DownloadOutcome> {
  const { url, sha1, dest } = spec;

  if (sha1) {
    const existing = await sha1OfFile(dest);
    if (existing === sha1) return "skipped";
  } else {
    if ((await sha1OfFile(dest)) !== null) return "skipped";
  }

  const buf = await getBuffer(url);

  if (sha1) {
    const actual = sha1OfBuffer(buf);
    if (actual !== sha1) {
      throw new Error(
        `SHA1 mismatch for ${url}\n  expected ${sha1}\n  got      ${actual}`,
      );
    }
  }

  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return "downloaded";
}
