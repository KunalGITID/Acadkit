import { lazy, Suspense, useEffect, useState } from "react";
import Landing, { type AuthMode } from "@/pages/Landing";

const loadApp = () => import("@/App");
const App = lazy(loadApp);

let prefetched = false;
/** Fetch the app ahead of the tap, once. Crash reporting needs its Supabase client, so it comes along. */
function prefetch() {
  if (prefetched) return;
  prefetched = true;
  void loadApp();
  void import("@/lib/crashLog").then((m) => m.installGlobalErrorHandlers());
}

/**
 * A signed-out visitor's first load: the landing page and nothing else. The
 * app (Supabase, animation, the query client, every screen) follows once the
 * page is up, so tapping Sign in doesn't wait for it - and so it never
 * delays what the visitor sees first.
 */
export function PublicEntry() {
  const [auth, setAuth] = useState<AuthMode | null>(null);

  useEffect(() => {
    // Not straight away: evaluating ~190 KB of app on a slow phone held up
    // painting the page itself (Lighthouse's LCP went 3.2 s to 4.3 s). A
    // hand heading for a button starts it; failing that, a few seconds after
    // the page has finished loading.
    const intent = () => prefetch();
    for (const e of ["pointerdown", "pointerover", "focusin"]) document.addEventListener(e, intent, { once: true, passive: true });
    let timer = 0;
    const afterLoad = () => (timer = window.setTimeout(prefetch, 4000));
    if (document.readyState === "complete") afterLoad();
    else window.addEventListener("load", afterLoad, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("load", afterLoad);
      for (const e of ["pointerdown", "pointerover", "focusin"]) document.removeEventListener(e, intent);
    };
  }, []);

  if (!auth) return <Landing onAuth={setAuth} />;
  return (
    // Keep showing the page while the app finishes loading, rather than a blank screen.
    <Suspense fallback={<Landing onAuth={() => {}} />}>
      <App initialAuth={auth} />
    </Suspense>
  );
}
