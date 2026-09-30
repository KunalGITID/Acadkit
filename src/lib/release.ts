/**
 * This build's release tag, "2.0.0+d6b27fa": the package version and the
 * commit it was built from (see vite.config.ts). Unit tests don't go through
 * Vite's define, so there it is "test".
 */
export const RELEASE: string = typeof __APP_RELEASE__ === "string" ? __APP_RELEASE__ : "test";

/** Just the version, "2.0.0". */
export const VERSION = RELEASE.split("+")[0];

/** Just the commit, "d6b27fa" - empty when there isn't one. */
export const COMMIT = RELEASE.split("+")[1] ?? "";
