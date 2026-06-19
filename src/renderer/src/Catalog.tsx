import { useEffect, useState } from "react";
import type {
  ContentType,
  ContentUpdate,
  RecommendedItem,
} from "../../shared/ipc.js";
import { toFriendlyError } from "./errors.js";

type ListState = "loading" | "ready" | "error";
type ItemState = "installing" | "error";

// Session caches. The curated list and update check both hit Modrinth, so we
// cache them; the installed-files list is a cheap local read, always fresh.
const listCache = new Map<string, RecommendedItem[]>();
const updatesCache = new Map<string, ContentUpdate[]>();
const cacheKey = (type: ContentType, version: string): string =>
  `${type}:${version}`;

const BROWSE_URL: Record<ContentType, string> = {
  mod: "https://modrinth.com/mods",
  shader: "https://modrinth.com/shaders",
  resourcepack: "https://modrinth.com/resourcepacks",
};

export function Catalog({
  type,
  version,
  onInstalled,
}: {
  type: ContentType;
  version: string;
  /** called after a successful install/update (mods load through Fabric) */
  onInstalled?: () => void;
}): JSX.Element {
  const [items, setItems] = useState<RecommendedItem[]>([]);
  const [listState, setListState] = useState<ListState>("loading");
  // the on-disk truth: filenames present in this version's folder
  const [installedFiles, setInstalledFiles] = useState<string[]>([]);
  const [updates, setUpdates] = useState<ContentUpdate[]>([]);
  const [busy, setBusy] = useState<Record<string, ItemState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<Record<string, boolean>>({});
  const [updating, setUpdating] = useState<Record<string, boolean>>({});

  // re-read installed files + updates after any change to the folder
  async function refreshState(): Promise<void> {
    updatesCache.delete(cacheKey(type, version));
    try {
      const [files, ups] = await Promise.all([
        window.mcl.listInstalled(type, version),
        window.mcl.findUpdates(type, version),
      ]);
      setInstalledFiles(files);
      updatesCache.set(cacheKey(type, version), ups);
      setUpdates(ups);
    } catch {
      // keep whatever we had
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
          : type === "resourcepack"
            ? window.mcl.listRecommendedResourcepacks(version)
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

    const cachedUpdates = updatesCache.get(cacheKey(type, version));
    if (cachedUpdates) {
      setUpdates(cachedUpdates);
    } else {
      window.mcl
        .findUpdates(type, version)
        .then((ups) => {
          if (stale) return;
          updatesCache.set(cacheKey(type, version), ups);
          setUpdates(ups);
        })
        .catch(() => {
          if (!stale) setUpdates([]);
        });
    }

    return () => {
      stale = true;
    };
  }, [type, version]);

  async function install(item: RecommendedItem): Promise<void> {
    setBusy((s) => ({ ...s, [item.slug]: "installing" }));
    try {
      await window.mcl.installContent(item.type, item.slug, version);
      if (type !== "resourcepack") onInstalled?.();
      await refreshState();
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
      await refreshState();
    } catch {
      // leave it; the user can retry
    } finally {
      setRemoving((r) => {
        const next = { ...r };
        delete next[file];
        return next;
      });
    }
  }

  async function update(oldFileName: string): Promise<void> {
    setUpdating((u) => ({ ...u, [oldFileName]: true }));
    try {
      await window.mcl.updateContent(type, version, oldFileName);
      if (type !== "resourcepack") onInstalled?.();
      await refreshState();
    } catch {
      // leave it; the user can retry
    } finally {
      setUpdating((u) => {
        const next = { ...u };
        delete next[oldFileName];
        return next;
      });
    }
  }

  async function updateAll(): Promise<void> {
    const targets = updates.map((u) => u.oldFileName);
    setUpdating((u) => ({
      ...u,
      ...Object.fromEntries(targets.map((t) => [t, true])),
    }));
    try {
      for (const target of targets) {
        await window.mcl.updateContent(type, version, target);
      }
      if (type !== "resourcepack") onInstalled?.();
      await refreshState();
    } catch {
      // partial updates still apply; refresh reflects what landed
      await refreshState();
    } finally {
      setUpdating({});
    }
  }

  const updateForFile = (file: string): ContentUpdate | undefined =>
    updates.find((u) => u.oldFileName === file);
  const updateForCard = (item: RecommendedItem): ContentUpdate | undefined =>
    item.fileName
      ? updates.find((u) => u.newFileName === item.fileName)
      : undefined;

  const noun =
    type === "shader"
      ? "shaders"
      : type === "resourcepack"
        ? "resource packs"
        : "mods";

  return (
    <div className="catalog">
      {type === "mod" ? (
        <p className="catalog-hint">
          These load through Fabric — we’ll switch the Fabric toggle on when you
          install one. Then just hit Play.
        </p>
      ) : type === "shader" ? (
        <p className="catalog-hint">
          Installing a shader also adds Iris &amp; Sodium to your mods (Fabric
          gets switched on). After launching, turn it on in-game via Options →
          Video Settings → Shader Packs.
        </p>
      ) : (
        <p className="catalog-hint">
          Resource packs work in vanilla too — no Fabric needed. After
          launching, enable them via Options → Resource Packs. (Fresh Animations
          also needs the ETF &amp; EMF mods.)
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
        const cardUpdate = updateForCard(item);
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
              ) : cardUpdate ? (
                <button
                  className="mc-btn catalog-btn catalog-btn-update"
                  disabled={Boolean(updating[cardUpdate.oldFileName])}
                  onClick={() => void update(cardUpdate.oldFileName)}
                >
                  {updating[cardUpdate.oldFileName] ? "UPDATING…" : "UPDATE"}
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
        <div className="installed-head">
          <h3 className="installed-title">
            {type === "shader"
              ? "Installed shaderpacks"
              : type === "resourcepack"
                ? "Installed resource packs"
                : `Installed for ${version}`}
          </h3>
          {updates.length > 0 && (
            <button
              type="button"
              className="installed-update-all"
              onClick={() => void updateAll()}
            >
              ↑ Update all ({updates.length})
            </button>
          )}
        </div>
        {installedFiles.length === 0 ? (
          <p className="notes-meta">Nothing installed yet.</p>
        ) : (
          <ul className="installed-list">
            {installedFiles.map((file) => {
              const fileUpdate = updateForFile(file);
              return (
                <li className="installed-item" key={file}>
                  <span className="installed-name">{file}</span>
                  <div className="installed-actions">
                    {fileUpdate && (
                      <button
                        type="button"
                        className="installed-update"
                        disabled={Boolean(updating[file])}
                        onClick={() => void update(file)}
                      >
                        {updating[file] ? "Updating…" : "↑ Update"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="installed-remove"
                      disabled={Boolean(removing[file])}
                      onClick={() => void remove(file)}
                    >
                      {removing[file] ? "Removing…" : "✕ Remove"}
                    </button>
                  </div>
                </li>
              );
            })}
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
          ) : type === "shader" ? (
            <>
              <li>Download the shaderpack .zip — don’t unzip it.</li>
              <li>Open your shaders folder below and drop it in.</li>
              <li>
                Launch, then enable it via Options → Video Settings → Shader
                Packs.
              </li>
            </>
          ) : (
            <>
              <li>Download the resource pack .zip — don’t unzip it.</li>
              <li>Open your resource packs folder below and drop it in.</li>
              <li>Launch, then enable it via Options → Resource Packs.</li>
            </>
          )}
        </ol>
        <button
          type="button"
          className="mc-btn catalog-folder-btn"
          onClick={() =>
            void (type === "shader"
              ? window.mcl.openShadersFolder()
              : type === "resourcepack"
                ? window.mcl.openResourcepacksFolder()
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
