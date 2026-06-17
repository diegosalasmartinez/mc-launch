import { getJson } from "../net/http.js";
import type { ReleaseNotes } from "../shared/ipc.js";

// mojang's launcher content feed. a list indexes entries; each body lives at its own contentPath.
const BASE = "https://launchercontent.mojang.com";
const LIST_URL = `${BASE}/v2/javaPatchNotes.json`;

interface PatchImage {
  url: string;
  title: string;
}

interface PatchListEntry {
  version: string;
  title: string;
  type: string;
  image?: PatchImage;
  contentPath: string;
  date: string;
  shortText: string;
}

interface PatchList {
  entries: PatchListEntry[];
}

interface PatchContent {
  version: string;
  title: string;
  body: string;
  image?: PatchImage;
  date: string;
}

// list rarely changes within a session, so fetch once and reuse
let listPromise: Promise<PatchList> | undefined;

function fetchList(): Promise<PatchList> {
  if (!listPromise) listPromise = getJson<PatchList>(LIST_URL);
  return listPromise;
}

function absolutize(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return `${BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

// rewrite root-relative src/href in the article html to absolute urls
function absolutizeHtml(html: string): string {
  return html.replace(/(src|href)="\/(?!\/)/g, `$1="${BASE}/`);
}

// null when mojang publishes no notes for the version, or the feed is unreachable
export async function getReleaseNotes(
  version: string,
): Promise<ReleaseNotes | null> {
  let entry: PatchListEntry | undefined;
  try {
    const list = await fetchList();
    entry = list.entries.find((e) => e.version === version);
  } catch {
    listPromise = undefined; // clear so the next call can retry
    return null;
  }
  if (!entry) return null;

  const content = await getJson<PatchContent>(
    `${BASE}/v2/${entry.contentPath}`,
  );

  const image = content.image ?? entry.image;
  return {
    version,
    title: content.title || entry.title,
    imageUrl: image ? absolutize(image.url) : null,
    bodyHtml: absolutizeHtml(content.body ?? ""),
    date: content.date || entry.date,
  };
}
