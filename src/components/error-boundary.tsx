import { Component, type ReactNode } from "react";
import { buildReport, fileReport } from "@/lib/crashLog";
import { isStaleChunkError, recoverFromStaleChunk } from "@/lib/staleChunk";

interface Props {
  children: ReactNode;
}
interface State {
  /** React's component stack, kept so the screen can show it. */
  componentStack?: string;
  error: Error | null;
}

/**
 * Catches render crashes so a single broken screen never blanks the
 * whole app. Best-effort logs the error to Supabase (`error_log`); if
 * that table doesn't exist the insert just fails silently.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: "" };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // A chunk that 404s after a deploy is not a crash, it is a stale
    // document. Reload rather than blaming the screen. See staleChunk.ts.
    if (isStaleChunkError(error) && recoverFromStaleChunk()) return;
    this.setState({ componentStack: info.componentStack ?? "" });
    void fileReport(buildReport(error, info.componentStack));
  }

  /** Everything worth pasting into a bug report, as one string. */
  private details(): string {
    const { error, componentStack } = this.state;
    return [
      `${error?.name ?? "Error"}: ${error?.message ?? "unknown"}`,
      location.pathname,
      error?.stack ?? "",
      componentStack ?? "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 4000);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-bad/15 text-3xl">
          😵
        </div>
        <div>
          <h1 className="text-xl font-extrabold">Something broke on this screen</h1>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted">
            Your data is safe in the cloud. Reload to pick up where you left off.
          </p>
        </div>

        {/* Show the error.
         
            This screen used to say only that something broke, which
            left the crash readable in exactly one place: an error_log
            table that RLS makes write-only, so not even the person
            looking at the screen could see what happened. Every report
            then arrived as "the app is broken" and every fix started
            with guesswork. The message is usually the whole answer, and
            it costs a line to show it. */}
        <details className="w-full max-w-sm text-left">
          <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-widest text-muted">
            What went wrong
          </summary>
          <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-surface-2 p-3 text-left text-[11px] leading-relaxed text-muted">
            {this.details()}
          </pre>
          <button
            onClick={() => void navigator.clipboard?.writeText(this.details())}
            className="mt-2 h-9 rounded-xl border bg-surface px-3 text-xs font-semibold"
          >
            Copy details
          </button>
        </details>
        <div className="flex gap-2.5">
          <button
            onClick={() => this.setState({ error: null, componentStack: "" })}
            className="h-11 rounded-2xl border bg-surface px-5 text-sm font-semibold hover:bg-surface-2"
          >
            Try again
          </button>
          <button
            onClick={() => location.reload()}
            className="h-11 rounded-2xl bg-accent px-5 text-sm font-semibold text-white"
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
