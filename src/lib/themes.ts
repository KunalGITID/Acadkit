/** Theme identity, kept free of side effects. */

export type ThemeName = "brutalist" | "oled";

/** Themes that actually exist in the stylesheet. */
export const THEME_NAMES: ThemeName[] = ["brutalist", "oled"];

export const DEFAULT_THEME: ThemeName = "brutalist";

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && (THEME_NAMES as string[]).includes(value);
}

/** Coerce whatever was stored into a theme that exists. */
export function resolveTheme(stored: unknown): ThemeName {
  return isThemeName(stored) ? stored : DEFAULT_THEME;
}
