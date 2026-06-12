import { create } from "zustand";
import { getStoredPin, storePin, clearPin } from "@/lib/pin";

export type ThemePref = "light" | "dark" | "system";

const THEME_KEY = "acadkit:theme";

function applyTheme(pref: ThemePref) {
  const dark =
    pref === "dark" ||
    (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

interface AppState {
  pin: string | null;
  theme: ThemePref;
  setPin: (pin: string) => void;
  resetPin: () => void;
  setTheme: (theme: ThemePref) => void;
}

export const useAppStore = create<AppState>((set) => ({
  pin: getStoredPin(),
  theme: (localStorage.getItem(THEME_KEY) as ThemePref) || "system",
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
}));

// React to OS theme changes while in "system" mode
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => applyTheme(useAppStore.getState().theme));
