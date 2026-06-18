// Hand-picked starter catalog. Slugs are Modrinth project slugs; metadata (title,
// icon, license, compatibility) is resolved live from the API. This can later be
// sourced from a remote JSON without changing the consumers.

export interface RecommendedEntry {
  slug: string;
  /** editorial one-liner on why it's recommended */
  blurb: string;
}

export const RECOMMENDED_MODS: RecommendedEntry[] = [
  { slug: "fabric-api", blurb: "Core library most Fabric mods depend on." },
  { slug: "sodium", blurb: "Big FPS and frame-pacing boost." },
  { slug: "iris", blurb: "Shader support, built on top of Sodium." },
  { slug: "lithium", blurb: "Game-logic optimizations, no visual change." },
  { slug: "modmenu", blurb: "In-game screen to browse and configure mods." },
  { slug: "cloth-config", blurb: "Config screens many mods rely on." },
  { slug: "xaeros-minimap", blurb: "Minimap with waypoints and mob radar." },
];

export const RECOMMENDED_SHADERS: RecommendedEntry[] = [
  { slug: "complementary-reimagined", blurb: "Crisp, balanced, great default." },
  { slug: "complementary-shaders", blurb: "Popular, well-rounded shaderpack." },
  { slug: "bsl-shaders", blurb: "Bright and colorful, beginner-friendly." },
  { slug: "sildurs-vibrant-shaders", blurb: "Highly configurable classic look." },
];
