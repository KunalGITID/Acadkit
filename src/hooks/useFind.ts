import { useCallback, useEffect, useState } from "react";
import { stepMatch } from "@/lib/textSearch";
import type { Finder } from "@/components/viewer/find";

/** Find state for the open file: what's typed, how many matches, which one is shown. */
export function useFind(finder: Finder | null) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(-1);
  const [marks, setMarks] = useState<number[]>([]);
  const [searching, setSearching] = useState(false);

  // Search as you type, a beat after the last key.
  useEffect(() => {
    if (!finder) return;
    let live = true;
    const t = setTimeout(async () => {
      if (query.trim().length < 2) {
        finder.clear();
        setTotal(0);
        setCurrent(-1);
        setMarks([]);
        return;
      }
      setSearching(true);
      const n = await finder.search(query);
      if (!live) return;
      setSearching(false);
      setTotal(n);
      setCurrent(n ? 0 : -1);
      if (n) finder.show(0);
      setMarks(finder.marks());
    }, 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [finder, query]);

  const go = useCallback(
    (to: number) => {
      if (!finder || to < 0) return;
      setCurrent(to);
      finder.show(to);
    },
    [finder]
  );
  const step = useCallback((dir: 1 | -1) => go(stepMatch(current, total, dir)), [go, current, total]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    finder?.clear();
  }, [finder]);

  // ⌘F / Ctrl+F on a Mac opens this rather than the browser's own find,
  // which can't see into a PDF's canvas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return { open, setOpen, query, setQuery, total, current, marks, searching, step, go, close };
}

export type FindState = ReturnType<typeof useFind>;
