import { Drawer } from "vaul";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/** Swipe-dismissable bottom sheet (centered, capped width on desktop). */
export function Sheet({ open, onOpenChange, title, description, children, className }: SheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-lg flex-col",
            "rounded-t-[28px] border border-b-0 bg-surface outline-none",
            className
          )}
        >
          {/* Wider and slightly stronger than a decorative rule, with
              room around it, so it reads as something you can pull
              rather than a divider that happens to be centred. */}
          <div
            aria-hidden
            className="mx-auto mb-1 mt-3 h-1.5 w-12 shrink-0 rounded-full bg-ink/25 transition-colors"
          />
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
            <Drawer.Title className="text-lg font-bold">{title}</Drawer.Title>
            {description ? (
              <Drawer.Description className="mt-0.5 text-sm text-muted">
                {description}
              </Drawer.Description>
            ) : (
              <Drawer.Description className="sr-only">{title}</Drawer.Description>
            )}
            <div className="mt-4">{children}</div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
