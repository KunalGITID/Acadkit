import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** Start a new page at the top. */
export function useScrollReset() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    if (navigationType === "POP") return;
    // Instant, not smooth: a scroll animation running underneath the page
    // transition reads as the page fighting itself.
    window.scrollTo(0, 0);
  }, [pathname, navigationType]);
}
