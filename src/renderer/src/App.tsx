import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ProgressEvent,
  ReleaseNotes,
  VersionSummary,
} from "../../shared/ipc.js";
import { toFriendlyError } from "./errors.js";
import { Catalog } from "./Catalog.js";

type Phase = "idle" | "preparing" | "running" | "exited" | "error";
type NotesState = "loading" | "ready" | "none" | "error";
type Tab = "play" | "mods" | "shaders";

// the csp already blocks scripts; this strips script/embed tags, on* handlers,
// and javascript: urls from the remote notes html as defense in depth before injecting it.
function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll("script,style,iframe,object,embed,link,meta")
    .forEach((el) => el.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(attr.name);
      else if (
        (name === "href" || name === "src") &&
        value.startsWith("javascript:")
      ) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
}

export function App(): JSX.Element {
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [version, setVersion] = useState<string>("");
  const [username, setUsername] = useState<string>("Player");
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<string>("Loading versions…");
  const [errorHint, setErrorHint] = useState<string>("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [logs, setLogs] = useState<string[]>([]);
  const logRef = useRef<HTMLPreElement>(null);

  const [notes, setNotes] = useState<ReleaseNotes | null>(null);
  const [notesState, setNotesState] = useState<NotesState>("none");
  const [showWelcome, setShowWelcome] = useState<boolean>(false);
  const [fabric, setFabric] = useState<boolean>(false);
  const [tab, setTab] = useState<Tab>("play");

  const autoPlayed = useRef(false);

  useEffect(() => {
    Promise.all([window.mcl.listVersions(), window.mcl.getSettings()])
      .then(([list, settings]) => {
        setVersions(list);
        const params = new URLSearchParams(window.location.search);

        // version/username precedence: url param > saved > default
        const wanted = params.get("v") || settings.version || "";
        const initial =
          list.find((v) => v.id === wanted)?.id ?? list[0]?.id ?? "";
        setVersion(initial);

        const savedUser = params.get("u") || settings.username;
        if (savedUser) setUsername(savedUser);
        setFabric(Boolean(settings.fabric));

        if (!settings.seenWelcome) setShowWelcome(true);

        // test hook: ?autoplay=1 auto-launches
        if (params.get("autoplay") === "1" && initial && !autoPlayed.current) {
          autoPlayed.current = true;
          const user = params.get("u") || settings.username || "Player";
          setUsername(user);
          void startPlay(initial, user, Boolean(settings.fabric));
        }

        // test hooks: ?progress=N forces the progress line, ?error=<text> a friendly error
        const prog = params.get("progress");
        const errParam = params.get("error");
        if (errParam) {
          const fe = toFriendlyError(new Error(errParam));
          setPhase("error");
          setStatus(fe.title);
          setErrorHint(fe.hint);
        } else if (prog !== null) {
          const n = Number(prog);
          setProgress({ done: n, total: 100 });
          setStatus(`Downloading game files… ${n * 10} / 1000 (${n}%)`);
        } else {
          setStatus("Ready.");
        }
      })
      .catch((err: unknown) => {
        const fe = toFriendlyError(err);
        setPhase("error");
        setStatus(fe.title);
        setErrorHint(fe.hint);
      });
  }, []);

  useEffect(() => {
    return window.mcl.onProgress((event: ProgressEvent) => {
      switch (event.kind) {
        case "step":
          setStatus(event.message);
          setProgress(null);
          break;
        case "assets": {
          const p = Math.round((event.done / event.total) * 100);
          setStatus(
            `Downloading game files… ${event.done} / ${event.total} (${p}%)`,
          );
          setProgress({ done: event.done, total: event.total });
          break;
        }
        case "java": {
          const p = Math.round((event.done / event.total) * 100);
          setStatus(`Setting up Java… ${event.done} / ${event.total} (${p}%)`);
          setProgress({ done: event.done, total: event.total });
          break;
        }
        case "launched":
          setPhase("running");
          setStatus(event.message);
          setProgress(null);
          break;
        case "log":
          setLogs((prev) => [...prev.slice(-400), event.line]);
          break;
        case "exit":
          setPhase("exited");
          setStatus(
            event.code === 0
              ? "Minecraft closed. Ready to play again."
              : `Minecraft exited unexpectedly (code ${event.code}).`,
          );
          break;
      }
    });
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight);
  }, [logs]);

  useEffect(() => {
    if (!version) return;
    let stale = false;
    setNotesState("loading");
    setNotes(null);
    window.mcl
      .getReleaseNotes(version)
      .then((result) => {
        if (stale) return;
        setNotes(result);
        setNotesState(result ? "ready" : "none");
      })
      .catch(() => {
        if (!stale) setNotesState("error");
      });
    return () => {
      stale = true;
    };
  }, [version]);

  const busy = phase === "preparing" || phase === "running";
  const pct = useMemo(
    () => (progress ? Math.round((progress.done / progress.total) * 100) : null),
    [progress],
  );

  async function startPlay(
    ver: string,
    user: string,
    useFabric: boolean,
  ): Promise<void> {
    if (!ver || !user.trim()) return;
    void window.mcl.saveSettings({
      version: ver,
      username: user.trim(),
      fabric: useFabric,
    });
    setPhase("preparing");
    setLogs([]);
    setErrorHint("");
    setStatus("Getting things ready…");
    try {
      await window.mcl.play({
        version: ver,
        username: user.trim(),
        fabric: useFabric,
      });
    } catch (err: unknown) {
      const fe = toFriendlyError(err);
      setPhase("error");
      setStatus(fe.title);
      setErrorHint(fe.hint);
    }
  }

  function onPlay(): void {
    void startPlay(version, username, fabric);
  }

  function dismissWelcome(): void {
    setShowWelcome(false);
    void window.mcl.saveSettings({
      version,
      username: username.trim(),
      fabric,
      seenWelcome: true,
    });
  }

  const playLabel =
    phase === "running"
      ? "RUNNING…"
      : phase === "preparing"
        ? "PREPARING…"
        : "PLAY";

  return (
    <div className="app">
      {showWelcome && (
        <div className="welcome-overlay">
          <div className="welcome-card">
            <h1 className="welcome-title">Welcome!</h1>
            <p className="welcome-lede">
              You don’t need to know anything — this launcher walks you all the
              way to playing. Nothing to install.
            </p>
            <ol className="welcome-steps">
              <li>
                <span className="welcome-num">1</span>
                <div>
                  <strong>Download</strong>
                  <p>We fetch the official game files straight from Mojang.</p>
                </div>
              </li>
              <li>
                <span className="welcome-num">2</span>
                <div>
                  <strong>Set up Java</strong>
                  <p>We grab the right Java version for you — no installs.</p>
                </div>
              </li>
              <li>
                <span className="welcome-num">3</span>
                <div>
                  <strong>Play</strong>
                  <p>Pick a name, hit Play, and you’re in (offline singleplayer).</p>
                </div>
              </li>
            </ol>
            <button className="mc-btn play welcome-go" onClick={dismissWelcome}>
              LET’S GO
            </button>
          </div>
        </div>
      )}

      <nav className="tabs">
        <button
          className={`tab${tab === "play" ? " tab-active" : ""}`}
          onClick={() => setTab("play")}
        >
          What’s New
        </button>
        <button
          className={`tab${tab === "mods" ? " tab-active" : ""}`}
          onClick={() => setTab("mods")}
        >
          Mods
        </button>
        <button
          className={`tab${tab === "shaders" ? " tab-active" : ""}`}
          onClick={() => setTab("shaders")}
        >
          Shaders
        </button>
      </nav>

      {tab !== "play" ? (
        <section className="notes notes-tabbed">
          <Catalog type={tab === "shaders" ? "shader" : "mod"} version={version} />
        </section>
      ) : logs.length > 0 ? (
        <pre className="logs notes-tabbed" ref={logRef}>
          {logs.join("\n")}
        </pre>
      ) : (
        <section className="notes notes-tabbed">
          {notesState === "loading" && (
            <p className="notes-meta">Loading release notes…</p>
          )}
          {notesState === "none" && (
            <p className="notes-meta">
              No release notes for {version || "this version"}.
            </p>
          )}
          {notesState === "error" && (
            <p className="notes-meta">
              Couldn’t load release notes (are you offline?).
            </p>
          )}
          {notesState === "ready" && notes && (
            <article className="notes-article">
              <div className="notes-head">
                <h2 className="notes-title">{notes.title}</h2>
                <span className="notes-date">{notes.date}</span>
              </div>
              <div className="notes-main">
                {notes.imageUrl && (
                  <img className="notes-hero" src={notes.imageUrl} alt="" />
                )}
                <div
                  className="notes-body"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(notes.bodyHtml),
                  }}
                />
              </div>
            </article>
          )}
        </section>
      )}

      <footer className="panel">
        {pct !== null && (
          <div
            className="progress-line"
            role="progressbar"
            style={{ width: `${pct}%` }}
          />
        )}
        <div className="controls">
          <div className="fields">
            <label className="field field-version">
              <span>Version</span>
              <select
                value={version}
                disabled={busy || versions.length === 0}
                onChange={(e) => setVersion(e.target.value)}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="field field-username">
              <span>
                Username
                <span
                  className="info"
                  title="Offline mode: pick any name and play singleplayer right away. Joining official online servers or Realms needs a Microsoft account (coming in a later version)."
                >
                  ⓘ
                </span>
              </span>
              <input
                value={username}
                disabled={busy}
                spellCheck={false}
                maxLength={16}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Player"
              />
            </label>
          </div>

          <button
            className="mc-btn play"
            disabled={busy || !version}
            onClick={onPlay}
          >
            {playLabel}
          </button>
        </div>

        <div className="mods-row">
          <label className="toggle">
            <input
              type="checkbox"
              checked={fabric}
              disabled={busy}
              onChange={(e) => setFabric(e.target.checked)}
            />
            <span>Fabric mods</span>
          </label>
          {fabric && (
            <button
              type="button"
              className="linkish"
              onClick={() => void window.mcl.openModsFolder()}
            >
              Open mods folder
            </button>
          )}
        </div>

        <div className={`status${phase === "error" ? " status-error" : ""}`}>
          <span className="status-text">{status}</span>
          {phase === "error" && errorHint && (
            <span className="status-hint">{errorHint}</span>
          )}
        </div>
      </footer>
    </div>
  );
}
