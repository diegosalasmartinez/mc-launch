import { useEffect, useState } from "react";
import type { ContentType, RecommendedItem } from "../../shared/ipc.js";
import { toFriendlyError } from "./errors.js";

type ListState = "loading" | "ready" | "error";
type ItemState = "idle" | "installing" | "installed" | "error";

// Session cache so switching tabs (or coming back to a version) doesn't re-hit
// Modrinth every time. Keyed by type+version; lives for the app session.
const listCache = new Map<string, RecommendedItem[]>();
const cacheKey = (type: ContentType, version: string): string =>
  `${type}:${version}`;

const BROWSE_URL: Record<ContentType, string> = {
  mod: "https://modrinth.com/mods",
  shader: "https://modrinth.com/shaders",
};

export function Catalog({
  type,
  version,
  onInstalled,
}: {
  type: ContentType;
  version: string;
  /** called after any successful install (mods load through Fabric) */
  onInstalled?: () => void;
}): JSX.Element {
  const [items, setItems] = useState<RecommendedItem[]>([]);
  const [listState, setListState] = useState<ListState>("loading");
  const [states, setStates] = useState<Record<string, ItemState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  function applyList(list: RecommendedItem[]): void {
    setItems(list);
    setStates(
      Object.fromEntries(
        list.map((it) => [it.slug, it.installed ? "installed" : "idle"]),
      ),
    );
    setListState("ready");
  }

  useEffect(() => {
    if (!version) return;

    const cached = listCache.get(cacheKey(type, version));
    if (cached) {
      applyList(cached);
      return;
    }

    let stale = false;
    setListState("loading");
    const load =
      type === "shader"
        ? window.mcl.listRecommendedShaders(version)
        : window.mcl.listRecommendedMods(version);
    load
      .then((list) => {
        if (stale) return;
        listCache.set(cacheKey(type, version), list);
        applyList(list);
      })
      .catch(() => {
        if (!stale) setListState("error");
      });
    return () => {
      stale = true;
    };
  }, [type, version]);

  async function install(item: RecommendedItem): Promise<void> {
    setStates((s) => ({ ...s, [item.slug]: "installing" }));
    try {
      await window.mcl.installContent(item.type, item.slug, version);
      setStates((s) => ({ ...s, [item.slug]: "installed" }));
      onInstalled?.();
      // keep the cache in sync so re-entering the tab still shows it installed
      const key = cacheKey(type, version);
      const cached = listCache.get(key);
      if (cached) {
        listCache.set(
          key,
          cached.map((it) =>
            it.slug === item.slug ? { ...it, installed: true } : it,
          ),
        );
      }
    } catch (err: unknown) {
      setErrors((e) => ({ ...e, [item.slug]: toFriendlyError(err).title }));
      setStates((s) => ({ ...s, [item.slug]: "error" }));
    }
  }

  if (listState === "loading") {
    return <p className="notes-meta">Loading recommendations…</p>;
  }
  if (listState === "error") {
    return (
      <p className="notes-meta">
        Couldn’t load recommendations (are you offline?).
      </p>
    );
  }

  return (
    <div className="catalog">
      {type === "mod" ? (
        <p className="catalog-hint">
          These load through Fabric — we’ll switch the Fabric toggle on when you
          install one. Then just hit Play.
        </p>
      ) : (
        <p className="catalog-hint">
          Installing a shader also adds Iris &amp; Sodium to your mods (Fabric
          gets switched on). After launching, turn it on in-game via Options →
          Video Settings → Shader Packs.
        </p>
      )}
      {items.map((item) => {
        const state = states[item.slug] ?? "idle";
        return (
          <div className="catalog-item" key={item.slug}>
            {item.iconUrl ? (
              <img className="catalog-icon" src={item.iconUrl} alt="" />
            ) : (
              <div className="catalog-icon catalog-icon-empty" />
            )}
            <div className="catalog-info">
              <div className="catalog-head">
                <span className="catalog-title">{item.title}</span>
                {item.license && (
                  <span className="catalog-license">{item.license}</span>
                )}
              </div>
              <p className="catalog-blurb">{item.blurb}</p>
              <p className="catalog-desc">{item.description}</p>
              <a className="catalog-link" href={item.pageUrl}>
                View on Modrinth
              </a>
              {state === "error" && errors[item.slug] && (
                <p className="catalog-error">{errors[item.slug]}</p>
              )}
            </div>
            <div className="catalog-action">
              {!item.compatible ? (
                <span className="catalog-na">Not available for {version}</span>
              ) : state === "installed" ? (
                <span className="catalog-installed">✓ Installed</span>
              ) : (
                <button
                  className={`mc-btn catalog-btn ${
                    state === "error" ? "catalog-btn-retry" : "catalog-btn-install"
                  }`}
                  disabled={state === "installing"}
                  onClick={() => void install(item)}
                >
                  {state === "installing"
                    ? "INSTALLING…"
                    : state === "error"
                      ? "RETRY"
                      : "INSTALL"}
                </button>
              )}
            </div>
          </div>
        );
      })}

      <div className="catalog-browse">
        <p className="catalog-browse-lead">Want something that isn’t listed?</p>
        <a href={BROWSE_URL[type]}>
          Browse {type === "shader" ? "shaders" : "mods"} on Modrinth →
        </a>
        <ol className="catalog-steps">
          {type === "mod" ? (
            <>
              <li>
                On the project page, pick a file for Minecraft{" "}
                <strong>{version}</strong> with the <strong>Fabric</strong>{" "}
                loader.
              </li>
              <li>Download the .jar.</li>
              <li>
                Open this version’s mods folder below and drop it in, then hit
                Play.
              </li>
            </>
          ) : (
            <>
              <li>Download the shaderpack .zip — don’t unzip it.</li>
              <li>Open your shaders folder below and drop it in.</li>
              <li>
                Launch, then enable it via Options → Video Settings → Shader
                Packs.
              </li>
            </>
          )}
        </ol>
        <button
          type="button"
          className="mc-btn catalog-folder-btn"
          onClick={() =>
            void (type === "shader"
              ? window.mcl.openShadersFolder()
              : window.mcl.openModsFolder(version))
          }
        >
          Open {type === "shader" ? "shaders" : "mods"} folder
        </button>
        <span className="catalog-browse-soon">In-app search coming soon.</span>
      </div>
    </div>
  );
}
