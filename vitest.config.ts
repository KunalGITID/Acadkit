import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
    // Tests never talk to a real project. Without these, anything that
    // imports src/lib/supabase.ts needed the real .env.local just to load
    // — a fresh clone failed three files — and was handed a client
    // pointed at production. This address is nothing (the mock server's
    // port, not running during tests).
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
