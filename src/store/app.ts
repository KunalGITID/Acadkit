import { create } from "zustand";
import { getStoredPin, storePin, clearPin } from "@/lib/pin";

export type ThemeName = "acid" | "oled";
export type ColorMode = "light" | "dark" | "system";

const THEME_KEY = "acadkit:theme-name";
const MODE_KEY = "acadkit:theme-mode";
const LEGACY_MODE_KEY = "acadkit:theme"; // pre-multi-theme key, mode-only
const NAME_KEY = "acadkit:name";

function resolveDark(mode: ColorMode): boolean {
  return mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

// Mirrors each theme's --bg in src/index.css — keep in sync.
const BG_HEX: Record<string, string> = {
  "acid-light": "#f7f7f7",
  "acid-dark": "#0a0a0a",
  "oled-light": "#ffffff",
  "oled-dark": "#000000",
};

function applyTheme(themeName: ThemeName, mode: ColorMode) {
  const dark = resolveDark(mode);
  document.documentElement.dataset.theme = themeName;
  document.documentElement.classList.toggle("dark", dark);
  document
    .getElementById("theme-color-meta")
    ?.setAttribute("content", BG_HEX[`${themeName}-${dark ? "dark" : "light"}`]);
}

interface AppState {
  pin: string | null;
  themeName: ThemeName;
  themeMode: ColorMode;
  /** Local copy of the display name (settings.name wins when present). */
  name: string;
  setPin: (pin: string) => void;
  resetPin: () => void;
  setThemeName: (theme: ThemeName) => void;
  setThemeMode: (mode: ColorMode) => void;
  setName: (name: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  pin: getStoredPin(),
  themeName: (localStorage.getItem(THEME_KEY) as ThemeName) || "acid",
  themeMode:
    (localStorage.getItem(MODE_KEY) as ColorMode) ||
    (localStorage.getItem(LEGACY_MODE_KEY) as ColorMode) ||
    "system",
  name: localStorage.getItem(NAME_KEY) ?? "",
  setPin: (pin) => {
    storePin(pin);
    set({ pin });
  },
  resetPin: () => {
    clearPin();
    set({ pin: null });
  },
  setThemeName: (themeName) => {
    localStorage.setItem(THEME_KEY, themeName);
    applyTheme(themeName, useAppStore.getState().themeMode);
    set({ themeName });
  },
  setThemeMode: (themeMode) => {
    localStorage.setItem(MODE_KEY, themeMode);
    applyTheme(useAppStore.getState().themeName, themeMode);
    set({ themeMode });
  },
  setName: (name) => {
    localStorage.setItem(NAME_KEY, name);
    set({ name });
  },
}));

// React to OS theme changes while in "system" mode
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const { themeName, themeMode } = useAppStore.getState();
  if (themeMode === "system") applyTheme(themeName, themeMode);
});
