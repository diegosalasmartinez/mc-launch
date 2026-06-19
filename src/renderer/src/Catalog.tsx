import { useEffect, useState } from "react";
import type { ContentType, RecommendedItem } from "../../shared/ipc.js";
import { toFriendlyError } from "./errors.js";

type ListState = "loading" | "ready" | "error";
type ItemState = "installing" | "error";

// Session cache for the curated list (Modrinth lookups). The installed-files list
// is read fresh from disk — it's local and cheap, and must stay accurate.
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
  // the on-disk truth: filenames present in this version's folder
  const [installedFiles, setInstalledFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState<Record<string, ItemState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<Record<string, boolean>>({});

  async function refreshInstalled(): Promise<void> {
    try {
      setInstalledFiles(await window.mcl.listInstalled(type, version));
    } catch {
      // keep whatever we had; the list just won't update
    }
  }

  useEffect(() => {
    if (!version) return;
    let stale = false;

    const cached = listCache.get(cacheKey(type, version));
    if (cached) {
      setItems(cached);
      setListState("ready");
    } else {
      setListState("loading");
      const load =
        type === "shader"
          ? window.mcl.listRecommendedShaders(version)
          : window.mcl.listRecommendedMods(version);
      load
        .then((list) => {
          if (stale) return;
          listCache.set(cacheKey(type, version), list);
          setItems(list);
          setListState("ready");
        })
        .catch(() => {
          if (!stale) setListState("error");
        });
    }

    window.mcl
      .listInstalled(type, version)
      .then((files) => {
        if (!stale) setInstalledFiles(files);
      })
      .catch(() => {
        if (!stale) setInstalledFiles([]);
      });

    return () => {
      stale = true;
    };
  }, [type, version]);

  async function install(item: RecommendedItem): Promise<void> {
    setBusy((s) => ({ ...s, [item.slug]: "installing" }));
    try {
      await window.mcl.installContent(item.type, item.slug, version);
      onInstalled?.();
      await refreshInstalled();
      setBusy((s) => {
        const next = { ...s };
        delete next[item.slug];
        return next;
      });
    } catch (err: unknown) {
      setErrors((e) => ({ ...e, [item.slug]: toFriendlyError(err).title }));
      setBusy((s) => ({ ...s, [item.slug]: "error" }));
    }
  }

  async function remove(file: string): Promise<void> {
    setRemoving((r) => ({ ...r, [file]: true }));
    try {
      await window.mcl.removeInstalled(type, version, file);
      await refreshInstalled();
    } catch {
      // leave it in the list; the user can retry
    } finally {
      setRemoving((r) => {
        const next = { ...r };
        delete next[file];
        return next;
      });
    }
  }

  const noun = type === "shader" ? "shaders" : "mods";

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

      {listState === "loading" && (
        <p className="notes-meta">Loading recommendations…</p>
      )}
      {listState === "error" && (
        <p className="notes-meta">
          Couldn’t load recommendations (are you offline?).
        </p>
      )}

      {items.map((item) => {
        const transient = busy[item.slug];
        const installed =
          item.fileName !== null && installedFiles.includes(item.fileName);
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
              {transient === "error" && errors[item.slug] && (
                <p className="catalog-error">{errors[item.slug]}</p>
              )}
            </div>
            <div className="catalog-action">
              {!item.compatible ? (
                <span className="catalog-na">Not available for {version}</span>
              ) : transient === "installing" ? (
                <button className="mc-btn catalog-btn catalog-btn-install" disabled>
                  INSTALLING…
                </button>
              ) : installed ? (
                <span className="catalog-installed">✓ Installed</span>
              ) : (
                <button
                  className={`mc-btn catalog-btn ${
                    transient === "error"
                      ? "catalog-btn-retry"
                      : "catalog-btn-install"
                  }`}
                  onClick={() => void install(item)}
                >
                  {transient === "error" ? "RETRY" : "INSTALL"}
                </button>
              )}
            </div>
          </div>
        );
      })}

      <div className="installed">
        <h3 className="installed-title">
          {type === "shader"
            ? "Installed shaderpacks"
            : `Installed for ${version}`}
        </h3>
        {installedFiles.length === 0 ? (
          <p className="notes-meta">Nothing installed yet.</p>
        ) : (
          <ul className="installed-list">
            {installedFiles.map((file) => (
              <li className="installed-item" key={file}>
                <span className="installed-name">{file}</span>
                <button
                  type="button"
                  className="installed-remove"
                  disabled={Boolean(removing[file])}
                  onClick={() => void remove(file)}
                >
                  {removing[file] ? "Removing…" : "✕ Remove"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="catalog-browse">
        <p className="catalog-browse-lead">Want something that isn’t listed?</p>
        <a href={BROWSE_URL[type]}>Browse {noun} on Modrinth →</a>
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
          Open {noun} folder
        </button>
        <span className="catalog-browse-soon">In-app search coming soon.</span>
      </div>
    </div>
  );
}
