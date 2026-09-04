/**
 * Theme identity, kept free of side effects.
 *
 * This lives outside the store on purpose: the store reads localStorage
 * at module load, and these helpers are needed by the pre-paint path and
 * by tests that shouldn't have to stand up a DOM to ask whether a string
 * is a theme.
 */

export type ThemeName = "brutalist" | "oled";

/**
 * Themes that actually exist in the stylesheet. Anything else in
 * localStorage — a retired theme like "sakura", or a name from a newer
 * build — must fall back, or [data-theme] matches no rule and the app
 * renders with no tokens at all.
 */
export const THEME_NAMES: ThemeName[] = ["brutalist", "oled"];

export const DEFAULT_THEME: ThemeName = "brutalist";

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && (THEME_NAMES as string[]).includes(value);
}

/** Coerce whatever was stored into a theme that exists. */
export function resolveTheme(stored: unknown): ThemeName {
  return isThemeName(stored) ? stored : DEFAULT_THEME;
}
