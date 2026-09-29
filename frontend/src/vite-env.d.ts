/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin, e.g. https://api.example.com. Defaults to same origin (Vite proxy in dev). */
  readonly VITE_API_URL?: string;
}
