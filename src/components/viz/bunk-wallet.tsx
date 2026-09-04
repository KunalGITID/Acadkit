import { motion } from "framer-motion";
import { Dot } from "@/components/ui/misc";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { buildWallet, pipsFor } from "@/lib/bunkWallet";
import type { SubjectAttendance } from "@/lib/attendance";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import { cn } from "@/lib/utils";

/**
 * Skips as a balance you spend, not a statistic you read.
 *
 * The number was already there — `canBunk`, inside an expanded row. What
 * it lacked was a shape. Pips make the balance countable at a glance and,
 * more usefully, make spending one *visible*: mark an absence and a pip
 * goes out. That is the whole idea. A subject below 75% isn't shown with
 * zero pips, because "no skips left" and "you owe eleven classes" are
 * different situations and drawing them the same way flattens the one
 * that matters.
 */
export function BunkWallet({ stats }: { stats: SubjectAttendance[] }) {
  const tone = useTone();
  const wallet = buildWallet(stats);

  if (wallet.empty) {
    return (
      <section className="card p-5">
        <Header tone={tone} />
        <p className="mt-2 text-sm font-medium text-muted">{say(VOICE.walletEmpty, tone)}</p>
      </section>
    );
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-end justify-between gap-4 border-b px-5 py-4">
        <div>
          <Header tone={tone} />
          {wallet.left === 0 ? (
            <p className="mt-1 text-lg font-extrabold">{say(VOICE.walletBroke, tone)}</p>
          ) : (
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="text-3xl font-extrabold tabular">
                <AnimatedNumber value={wallet.left} />
              </span>
              <span className="text-sm font-semibold text-muted">
                {say(VOICE.walletUnit, tone, wallet.left)}
              </span>
            </p>
          )}
        </div>
        <p className="pb-1 text-xs font-semibold text-muted">
          {say(VOICE.walletSpent, tone, wallet.spent)}
        </p>
      </div>

      {wallet.credit.length > 0 && (
        <ul className="divide-y">
          {wallet.credit.map(({ subject, left }) => {
            const { pips, overflow } = pipsFor(left);
            return (
              <li key={subject.subject.id} className="flex items-center gap-3 px-5 py-3">
                <Dot color={subject.subject.color_hex} className="shrink-0" />
                <span className="line-clamp-1 min-w-0 flex-1 text-sm font-bold">
                  {subject.subject.name}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {Array.from({ length: pips }, (_, i) => (
                    <motion.span
                      key={i}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: i * 0.03, type: "spring", stiffness: 400, damping: 22 }}
                      className="h-2 w-2 rounded-full"
                      style={{ background: subject.subject.color_hex }}
                    />
                  ))}
                  {overflow > 0 && (
                    <span className="ml-0.5 text-xs font-bold tabular text-muted">+{overflow}</span>
                  )}
                  {left === 0 && (
                    <span className="text-xs font-bold text-muted">none</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {wallet.debt.length > 0 && (
        <div className="border-t bg-bad/[0.06]">
          <p className="px-5 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.18em] text-bad-deep">
            {say(VOICE.walletDebt, tone)}
          </p>
          <ul className="divide-y divide-bad/10">
            {wallet.debt.map(({ subject, owed }) => (
              <li key={subject.subject.id} className="flex items-center gap-3 px-5 py-3">
                <Dot color={subject.subject.color_hex} className="shrink-0" />
                <span className="line-clamp-1 min-w-0 flex-1 text-sm font-bold">
                  {subject.subject.name}
                </span>
                <span className="shrink-0 text-xs font-bold text-bad-deep">
                  {say(VOICE.walletOwed, tone, owed)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Header({ tone }: { tone: ReturnType<typeof useTone> }) {
  return (
    <p
      className={cn(
        "text-[11px] font-bold uppercase tracking-[0.18em] text-muted"
      )}
    >
      {say(VOICE.walletTitle, tone)}
    </p>
  );
}
