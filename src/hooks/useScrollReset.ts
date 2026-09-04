import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Start a new page at the top.
 *
 * A single-page app keeps the window's scroll position across a route
 * change, because nothing navigated as far as the browser is concerned.
 * So scrolling to the bottom of Attendance and tapping Marks landed you
 * partway down Marks — and since pages differ in height, often at a
 * clamped offset corresponding to nothing at all.
 *
 * Back and forward are left alone. Restoring them properly is a job this
 * app can't currently do: pages are lazily loaded and cross-faded, so the
 * document is still a skeleton when `popstate` fires and any scroll past
 * its current height is clamped away — and re-applying the offset as the
 * document grows fights the transition rather than waiting for it. Both
 * were tried and neither held. Landing at the top on Back is at least
 * predictable, and it is what the app did before this hook existed.
 */
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
