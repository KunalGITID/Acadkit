import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, type Location } from "react-router-dom";
import { QueryClient, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";
import { registerMutationDefaults } from "@/api/mutations";
import { AppShell } from "@/components/layout/app-shell";
import { ErrorBoundary } from "@/components/error-boundary";
import { LaunchScreen } from "@/components/launch-screen";
import { DialogProvider } from "@/components/ui/dialog";
import { UpdatePrompt } from "@/components/update-prompt";
import Onboarding from "@/pages/Onboarding";
import SignIn from "@/pages/SignIn";
import { useSession } from "@/hooks/useSession";
import { useAutoDevice } from "@/hooks/useAutoDevice";
import { RQ_CACHE_KEY, useAuthReset } from "@/hooks/useAuthReset";
import { entryScreen } from "@/lib/devices";
import { useAppStore } from "@/store/app";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Attendance = lazy(() => import("@/pages/Attendance"));
const Marks = lazy(() => import("@/pages/Marks"));
const Timetable = lazy(() => import("@/pages/Timetable"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const Settings = lazy(() => import("@/pages/Settings"));
const AbsentLog = lazy(() => import("@/pages/AbsentLog"));
const Survival = lazy(() => import("@/pages/Survival"));
const History = lazy(() => import("@/pages/History"));
const Wrapped = lazy(() => import("@/pages/Wrapped"));
const Files = lazy(() => import("@/pages/Files"));
const Subject = lazy(() => import("@/pages/Subject"));
const Practice = lazy(() => import("@/pages/Practice"));
const Electives = lazy(() => import("@/pages/Electives"));
const Viewer = lazy(() => import("@/pages/Viewer"));

/** Query roots kept in memory only (see dehydrateOptions below). */
const UNPERSISTED = new Set(["study-blob", "study-file", "study-download"]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // A week, matching the persisted cache below: opening on last
      // week's figures beats a skeleton waiting on a slow network, and
      // everything refetches in the background regardless.
      gcTime: 1000 * 60 * 60 * 24 * 7,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

// Persist the read cache to localStorage so data is viewable offline
// across reloads.
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: RQ_CACHE_KEY,
});

// Must happen before the persisted cache is restored: a rehydrated
// mutation looks up its function by key, and one that finds nothing is
// dropped on the floor.
registerMutationDefaults(queryClient);

/**
 * useAuthReset needs the query client, so it has to run inside the
 * provider rather than in App's own body.
 */
function AuthReset() {
  useAuthReset();
  return null;
}

/** The routes, with the file viewer able to open *over* a page. */
function AppRoutes() {
  const location = useLocation();
  const background = (location.state as { background?: Location } | null)?.background;
  return (
    <>
      <Routes location={background ?? location}>
        {/* The file viewer is full-screen: outside the shell, so a
            page gets the whole height and no tab bar sits over it. */}
        <Route
          path="/view"
          element={
            <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
              <Viewer />
            </Suspense>
          }
        />
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/marks" element={<Marks />} />
          <Route path="/survival" element={<Survival />} />
          {/* Old links and home-screen bookmarks. */}
          <Route path="/insights" element={<Navigate to="/survival" replace />} />
          <Route path="/timetable" element={<Timetable />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/log" element={<AbsentLog />} />
        <Route path="/history" element={<History />} />
          <Route path="/wrapped" element={<Wrapped />} />
          <Route path="/files" element={<Files />} />
          <Route path="/subject/:code" element={<Subject />} />
          <Route path="/practice/:code" element={<Practice />} />
          <Route path="/electives" element={<Electives />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      {background && (
        <Routes>
          <Route
            path="/view"
            element={
              <div className="fixed inset-0 z-[60] bg-bg">
                <Suspense fallback={<div className="h-full bg-bg" />}>
                  <Viewer overlay />
                </Suspense>
              </div>
            }
          />
        </Routes>
      )}
    </>
  );
}

export default function App() {
  const pin = useAppStore((s) => s.pin);
  const { session, loading } = useSession();
  const { resolved: devicesResolved } = useAutoDevice(!!session);
  const screen = entryScreen({
    sessionLoading: loading,
    signedIn: !!session,
    pin,
    devicesResolved,
  });

  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 1000 * 60 * 60 * 24 * 7,
          buster: "v2",
          dehydrateOptions: {
            // Offline, React Query pauses a mutation rather than failing it.
            shouldDehydrateMutation: (m) => m.state.isPaused,
            // Not the viewer's files: a Blob doesn't survive JSON - it came back as {}, which the viewer then tried to read as a file ("arrayBuffer is not a function") - and a signed link kept for a week has long expired.
            shouldDehydrateQuery: (q) => defaultShouldDehydrateQuery(q) && !UNPERSISTED.has(String(q.queryKey[0])),
          },
        }}
        // Restored writes have to be kicked, and the server is the
        // authority once they land.
        onSuccess={() => {
          void queryClient.resumePausedMutations().then(() => queryClient.invalidateQueries());
        }}
      >
        <MotionConfig reducedMotion="user">
         <DialogProvider>
          <Toaster
            position="top-center"
            // Standalone iOS draws under the status bar and the Dynamic
            // Island, so a toast at the default offset lands beneath
            // them - visible enough to notice, not enough to tap.
            offset="calc(env(safe-area-inset-top) + 10px)"
            mobileOffset="calc(env(safe-area-inset-top) + 10px)"
            toastOptions={{
              className: "!rounded-2xl !border !bg-surface !text-ink !shadow-card",
            }}
          />
          <AuthReset />
          <UpdatePrompt />
          {/* Order matters: hold the launch screen until the stored session has been read, or every launch flashes a sign-in screen at someone who is already signed in. */}
          <LaunchScreen ready={!loading} />
          {screen === "holding" ? (
            <div className="min-h-dvh" />
          ) : screen === "sign-in" ? (
            <SignIn />
          ) : screen === "onboarding" ? (
            <Onboarding />
          ) : (
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          )}
         </DialogProvider>
        </MotionConfig>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}
