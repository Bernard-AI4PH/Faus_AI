import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("faus", {
  settings: () => ipcRenderer.invoke("settings:get"),
  save: (value: unknown) => ipcRenderer.invoke("settings:save", value),
  models: (value: unknown) => ipcRenderer.invoke("models", value),
  sources: () => ipcRenderer.invoke("sources"),
  capture: (id: string) => ipcRenderer.invoke("capture", id),
  chat: (value: unknown) => ipcRenderer.invoke("chat", value),
  stop: () => ipcRenderer.invoke("stop"),
  pin: (value: boolean) => ipcRenderer.invoke("pin", value),
  permission: () => ipcRenderer.invoke("permission"),
  onToken: (callback: (event: { id: string; text: string }) => void) => {
    const listener = (_: unknown, event: { id: string; text: string }) =>
      callback(event);
    ipcRenderer.on("token", listener);
    return () => ipcRenderer.removeListener("token", listener);
  },
});
