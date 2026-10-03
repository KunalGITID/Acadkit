import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "test-results", "playwright-report", "blob-report", ".lighthouseci", "lighthouse-report"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // eslint-plugin-react-hooks 7 adds the React Compiler rules to its
      // recommended set. The two classic rules keep the severities they've
      // always had here; the compiler rules are warnings for now - they
      // flagged ~46 existing patterns (setState in effects, refs read in
      // render) that deserve their own careful pass, not a dependency bump.
      ...Object.fromEntries(
        Object.entries(reactHooks.configs.recommended.rules).map(([rule, level]) => [
          rule,
          rule === "react-hooks/rules-of-hooks" || rule === "react-hooks/exhaustive-deps" ? level : "warn",
        ])
      ),
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  }
);
