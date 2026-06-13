import { Component, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { getStoredPin } from "@/lib/pin";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches render crashes so a single broken screen never blanks the
 * whole app. Best-effort logs the error to Supabase (`error_log`); if
 * that table doesn't exist the insert just fails silently.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    void supabase
      .from("error_log")
      .insert({
        device_id: getStoredPin(),
        message: error.message,
        stack: (error.stack ?? "").slice(0, 4000),
        component_stack: (info.componentStack ?? "").slice(0, 4000),
        url: location.pathname,
        user_agent: navigator.userAgent,
      })
      .then(undefined, () => {});
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
        <div className="flex gap-2.5">
          <button
            onClick={() => this.setState({ error: null })}
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
