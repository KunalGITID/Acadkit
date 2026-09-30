import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { extOf } from "@/lib/studyFiles";
import { columnName, parseDelimited, trimSheet } from "@/lib/viewer";

type Cell = string | number | boolean | Date | null | undefined | "";
interface Sheet {
  name: string;
  rows: Cell[][];
}

/** Past this, a sheet shows its first rows and says how many it left out. */
const MAX_ROWS = 2000;
const MAX_COLS = 80;

/** An Excel workbook or a CSV as a grid, with the row numbers and column letters you'd use to talk about it ("C12"), and a tab per sheet. */
export default function SheetView({ blob, path }: { blob: Blob; path: string }) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ext = extOf(path);
        let out: Sheet[];
        if (ext === "csv" || ext === "tsv") {
          out = [{ name: "", rows: trimSheet(parseDelimited(await blob.text(), ext === "tsv" ? "\t" : ",")) }];
        } else {
          const readExcelFile = (await import("read-excel-file/browser")).default;
          const book = await readExcelFile(blob);
          out = book.map((s) => ({ name: s.sheet, rows: trimSheet(s.data as Cell[][]) }));
        }
        if (!cancelled) setSheets(out);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob, path]);

  const sheet = sheets?.[active];
  const shown = useMemo(() => sheet?.rows.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS)) ?? [], [sheet]);
  const cols = shown.reduce((m, r) => Math.max(m, r.length), 0);

  if (error) return <p className="px-4 py-10 text-center text-sm font-medium text-muted">Couldn't read this spreadsheet: {error}</p>;
  if (!sheets) return <p className="py-16 text-center text-sm font-medium text-muted">Opening…</p>;
  return (
    <div className="w-full">
      {sheets.length > 1 && (
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          {sheets.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold",
                i === active ? "bg-accent/15 text-accent-deep" : "bg-surface-2 text-muted"
              )}
            >
              {s.name || `Sheet ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="card px-4 py-10 text-center text-sm font-medium text-muted">This sheet is empty.</p>
      ) : (
        <div className="sheet-view card w-fit max-w-full overflow-x-auto p-0">
          <table className="border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="sheet-corner" />
                {Array.from({ length: cols }, (_, j) => (
                  <th key={j} data-find-skip className="sheet-head">
                    {columnName(j)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i}>
                  <th data-find-skip className="sheet-head sheet-rownum">{i + 1}</th>
                  {Array.from({ length: cols }, (_, j) => {
                    const v = r[j];
                    return (
                      <td key={j} className={cn("sheet-cell", typeof v === "number" && "text-right tabular")}>
                        {show(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sheet && (sheet.rows.length > MAX_ROWS || sheet.rows.some((r) => r.length > MAX_COLS)) && (
        <p className="mt-2 text-center text-xs font-medium text-muted">
          Showing the first {Math.min(sheet.rows.length, MAX_ROWS)} rows and {MAX_COLS} columns. Download it for the rest.
        </p>
      )}
    </div>
  );
}

function show(v: Cell): string {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) return v.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(+v.toPrecision(10));
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return v;
}
