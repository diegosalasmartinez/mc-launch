import catalog from "./recommended.json";

// The curated catalog lives in recommended.json so it can be edited without touching
// code. Slugs are Modrinth project slugs; everything else (title, icon, license,
// compatibility) is resolved live from the API. Each entry has a slug and a short
// editorial blurb on why it's recommended.

export interface RecommendedEntry {
  slug: string;
  blurb: string;
}

export const RECOMMENDED_MODS: RecommendedEntry[] = catalog.mods;
export const RECOMMENDED_SHADERS: RecommendedEntry[] = catalog.shaders;
