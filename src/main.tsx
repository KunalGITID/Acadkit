import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import { installGlobalErrorHandlers } from "@/lib/crashLog";
// Fonts ship with the app (Latin only, the weights in use) rather than
// from Google Fonts: a render-blocking stylesheet from another origin was
// a network round trip on every cold start, and on a weak signal the
// first paint waited for it. Bundled, they're precached with the rest.
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

// Before render: a crash while the tree is first mounting is still a
// crash worth hearing about, and the error boundary can't see it.
installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
