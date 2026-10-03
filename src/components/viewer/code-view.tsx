import { useEffect, useState } from "react";
import { WrapText } from "lucide-react";
import { cn } from "@/lib/utils";
import { splitHighlighted } from "@/lib/viewer";

/** A source file (C, C++, Python, Java, and a few more) with its syntax coloured in the app's own palette and line numbers down the side. */
export default function CodeView({ blob, language }: { blob: Blob; language: string | null }) {
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wrap, setWrap] = useState(() => window.innerWidth < 640);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // A file's final newline ends its last line; it doesn't start another.
        const text = (await blob.text()).replace(/\r\n?/g, "\n").replace(/\n$/, "");
        let html: string;
        if (language) {
          const hljs = (await import("highlight.js/lib/core")).default;
          const langs: Record<string, () => Promise<{ default: unknown }>> = {
            c: () => import("highlight.js/lib/languages/c"),
            cpp: () => import("highlight.js/lib/languages/cpp"),
            python: () => import("highlight.js/lib/languages/python"),
            java: () => import("highlight.js/lib/languages/java"),
            javascript: () => import("highlight.js/lib/languages/javascript"),
            typescript: () => import("highlight.js/lib/languages/typescript"),
            sql: () => import("highlight.js/lib/languages/sql"),
            bash: () => import("highlight.js/lib/languages/bash"),
            xml: () => import("highlight.js/lib/languages/xml"),
            css: () => import("highlight.js/lib/languages/css"),
            json: () => import("highlight.js/lib/languages/json"),
          };
          if (!hljs.getLanguage(language) && langs[language])
            hljs.registerLanguage(language, (await langs[language]()).default as Parameters<typeof hljs.registerLanguage>[1]);
          html = hljs.getLanguage(language) ? hljs.highlight(text, { language, ignoreIllegals: true }).value : escape(text);
        } else html = escape(text);
        if (!cancelled) setLines(splitHighlighted(html));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob, language]);

  if (error) return <p className="px-4 py-10 text-center text-sm font-medium text-muted">Couldn't read this file: {error}</p>;
  if (!lines) return <p className="py-16 text-center text-sm font-medium text-muted">Opening…</p>;
  return (
    <div className="w-full pb-16">
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setWrap((w) => !w)}
          aria-pressed={wrap}
          className={cn(
            "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold",
            wrap ? "bg-accent/15 text-accent-deep" : "bg-surface-2 text-muted"
          )}
        >
          <WrapText className="h-3.5 w-3.5" /> Wrap
        </button>
      </div>
      <div className={cn("code-view card overflow-x-auto p-0 font-mono text-[13px] leading-relaxed", wrap && "code-wrap")}>
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td data-find-skip className="sticky left-0 select-none bg-surface px-3 text-right align-top text-muted/60 tabular">{i + 1}</td>
                <td className={cn("pr-4 align-top", wrap ? "whitespace-pre-wrap wrap-break-word" : "whitespace-pre")}>
                  <span dangerouslySetInnerHTML={{ __html: l || " " }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
