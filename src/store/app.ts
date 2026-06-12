import { create } from "zustand";
import { getStoredPin, storePin, clearPin } from "@/lib/pin";

export type ThemePref = "light" | "dark" | "system";

const THEME_KEY = "acadkit:theme";
const NAME_KEY = "acadkit:name";

function applyTheme(pref: ThemePref) {
  const dark =
    pref === "dark" ||
    (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

interface AppState {
  pin: string | null;
  theme: ThemePref;
  /** Local copy of the display name (settings.name wins when present). */
  name: string;
  setPin: (pin: string) => void;
  resetPin: () => void;
  setTheme: (theme: ThemePref) => void;
  setName: (name: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  pin: getStoredPin(),
  theme: (localStorage.getItem(THEME_KEY) as ThemePref) || "system",
  name: localStorage.getItem(NAME_KEY) ?? "",
  setPin: (pin) => {
    storePin(pin);
    set({ pin });
  },
  resetPin: () => {
    clearPin();
    set({ pin: null });
  },
  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
  setName: (name) => {
    localStorage.setItem(NAME_KEY, name);
    set({ name });
  },
}));

// React to OS theme changes while in "system" mode
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => applyTheme(useAppStore.getState().theme));
