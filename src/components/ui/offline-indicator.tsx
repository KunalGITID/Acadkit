import { useEffect, useState } from "react";

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);
  const [showOnline, setShowOnline] = useState(false);

  useEffect(() => {
    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
      setShowOnline(false);
    };
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        setShowOnline(true);
        setTimeout(() => setShowOnline(false), 2000);
      }
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [wasOffline]);

  if (isOnline && !showOnline) return null;

  return (
    <div
      className={`fixed left-0 right-0 top-0 z-[200] flex h-7 items-center justify-center text-xs font-medium transition-all duration-300 ${
        isOnline
          ? "bg-[#1e1e2e] text-[#4ade80]"
          : "bg-[#1e1e2e] text-[#facc15]"
      }`}
    >
      {isOnline ? (
        <span>● Back online</span>
      ) : (
        <span>● Offline — changes will sync when reconnected</span>
      )}
    </div>
  );
}
