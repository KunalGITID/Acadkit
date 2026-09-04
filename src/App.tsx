import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { ErrorBoundary } from "@/components/error-boundary";
import { DialogProvider } from "@/components/ui/dialog";
import { UpdatePrompt } from "@/components/update-prompt";
import Onboarding from "@/pages/Onboarding";
import SignIn from "@/pages/SignIn";
import { useSession } from "@/hooks/useSession";
import { useAutoDevice } from "@/hooks/useAutoDevice";
import { RQ_CACHE_KEY, useAuthReset } from "@/hooks/useAuthReset";
import { useAppStore } from "@/store/app";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Attendance = lazy(() => import("@/pages/Attendance"));
const Marks = lazy(() => import("@/pages/Marks"));
const Timetable = lazy(() => import("@/pages/Timetable"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const Settings = lazy(() => import("@/pages/Settings"));
const AbsentLog = lazy(() => import("@/pages/AbsentLog"));
const Insights = lazy(() => import("@/pages/Insights"));
const History = lazy(() => import("@/pages/History"));
const Widget = lazy(() => import("@/pages/Widget"));
const Wrapped = lazy(() => import("@/pages/Wrapped"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

// Persist the read cache to localStorage so data is viewable offline
// across reloads. Mutations aren't persisted (they can't be replayed
// without their fn); they pause in-session and flush on reconnect.
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: RQ_CACHE_KEY,
});

/**
 * useAuthReset needs the query client, so it has to run inside the
 * provider rather than in App's own body.
 */
function AuthReset() {
  useAuthReset();
  return null;
}

export default function App() {
  const pin = useAppStore((s) => s.pin);
  const { session, loading } = useSession();
  useAutoDevice(!!session);

  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 1000 * 60 * 60 * 24,
          buster: "v2",
          dehydrateOptions: { shouldDehydrateMutation: () => false },
        }}
      >
        <MotionConfig reducedMotion="user">
         <DialogProvider>
          <Toaster
            position="top-center"
            // Standalone iOS draws under the status bar and the Dynamic
            // Island, so a toast at the default offset lands beneath
            // them — visible enough to notice, not enough to tap.
            offset="calc(env(safe-area-inset-top) + 10px)"
            mobileOffset="calc(env(safe-area-inset-top) + 10px)"
            toastOptions={{
              className: "!rounded-2xl !border !bg-surface !text-ink !shadow-card",
            }}
          />
          <AuthReset />
          <UpdatePrompt />
          {/* Order matters: hold the splash until the stored session has
              been read, or every launch flashes a sign-in screen at
              someone who is already signed in. */}
          {loading ? (
            <div className="min-h-dvh" />
          ) : !session ? (
            <SignIn />
          ) : !pin ? (
            <Onboarding />
          ) : (
            <BrowserRouter>
              <Routes>
                {/* Outside AppShell on purpose: a glanceable view with a
                    nav bar and a greeting is just the app again. */}
                <Route
                  path="/widget"
                  element={
                    <Suspense fallback={null}>
                      <Widget />
                    </Suspense>
                  }
                />
                <Route element={<AppShell />}>
                  <Route index element={<Dashboard />} />
                  <Route path="/attendance" element={<Attendance />} />
                  <Route path="/marks" element={<Marks />} />
                  <Route path="/insights" element={<Insights />} />
                  <Route path="/timetable" element={<Timetable />} />
                  <Route path="/calendar" element={<Calendar />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/log" element={<AbsentLog />} />
                <Route path="/history" element={<History />} />
                  <Route path="/wrapped" element={<Wrapped />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </BrowserRouter>
          )}
         </DialogProvider>
        </MotionConfig>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}
