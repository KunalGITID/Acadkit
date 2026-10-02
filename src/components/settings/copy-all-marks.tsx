import { useCallback } from "react";
import { Bookmark, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { COPY_ALL_MARKS_URL } from "@/lib/portal/copyAllMarks";

/**
 * Installing "Copy all marks". On a computer the link is dragged to the
 * bookmarks bar; on a phone the address is copied into a bookmark by hand.
 * React refuses javascript: hrefs, so the link's is set on the element.
 */
export function CopyAllMarks() {
  const link = useCallback((el: HTMLAnchorElement | null) => {
    el?.setAttribute("href", COPY_ALL_MARKS_URL);
  }, []);

  return (
    <div className="space-y-2 rounded-2xl border bg-surface-2/40 p-3">
      <p className="text-xs font-bold">Every subject's marks in one paste</p>
      <ol className="space-y-1 text-[11px] text-muted">
        <li>1. Add the Copy all marks bookmark (below).</li>
        <li>2. On the portal, open Grade / Mark &amp; Credit → Internal Mark Details.</li>
        <li>3. Tap the bookmark. It opens each subject's View Details for you, then tap Copy for AcadKit.</li>
        <li>4. Come back and paste into Paste a portal page.</li>
      </ol>
      <div className="flex gap-2">
        <a
          ref={link}
          draggable
          onClick={(e) => {
            e.preventDefault();
            toast.message("Drag it to your bookmarks bar", {
              description: "It only works on the portal's marks page, not here.",
            });
          }}
          className="flex h-10 flex-1 cursor-grab items-center justify-center gap-1.5 rounded-xl border border-dashed text-xs font-bold"
          title="Drag me to your bookmarks bar"
        >
          <Bookmark className="h-3.5 w-3.5" /> Copy all marks
        </a>
        <Button
          variant="secondary"
          size="sm"
          className="h-10 flex-1"
          onClick={() => {
            void navigator.clipboard.writeText(COPY_ALL_MARKS_URL).then(
              () =>
                toast.success("Bookmark address copied", {
                  description:
                    "Phone: bookmark any page, edit it, name it AcadKit marks and paste this as its address. On the portal, type AcadKit marks in the address bar and pick the bookmark.",
                  duration: 12000,
                }),
              () => toast.error("Couldn't copy - drag the link to your bookmarks instead")
            );
          }}
        >
          <Copy className="h-3.5 w-3.5" /> For a phone
        </Button>
      </div>
      <p className="text-[11px] text-muted">
        It only reads the portal page you're on and copies the marks. It holds no password or PIN and
        sends nothing anywhere.
      </p>
    </div>
  );
}
