import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import { installGlobalErrorHandlers } from "@/lib/crashLog";
import "@/index.css";

// Before render: a crash while the tree is first mounting is still a
// crash worth hearing about, and the error boundary can't see it.
installGlobalErrorHandlers();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
