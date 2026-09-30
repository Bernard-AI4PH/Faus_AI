import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Eye,
  LoaderCircle,
  Monitor,
  Pin,
  Plus,
  Cpu,
  Search,
  MessageSquarePlus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import Markdown from "react-markdown";
import type { Message, Settings, Source } from "./types";
const initial: Settings = {
  provider: "ollama",
  endpoint: "http://127.0.0.1:11434",
  model: "",
};
const errorText = (e: unknown) =>
  e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': Error: /, "")
    : String(e);
export default function App() {
  const [settings, setSettings] = useState<Settings>(initial);
  const [panel, setPanel] = useState<"settings" | "sources" | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const [preview, setPreview] = useState("");
  const [modelChanging, setModelChanging] = useState(false);
  const [pinned, setPinned] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  useEffect(() => {
    if (!window.faus) {
      setError(
        "Open FAUS_AI as a desktop app to connect models and read application windows.",
      );
      return;
    }
    window.faus
      .settings()
      .then(setSettings)
      .catch((e) => setError(errorText(e)));
    return window.faus.onToken(({ id, text }) =>
      setMessages((old) =>
        old.map((m) => (m.id === id ? { ...m, content: m.content + text } : m)),
      ),
    );
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);
  async function send() {
    if (!input.trim() || sending.current || modelChanging) return;
    sending.current = true;
    setBusy(true);
    setError("");
    const text = input.trim();
    let started = false;
    try {
      if (!settings.model)
        throw new Error("Open Connections and select a model first.");
      const capture = source ? await window.faus.capture(source.id) : undefined;
      if (capture) setPreview(capture.image);
      const next: Message[] = [
        ...messages.filter((m) => m.content),
        {
          id: crypto.randomUUID(),
          role: "user",
          content: text,
          context: capture?.name,
        },
      ];
      const id = crypto.randomUUID();
      setMessages([...next, { id, role: "assistant", content: "" }]);
      setInput("");
      started = true;
      await window.faus.chat({ id, messages: next, image: capture?.image });
    } catch (e) {
      setError(errorText(e));
      if (started) setMessages((old) => old.filter((m) => m.content));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="app">
      <header className="titlebar">
        <span className="wordmark">FAUS_AI</span>
        <button
          className={`icon ${pinned ? "active" : ""}`}
          aria-label={pinned ? "Unpin window" : "Keep window on top"}
          title="Keep on top"
          onClick={async () => {
            try {
              setPinned(await window.faus.pin(!pinned));
            } catch (e) {
              setError(errorText(e));
            }
          }}
        >
          <Pin size={16} />
        </button>
      </header>
      <nav className="toolbar">
        <div className="toolbar-actions">
          <button
            className="icon"
            title="New chat"
            aria-label="New chat"
            disabled={busy}
            onClick={() => {
              setMessages([]);
              setError("");
              setPreview("");
            }}
          >
            <MessageSquarePlus size={18} />
          </button>
          <button
            className="icon"
            title="Connections"
            aria-label="Connections"
            disabled={busy}
            onClick={() => setPanel("settings")}
          >
            <Settings2 size={18} />
          </button>
        </div>
      </nav>
      <main className="conversation">
        {messages.length === 0 ? (
          <div className="empty-canvas" aria-label="Empty conversation" />
        ) : (
          <div className="messages">
            {messages.map((m) => (
              <article className={`message ${m.role}`} key={m.id}>
                <div className="message-label">
                  {m.role === "assistant" ? (
                    <>
                      <span className="mini-star">✳</span> FAUS_AI
                    </>
                  ) : (
                    "You"
                  )}
                  {m.context && (
                    <span className="context-tag">
                      <Eye size={11} />
                      {m.context}
                    </span>
                  )}
                </div>
                {m.content ? (
                  <Markdown>{m.content}</Markdown>
                ) : (
                  <span className="thinking">
                    <LoaderCircle size={14} />
                  </span>
                )}
              </article>
            ))}
            <div ref={bottom} />
          </div>
        )}
      </main>
      <footer>
        {error && (
          <div className="error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={14} />
            </button>
          </div>
        )}
        {source && (
          <div className="context-preview">
            {preview ? (
              <img src={preview} alt="Last screen context sent" />
            ) : (
              <Monitor size={22} />
            )}
            <div>
              <strong>{source.name}</strong>
            </div>
            <button
              className="icon"
              aria-label="Remove screen context"
              disabled={busy}
              onClick={() => {
                setSource(null);
                setPreview("");
              }}
            >
              <X size={15} />
            </button>
          </div>
        )}
        <div className="composer">
          <textarea
            aria-label="Message FAUS_AI"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
          />
          <div className="composer-bottom">
            <button
              className={`context-button ${source ? "selected" : ""}`}
              aria-label={source ? "Change window" : "Add window"}
              title={source ? "Change window" : "Add window"}
              disabled={busy}
              onClick={() => setPanel("sources")}
            >
              <Monitor size={15} />
            </button>
            <ModelPicker
              settings={settings}
              disabled={busy || modelChanging}
              changing={setModelChanging}
              saved={setSettings}
              configure={() => setPanel("settings")}
            />
            {busy ? (
              <button
                className="send"
                aria-label="Stop response"
                onClick={() => window.faus.stop()}
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                className="send"
                aria-label="Send message"
                disabled={!input.trim() || modelChanging}
                onClick={() => void send()}
              >
                <ArrowUp size={19} />
              </button>
            )}
          </div>
        </div>
      </footer>
      {panel === "settings" && (
        <Connections
          current={settings}
          close={() => setPanel(null)}
          saved={(s) => {
            setSettings(s);
            setPanel(null);
            setError("");
          }}
        />
      )}
      {panel === "sources" && (
        <WindowPicker
          close={() => setPanel(null)}
          select={(s) => {
            setSource(s);
            setPreview(s.thumbnail);
            setPanel(null);
          }}
        />
      )}
    </div>
  );
}
function ModelPicker({
  settings,
  disabled,
  saved,
  changing,
  configure,
}: {
  settings: Settings;
  disabled: boolean;
  saved: (s: Settings) => void;
  changing: (v: boolean) => void;
  configure: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector("input")?.focus({ preventScroll: true });
    let active = true;
    setLoading(true);
    setError("");
    setModels([]);
    window.faus
      .models(settings)
      .then((list) => {
        if (active) setModels(list);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      active = false;
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, settings]);
  const available = [
    ...new Set([...(settings.model ? [settings.model] : []), ...models]),
  ].filter((model) => model.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="model-picker" ref={root}>
      <button
        ref={trigger}
        className="model-trigger"
        aria-label="Select model"
        title="Select model"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => {
          setQuery("");
          setOpen(!open);
        }}
      >
        <Cpu size={14} />
        {settings.model && <span>{settings.model}</span>}
        <ChevronDown size={12} />
      </button>
      {open && (
        <section
          className="model-menu"
          role="dialog"
          aria-label="Model selection"
        >
          <div className="model-search">
            <Search size={14} />
            <input
              aria-label="Search models"
              placeholder="Search models"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="model-options" aria-busy={loading}>
            {available.map((model) => (
              <button
                key={model}
                className="model-option"
                disabled={disabled}
                aria-pressed={model === settings.model}
                onClick={async () => {
                  changing(true);
                  setError("");
                  try {
                    const next = { ...settings, model };
                    await window.faus.save(next);
                    saved(next);
                    setOpen(false);
                    trigger.current?.focus();
                  } catch (e) {
                    setError(errorText(e));
                  } finally {
                    changing(false);
                  }
                }}
              >
                <Cpu size={14} />
                <span>{model}</span>
                {model === settings.model && <Check size={14} />}
              </button>
            ))}
            {loading && (
              <div className="model-feedback" role="status">
                <LoaderCircle size={15} className="spin" />
                Loading models…
              </div>
            )}
            {!loading && !available.length && !error && (
              <div className="model-feedback">No models found.</div>
            )}
            {error && (
              <div className="model-feedback model-error" role="alert">
                {error}
              </div>
            )}
          </div>
          <button
            className="model-configure"
            onClick={() => {
              setOpen(false);
              configure();
            }}
          >
            <Settings2 size={14} />
            Connections
            <span>{settings.provider === "ollama" ? "Ollama" : "API"}</span>
          </button>
        </section>
      )}
    </div>
  );
}
function Connections({
  current,
  close,
  saved,
}: {
  current: Settings;
  close: () => void;
  saved: (s: Settings) => void;
}) {
  const [draft, setDraft] = useState(current);
  const [models, setModels] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function discover() {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const list = await window.faus.models(draft);
      setModels(list);
      setNotice(
        list.length
          ? `${list.length} models found`
          : "No installed models found. Install a model in Ollama, then refresh.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="overlay">
      <section
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-title"
      >
        <div className="panel-header">
          <div>
            <h2 id="connection-title">Connections</h2>
          </div>
          <button
            className="icon"
            aria-label="Close connections"
            onClick={close}
          >
            <X size={19} />
          </button>
        </div>
        <div className="tabs">
          {(["ollama", "api"] as const).map((p) => (
            <button
              className={draft.provider === p ? "chosen" : ""}
              key={p}
              onClick={() => {
                setDraft({
                  provider: p,
                  endpoint:
                    p === "ollama"
                      ? "http://127.0.0.1:11434"
                      : "https://api.openai.com/v1",
                  model: "",
                  apiKey: "",
                });
                setModels([]);
                setError("");
                setNotice("");
              }}
            >
              {p === "ollama" ? "Ollama · local" : "Compatible API"}
            </button>
          ))}
        </div>
        <p className="panel-copy">
          {draft.provider === "ollama"
            ? "Connect to Ollama running on your Mac. Discover installed models, then choose one for your conversation."
            : "Connect an OpenAI-compatible chat completions server. Screen context is sent to this server when you ask a question."}
        </p>
        <label>
          Server URL
          <input
            value={draft.endpoint}
            onChange={(e) => setDraft({ ...draft, endpoint: e.target.value })}
          />
        </label>
        {draft.provider === "api" && (
          <label>
            API key
            <input
              type="password"
              autoComplete="off"
              value={draft.apiKey ?? ""}
              placeholder={
                draft.hasKey
                  ? "Saved securely · leave blank to keep"
                  : "Enter your API key"
              }
              onChange={(e) =>
                setDraft({ ...draft, apiKey: e.target.value || undefined })
              }
            />
          </label>
        )}
        <div className="field-header">
          <span>Model</span>
          <button
            className="text-button"
            disabled={working}
            onClick={() => void discover()}
          >
            <RefreshCw size={13} className={working ? "spin" : ""} />
            Discover models
          </button>
        </div>
        <input
          aria-label="Model name"
          list="models"
          placeholder="Discover or enter a model name"
          value={draft.model}
          onChange={(e) => setDraft({ ...draft, model: e.target.value })}
        />
        <datalist id="models">
          {models.map((m) => (
            <option value={m} key={m} />
          ))}
        </datalist>
        {models.length > 0 && (
          <select
            aria-label="Discovered models"
            value={models.includes(draft.model) ? draft.model : ""}
            onChange={(e) => setDraft({ ...draft, model: e.target.value })}
          >
            <option value="" disabled>
              Select a discovered model
            </option>
            {models.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        )}
        {notice && <div className="notice">{notice}</div>}
        <div className="info">
          <Eye size={17} />
          <span>
            Choose a vision-capable model to read windows. Text-only models can
            still chat without screen context.
          </span>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary"
          disabled={working || !draft.model.trim()}
          onClick={async () => {
            setWorking(true);
            try {
              await window.faus.save(draft);
              saved({
                ...draft,
                apiKey: undefined,
                hasKey: !!draft.apiKey || draft.hasKey,
              });
            } catch (e) {
              setError(errorText(e));
            } finally {
              setWorking(false);
            }
          }}
        >
          <Check size={16} />
          Save connection
        </button>
        <p className="fineprint">
          Keys are encrypted using macOS secure storage. Conversations and
          screen images stay in memory for this session.
        </p>
      </section>
    </div>
  );
}
function WindowPicker({
  close,
  select,
}: {
  close: () => void;
  select: (s: Source) => void;
}) {
  const [items, setItems] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const result = await window.faus.sources();
      setItems(result.items);
      if (result.permission === "denied" || result.permission === "restricted")
        setError(
          "Enable FAUS_AI in macOS Screen Recording settings, then quit and reopen the app.",
        );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <div className="overlay">
      <section
        className="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="window-title"
      >
        <div className="panel-header">
          <div>
            <h2 id="window-title">Choose a window</h2>
          </div>
          <button
            className="icon"
            aria-label="Close window picker"
            onClick={close}
          >
            <X size={19} />
          </button>
        </div>
        <p className="panel-copy">
          Select RStudio, your browser, or another window. A fresh image is
          captured only when you send a message. Full-screen sources include
          everything visible.
        </p>
        <div className="picker-actions">
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCw size={14} className={busy ? "spin" : ""} />
            Refresh
          </button>
          <button
            className="text-button"
            onClick={() => window.faus.permission()}
          >
            Screen Recording settings ↗
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="window-grid">
          {items.map((item) => (
            <button key={item.id} onClick={() => select(item)}>
              <img src={item.thumbnail} alt="" />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
        {busy && (
          <p className="empty">
            <LoaderCircle className="spin" size={20} />
            Looking for open windows…
          </p>
        )}
        {!busy && !items.length && (
          <p className="empty">
            No windows available. Check Screen Recording permission and refresh.
          </p>
        )}
        <div className="info">
          <ShieldCheck size={17} />
          <span>
            You can remove screen context at any time. FAUS_AI reads
            screenshots; it does not control your applications.
          </span>
        </div>
      </section>
    </div>
  );
}
