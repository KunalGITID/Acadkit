import { Download, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "pwa_banner_dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isAlreadyInstalled(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator &&
      (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua);
  return isIos && isSafari;
}

export function PwaBanner() {
  const [show, setShow] = useState(false);
  const [type, setType] = useState<"ios" | "android" | null>(null);
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isAlreadyInstalled()) return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as BeforeInstallPromptEvent;
      setType("android");
      setTimeout(() => setShow(true), 3000);
    };

    window.addEventListener("beforeinstallprompt", handler);

    if (isIosSafari()) {
      setTimeout(() => {
        setType("ios");
        setShow(true);
      }, 3000);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setShow(false);
  };

  const install = async () => {
    if (!promptRef.current) return;
    await promptRef.current.prompt();
    const { outcome } = await promptRef.current.userChoice;
    if (outcome === "accepted") dismiss();
  };

  if (!show || !type) return null;

  return (
    <div
      className="fixed bottom-[68px] left-3 right-3 z-[150] rounded-xl border border-[#7c6af7]/40 bg-[#111118] p-4 shadow-2xl"
      style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        aria-label="Dismiss install banner"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="font-syne font-semibold text-foreground">Install AcadKit</p>
      {type === "ios" ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Tap{" "}
          <span className="inline-flex items-center gap-0.5 rounded bg-[#1e1e2e] px-1.5 py-0.5 font-mono text-[10px] text-[#c4b5fd]">
            📤 Share
          </span>{" "}
          then <strong className="text-foreground">'Add to Home Screen'</strong>
        </p>
      ) : (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Add to your home screen for the best experience.
          </p>
          <button
            type="button"
            onClick={install}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#7c6af7] px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Download className="h-3.5 w-3.5" />
            Install
          </button>
        </div>
      )}
    </div>
  );
}
