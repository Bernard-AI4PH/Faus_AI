export type Settings = {
  provider: "ollama" | "api";
  endpoint: string;
  model: string;
  apiKey?: string;
  hasKey?: boolean;
};
export type Source = { id: string; name: string; thumbnail: string };
export type Message = {
  role: "user" | "assistant";
  content: string;
  id: string;
  context?: string;
};
declare global {
  interface Window {
    faus: {
      settings: () => Promise<Settings>;
      save: (s: Settings) => Promise<boolean>;
      models: (s: Settings) => Promise<string[]>;
      sources: () => Promise<{ permission: string; items: Source[] }>;
      capture: (id: string) => Promise<{ image: string; name: string }>;
      chat: (s: {
        id: string;
        messages: Message[];
        image?: string;
      }) => Promise<unknown>;
      stop: () => Promise<void>;
      pin: (s: boolean) => Promise<boolean>;
      permission: () => Promise<void>;
      onToken: (cb: (s: { id: string; text: string }) => void) => () => void;
    };
  }
}
