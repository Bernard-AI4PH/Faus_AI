import {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  systemPreferences,
  safeStorage,
  shell,
  session,
} from "electron";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  endpoint,
  payload,
  chunks,
  type Settings,
  type Message,
} from "./provider";
if (!app.commandLine.hasSwitch("user-data-dir"))
  app.setPath("userData", path.join(app.getPath("appData"), "faus-desktop"));
let win: BrowserWindow;
let controller: AbortController | undefined;
const defaults: Settings = {
  provider: "ollama",
  endpoint: "http://127.0.0.1:11434",
  model: "",
};
let config: Settings = { ...defaults };
function validate(value: Settings): Settings {
  if (
    !value ||
    !["api", "ollama"].includes(value.provider) ||
    typeof value.model !== "string" ||
    value.model.length > 300
  )
    throw new Error("Invalid connection settings.");
  return {
    provider: value.provider,
    endpoint: endpoint(value.endpoint),
    model: value.model,
    apiKey:
      typeof value.apiKey === "string"
        ? value.apiKey
        : value.endpoint === config.endpoint &&
            value.provider === config.provider
          ? config.apiKey
          : "",
  };
}
async function request(
  url: string,
  settings: Settings,
  init: RequestInit = {},
) {
  const res = await fetch(url, {
    ...init,
    redirect: "error",
    signal: init.signal || AbortSignal.timeout(15000),
    headers: {
      "Content-Type": "application/json",
      ...(settings.apiKey
        ? { Authorization: `Bearer ${settings.apiKey}` }
        : {}),
      ...init.headers,
    },
  });
  if (!res.ok)
    throw new Error(
      `Server returned ${res.status}: ${(await res.text()).slice(0, 400)}`,
    );
  return res;
}
async function sources() {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      desktopCapturer.getSources({
        types: ["window", "screen"],
        thumbnailSize: { width: 1920, height: 1200 },
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "Screen capture timed out. Enable Screen Recording for FAUS_AI in System Settings, then restart the app.",
              ),
            ),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
app.whenReady().then(async () => {
  try {
    const saved = JSON.parse(
      await readFile(
        path.join(app.getPath("userData"), "settings.json"),
        "utf8",
      ),
    );
    config = {
      ...defaults,
      ...saved,
      apiKey: saved.secret
        ? safeStorage.decryptString(Buffer.from(saved.secret, "base64"))
        : "",
    };
  } catch {}
  win = new BrowserWindow({
    width: 520,
    height: 820,
    minWidth: 390,
    minHeight: 580,
    title: "FAUS_AI",
    backgroundColor: "#00213a",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  session.defaultSession.setPermissionRequestHandler((_w, _p, cb) => cb(false));
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  const handle = (name: string, fn: (...args: any[]) => any) =>
    ipcMain.handle(name, (event, ...args) => {
      if (
        event.sender !== win.webContents ||
        event.senderFrame !== win.webContents.mainFrame
      )
        throw new Error("Untrusted request");
      return fn(...args);
    });
  handle("settings:get", () => ({
    ...config,
    apiKey: undefined,
    hasKey: !!config.apiKey,
  }));
  handle("settings:save", async (value: Settings) => {
    const next = validate(value);
    if (next.apiKey && !safeStorage.isEncryptionAvailable())
      throw new Error(
        "macOS secure storage is unavailable. Your key was not saved.",
      );
    const { apiKey, ...plain } = next;
    await writeFile(
      path.join(app.getPath("userData"), "settings.json"),
      JSON.stringify({
        ...plain,
        secret: apiKey
          ? safeStorage.encryptString(apiKey).toString("base64")
          : undefined,
      }),
      { mode: 0o600 },
    );
    config = next;
    return true;
  });
  handle("models", async (value: Settings) => {
    const s = validate(value);
    const data = await (
      await request(
        `${s.endpoint}/${s.provider === "ollama" ? "api/tags" : "models"}`,
        s,
      )
    ).json();
    return s.provider === "ollama"
      ? (data.models || []).map((m: any) => m.name)
      : (data.data || []).map((m: any) => m.id);
  });
  handle("permission", async () => {
    await shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    );
  });
  handle("sources", async () => ({
    permission: systemPreferences.getMediaAccessStatus("screen"),
    items: (await sources())
      .filter((s) => s.name !== "FAUS_AI")
      .map((s) => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL(),
      })),
  }));
  handle("capture", async (id: string) => {
    const source = (await sources()).find((s) => s.id === id);
    if (!source || source.thumbnail.isEmpty())
      throw new Error(
        "This window is unavailable. Reselect it and check Screen Recording permission.",
      );
    return { image: source.thumbnail.toDataURL(), name: source.name };
  });
  handle("pin", (value: boolean) => {
    win.setAlwaysOnTop(!!value);
    return !!value;
  });
  handle("stop", () => controller?.abort());
  handle(
    "chat",
    async ({
      id,
      messages,
      image,
    }: {
      id: string;
      messages: Message[];
      image?: string;
    }) => {
      if (controller) throw new Error("A response is already in progress.");
      if (!config.model)
        throw new Error("Choose a model in Connections first.");
      if (
        !Array.isArray(messages) ||
        messages.length > 100 ||
        messages.some(
          (m) =>
            !["user", "assistant"].includes(m.role) ||
            typeof m.content !== "string" ||
            m.content.length > 100000,
        )
      )
        throw new Error("Conversation is too large. Start a new chat.");
      if (
        image &&
        (!image.startsWith("data:image/png;base64,") || image.length > 16000000)
      )
        throw new Error("Invalid screen image.");
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 180000);
      try {
        const response = await request(
          `${endpoint(config.endpoint)}/${config.provider === "ollama" ? "api/chat" : "chat/completions"}`,
          config,
          {
            method: "POST",
            body: JSON.stringify(payload(config, messages, image)),
            signal: controller.signal,
          },
        );
        for await (const text of chunks(response, config.provider)) {
          if (!win.isDestroyed()) win.webContents.send("token", { id, text });
        }
        return { ok: true };
      } catch (error) {
        throw new Error(
          controller.signal.aborted
            ? "Response stopped or timed out."
            : error instanceof Error
              ? error.message
              : "Connection failed",
        );
      } finally {
        clearTimeout(timeout);
        controller = undefined;
      }
    },
  );
  if (process.argv.includes("--dev"))
    await win.loadURL("http://127.0.0.1:5173");
  else await win.loadFile(path.join(__dirname, "../dist/index.html"));
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => controller?.abort());
