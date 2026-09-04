/**
 * Colour per risk level, shared by the attendance and grades views.
 *
 * Only the colours: the wording lives in VOICE, because a level's colour
 * is fixed while its label changes with the theme's register.
 */
export const RISK_STYLE = {
  safe: { text: "text-good-deep", bg: "bg-good/12" },
  watch: { text: "text-warn-deep", bg: "bg-warn/12" },
  critical: { text: "text-bad-deep", bg: "bg-bad/12" },
} as const;
