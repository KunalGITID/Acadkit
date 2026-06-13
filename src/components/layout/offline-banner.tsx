import { AnimatePresence, motion } from "framer-motion";
import { CloudOff } from "lucide-react";
import { useOnline } from "@/hooks/useOnline";

/** Thin bar shown while offline; edits keep working and sync on reconnect. */
export function OfflineBanner() {
  const online = useOnline();
  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden bg-warn/15 text-warn-deep"
        >
          <p className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-bold">
            <CloudOff className="h-3.5 w-3.5" />
            Offline — your changes are saved and will sync when you're back
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
