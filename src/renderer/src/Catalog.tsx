import { useEffect, useState } from "react";
import type { ContentType, RecommendedItem } from "../../shared/ipc.js";
import { toFriendlyError } from "./errors.js";

type ListState = "loading" | "ready" | "error";
type ItemState = "idle" | "installing" | "installed" | "error";

export function Catalog({
  type,
  version,
}: {
  type: ContentType;
  version: string;
}): JSX.Element {
  const [items, setItems] = useState<RecommendedItem[]>([]);
  const [listState, setListState] = useState<ListState>("loading");
  const [states, setStates] = useState<Record<string, ItemState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!version) return;
    let stale = false;
    setListState("loading");
    const load =
      type === "shader"
        ? window.mcl.listRecommendedShaders(version)
        : window.mcl.listRecommendedMods(version);
    load
      .then((list) => {
        if (stale) return;
        setItems(list);
        setStates(
          Object.fromEntries(
            list.map((it) => [it.slug, it.installed ? "installed" : "idle"]),
          ),
        );
        setListState("ready");
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
      {type === "shader" && (
        <p className="catalog-hint">
          Installing a shader also adds Iris &amp; Sodium to your mods. After
          launching, turn it on in-game via Options → Video Settings → Shader
          Packs.
        </p>
      )}
      {items.map((item) => {
        const state = states[item.slug] ?? "idle";
        const label =
          state === "installing"
            ? "INSTALLING…"
            : state === "installed"
              ? "INSTALLED"
              : state === "error"
                ? "RETRY"
                : "INSTALL";
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
              {item.compatible ? (
                <button
                  className="mc-btn catalog-btn"
                  disabled={state === "installing" || state === "installed"}
                  onClick={() => void install(item)}
                >
                  {label}
                </button>
              ) : (
                <span className="catalog-na">Not available for {version}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
