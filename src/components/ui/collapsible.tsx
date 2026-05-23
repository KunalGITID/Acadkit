import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

interface CollapsibleProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Collapsible({
  open,
  onOpenChange,
  trigger,
  children,
  className,
}: CollapsibleProps) {
  return (
    <div className={className}>
      <button
        type="button"
        className="w-full text-left"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">{trigger}</div>
          <ChevronDown
            className={cn(
              "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300",
              open && "rotate-180"
            )}
          />
        </div>
      </button>
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
