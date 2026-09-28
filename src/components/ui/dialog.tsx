import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** In-app replacements for window.confirm and window.prompt. */

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  /** Red button, for anything that destroys data. */
  destructive?: boolean;
}

interface PromptOptions {
  title: string;
  body?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}

interface DialogApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  promptText: (options: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

type Pending =
  | ({ kind: "confirm" } & ConfirmOptions)
  | ({ kind: "prompt" } & PromptOptions);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");
  const resolver = useRef<((result: unknown) => void) | null>(null);

  const settle = useCallback((result: unknown) => {
    resolver.current?.(result);
    resolver.current = null;
    setPending(null);
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          resolver.current = resolve as (r: unknown) => void;
          setPending({ kind: "confirm", ...options });
        }),
      promptText: (options) =>
        new Promise<string | null>((resolve) => {
          resolver.current = resolve as (r: unknown) => void;
          setValue(options.defaultValue ?? "");
          setPending({ kind: "prompt", ...options });
        }),
    }),
    []
  );

  const isPrompt = pending?.kind === "prompt";

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Sheet
        open={pending !== null}
        // Dismissing by swipe or backdrop is a cancel, not a silent
        // drop - the awaiting caller has to be told either way.
        onOpenChange={(open) => {
          if (!open && pending) settle(isPrompt ? null : false);
        }}
        title={pending?.title ?? ""}
        description={pending?.body}
      >
        <div className="space-y-4">
          {isPrompt && (
            <Input
              autoFocus
              value={value}
              placeholder={pending.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") settle(value);
              }}
            />
          )}

          <div className="flex gap-2.5">
            <Button
              variant="secondary"
              size="lg"
              className="h-12 flex-1"
              onClick={() => settle(isPrompt ? null : false)}
            >
              Cancel
            </Button>
            <Button
              variant={
                pending?.kind === "confirm" && pending.destructive ? "danger" : "primary"
              }
              size="lg"
              className="h-12 flex-1"
              onClick={() => settle(isPrompt ? value : true)}
            >
              {pending?.confirmLabel ?? (isPrompt ? "Save" : "Confirm")}
            </Button>
          </div>
        </div>
      </Sheet>
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error("useDialog must be used inside DialogProvider");
  return api;
}
