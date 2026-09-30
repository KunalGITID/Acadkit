import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { savedSession } from "@/lib/savedSession";
import { PublicEntry } from "@/public";
// Fonts ship with the app (Latin only, the weights in use) rather than from Google Fonts: a render-blocking stylesheet from another origin was a network round trip on every cold start, and on a weak signal the first paint waited for it.
import "@fontsource/plus-jakarta-sans/latin-400.css";
import "@fontsource/plus-jakarta-sans/latin-500.css";
import "@fontsource/plus-jakarta-sans/latin-600.css";
import "@fontsource/plus-jakarta-sans/latin-700.css";
import "@fontsource/plus-jakarta-sans/latin-800.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/chakra-petch/latin-600.css";
import "@fontsource/chakra-petch/latin-700.css";
import "@/index.css";

const root = createRoot(document.getElementById("root")!);

if (savedSession()) {
  // Signed in on this device: the whole app, as before.
  void Promise.all([import("@/App"), import("@/lib/crashLog")]).then(([{ default: App }, crashLog]) => {
    // Before render: a crash while the tree is first mounting is still a
    // crash worth hearing about, and the error boundary can't see it.
    crashLog.installGlobalErrorHandlers();
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });
} else {
  // A visitor: just the landing page first (src/public.tsx).
  root.render(
    <StrictMode>
      <PublicEntry />
    </StrictMode>
  );
}
