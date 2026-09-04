import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, isThemeName, resolveTheme, THEME_NAMES } from "@/lib/themes";

/**
 * A stored theme name that no longer exists lands on [data-theme] and
 * matches no CSS rule, so the app paints with no tokens at all — no
 * background, no accent, nothing. Retiring a theme has to account for
 * everyone still carrying it in localStorage.
 */
describe("isThemeName", () => {
  it("accepts every theme that exists", () => {
    for (const name of THEME_NAMES) expect(isThemeName(name)).toBe(true);
  });

  it("rejects the retired themes", () => {
    for (const gone of ["sakura", "terminal", "aurora", "acid"]) {
      expect(isThemeName(gone), gone).toBe(false);
    }
  });

  it("rejects junk without throwing", () => {
    for (const junk of [null, undefined, "", 0, {}, []]) {
      expect(isThemeName(junk)).toBe(false);
    }
  });

  it("has a default that is itself valid", () => {
    expect(isThemeName(DEFAULT_THEME)).toBe(true);
  });
});

describe("resolveTheme", () => {
  it("passes a live theme through untouched", () => {
    expect(resolveTheme("oled")).toBe("oled");
  });

  it("migrates anyone still carrying a retired theme", () => {
    for (const gone of ["sakura", "terminal", "aurora", "acid", null]) {
      expect(resolveTheme(gone), String(gone)).toBe(DEFAULT_THEME);
    }
  });
});
