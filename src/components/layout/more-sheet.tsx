import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { MORE_NAV } from "@/components/layout/nav-items";
import { haptic } from "@/lib/utils";

/**
 * The overflow destinations, as a sheet.
 *
 * An iOS tab bar tops out at five items, and a PWA has no browser chrome
 * to fall back on — so anything not in the bar has to live somewhere
 * reachable with a thumb. A sheet is the platform-native answer, and it
 * keeps the bar itself at five.
 */
export function MoreSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="More">
      <nav className="space-y-1.5 pb-2">
        {MORE_NAV.map((item) => (
          <button
            key={item.to}
            type="button"
            onClick={() => {
              haptic();
              onOpenChange(false);
              navigate(item.to);
            }}
            className="flex w-full items-center gap-3.5 rounded-2xl border bg-surface-2/40 px-4 py-3.5 text-left transition-transform active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <item.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{item.label}</span>
              {item.blurb && (
                <span className="block truncate text-xs text-muted">{item.blurb}</span>
              )}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
          </button>
        ))}
      </nav>
    </Sheet>
  );
}
