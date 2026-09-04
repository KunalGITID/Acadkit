import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, Copy, ExternalLink, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PENDING_MIGRATIONS_SQL, missingMigrations, sqlEditorUrl } from "@/api/queries";

export function SetupCard() {
  const qc = useQueryClient();
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const { data: missing } = useQuery({
    queryKey: ["migrations"],
    queryFn: missingMigrations,
    staleTime: Infinity,
  });

  if (!missing || missing.length === 0) return null;

  async function recheck() {
    setChecking(true);
    const still = await qc.fetchQuery({ queryKey: ["migrations"], queryFn: missingMigrations });
    setChecking(false);
    if (still.length === 0) {
      toast.success("All set — every feature is enabled! 🎉");
      // Pick up the now-saveable fields everywhere
      void qc.invalidateQueries();
    } else {
      toast.error("Not yet — paste the SQL and hit Run, then re-check.");
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card space-y-3 border-accent/30 bg-gradient-to-br from-[hsl(var(--accent)/0.08)] to-transparent p-5"
    >
      <div>
        <p className="flex items-center gap-2 font-bold">
          <Sparkles className="h-4 w-4 text-accent" /> Finish setup — 30 seconds, one paste
        </p>
        <p className="mt-1 text-xs text-muted">
          One SQL snippet unlocks: {missing.join(" · ")}. Copy it, open your project's SQL
          editor, paste, press <span className="font-bold">Run</span>, then re-check here.
        </p>
      </div>

      <pre className="overflow-x-auto rounded-2xl border bg-surface-2/60 p-3 font-mono text-[10.5px] leading-relaxed text-muted scrollbar-none">
        {PENDING_MIGRATIONS_SQL}
      </pre>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button
          variant="primary"
          size="sm"
          className="h-10"
          onClick={() => {
            void navigator.clipboard.writeText(PENDING_MIGRATIONS_SQL);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
            toast.success("SQL copied — paste it in the editor");
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          Copy SQL
        </Button>
        <a
          href={sqlEditorUrl()}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-surface-2 px-3.5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-2/70"
        >
          <ExternalLink className="h-4 w-4" /> Open SQL editor
        </a>
        <Button variant="outline" size="sm" className="h-10" onClick={recheck} disabled={checking}>
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          I ran it — re-check
        </Button>
      </div>
    </motion.section>
  );
}