# FAUS_AI Desktop

A React + TypeScript macOS assistant built with Electron. Keep it beside RStudio or another app, select a window, and ask questions using a fresh screenshot as context.

## Run and build

Requires Node.js 22+ and macOS for DMG packaging.

```sh
npm install
npm run dev
npm test
npm run verify
npm run dist
```

The Apple Silicon installer is written to `release/`. Drag FAUS_AI into Applications. This personal development build is unsigned and not notarized; distributing it publicly requires an Apple Developer signing identity and notarization. Intel builds can be made with `npm run build && npx electron-builder --mac dmg --x64`.

## Use

1. Open Connections from the sliders button.
2. For local inference, start Ollama, use `http://127.0.0.1:11434`, and click **Discover models**. This lists models already installed in Ollama; downloading models is managed in Ollama itself. A model name can also be entered manually.
3. For a hosted provider, select **Compatible API**, enter its API base URL (including `/v1` when required), API key, and model. The server must support streaming OpenAI-compatible `/chat/completions`; discovery uses `/models`.
4. Select **Add window** and choose RStudio or another window. Grant macOS Screen Recording permission when prompted. If permission changes, quit and reopen FAUS_AI.
5. Send a question. FAUS_AI captures the selected window at send time. Select a vision-capable model for screenshot questions. Remove the window for text-only chat.
6. Use the model button in the composer to search and switch models from your connected server.
7. Use the pin button to keep FAUS_AI above other windows. Enter sends; Shift+Enter inserts a line break.

## Privacy and limits

- No background screen recording. Window discovery creates local preview thumbnails. Only the selected window's fresh screenshot is attached when you send a message.
- With a local Ollama endpoint, model requests stay on your Mac. Hosted API connections receive conversation text and the selected screenshot. Remote endpoints require HTTPS.
- API keys are encrypted with Electron safeStorage backed by macOS secure storage; credentials are never returned to the renderer after saving. Changing endpoint or provider does not reuse a saved key.
- Chats and screenshots live in memory, are not saved to disk by the app, and are cleared when it exits. New chat clears the conversation. Connection settings persist in Electron's userData folder.
- Screenshots provide visible context only. Hidden application data, off-screen code, and R objects are unavailable. Minimized, protected, or closed windows may not capture correctly. FAUS_AI cannot click, type, run code, or edit files in another app.
- Ollama discovery lists installed models, not a remote model catalog. Vision support depends on the selected model. Native Anthropic/Gemini protocols are not implemented; use an OpenAI-compatible gateway if required.
- In-flight requests can be stopped and time out after three minutes. A conversation supports up to 100 messages; start a new chat for longer sessions.

## Architecture

`src/` contains the React interface. `electron/main.ts` owns screen capture, settings, secure key storage, network requests, and IPC validation. `electron/preload.ts` exposes a narrow context-isolated bridge. `electron/provider.ts` builds provider requests and decodes streams. Renderer pages cannot directly access Node or the filesystem. CSP blocks external content requests, and screenshots are treated as untrusted context in the model instruction.

## References

- [Electron screen capture and macOS permissions](https://www.electronjs.org/docs/latest/api/desktop-capturer/)
- [Ollama API](https://docs.ollama.com/api)

## Verification performed

Production TypeScript/Vite build and five provider tests passed. Electron integration verification uses a temporary localhost mock model server and checks model discovery, saved settings, streaming chat, pinning, and conversation reset. Real Ollama inference and macOS screen capture require a running model and user-granted screen permission and are not covered by that mock test.

Version 0.2 uses a dark navy panel with a blank initial conversation, icon controls, and an inline searchable model selector. Operational dialogs retain labels.
