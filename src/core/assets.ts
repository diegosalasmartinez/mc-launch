import type { GamePaths } from "../config/paths.js";
import type { AssetIndex } from "../types/assetIndex.js";
import { downloadVerified } from "../net/download.js";
import { mapLimit } from "../net/pool.js";

const ASSET_BASE = "https://resources.download.minecraft.net";
const DOWNLOAD_CONCURRENCY = 8;

// each object is stored at objects/<hash[0:2]>/<hash> and verified by its hash
export async function downloadAssets(
  paths: GamePaths,
  index: AssetIndex,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const objects = Object.values(index.objects);
  const total = objects.length;
  let done = 0;

  await mapLimit(objects, DOWNLOAD_CONCURRENCY, async (obj) => {
    const prefix = obj.hash.slice(0, 2);
    await downloadVerified({
      url: `${ASSET_BASE}/${prefix}/${obj.hash}`,
      sha1: obj.hash,
      dest: paths.assetObject(obj.hash),
    });
    done++;
    onProgress?.(done, total);
  });
}
