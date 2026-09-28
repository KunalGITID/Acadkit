import { useLocation, type Location } from "react-router-dom";

/** The router state a link to the file viewer carries: the page it was opened from, as `background`. */
export function useViewerLinkState(): { background: Location } {
  const location = useLocation();
  const background = (location.state as { background?: Location } | null)?.background;
  return { background: background ?? location };
}
