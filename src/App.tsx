import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { BottomNav } from "@/components/ui/bottom-nav";
import { OfflineIndicator } from "@/components/ui/offline-indicator";
import { PwaBanner } from "@/components/ui/pwa-banner";
import { useBroadcastSync } from "@/hooks/useBroadcastSync";
import { useDayOrderSync } from "@/hooks/useDayOrderSync";
import { useSettings } from "@/hooks/useSettings";
import { useSubjects } from "@/hooks/useSubjects";

const DashboardPage = lazy(() => import("@/pages/dashboard"));
const MarksPage = lazy(() => import("@/pages/marks"));
const AttendancePage = lazy(() => import("@/pages/attendance"));
const TimetablePage = lazy(() => import("@/pages/timetable"));
const CalendarPage = lazy(() => import("@/pages/calendar"));
const SettingsPage = lazy(() => import("@/pages/settings"));

function AppDataProvider({ children }: { children: React.ReactNode }) {
  const subjectsQuery = useSubjects();
  const settingsQuery = useSettings();
  const [timedOut, setTimedOut] = useState(false);
  useDayOrderSync();
  useBroadcastSync();

  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), 10_000);
    return () => clearTimeout(id);
  }, []);

  const isLoading = subjectsQuery.isLoading || settingsQuery.isLoading;
  const isError = subjectsQuery.isError || settingsQuery.isError || timedOut;

  if (isLoading && !isError) return <Splash />;
  if (isError) return <ErrorScreen />;

  return <>{children}</>;
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f] transition-opacity duration-500">
      <img
        src="/icons/icon-192.png"
        style={{ width: 80, height: 80, borderRadius: 20 }}
        alt="AcadKit"
      />
    </div>
  );
}

function ErrorScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0f] px-6 text-center">
      <img
        src="/icons/icon-192.png"
        style={{ width: 60, height: 60, borderRadius: 16, opacity: 0.5 }}
        alt="AcadKit"
      />
      <p className="font-syne text-lg text-foreground">Could not connect</p>
      <p className="text-sm text-muted-foreground">
        Check your internet connection and try again.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-2 rounded-lg bg-[#7c6af7] px-5 py-2.5 text-sm font-medium text-white"
      >
        Retry
      </button>
    </div>
  );
}

function PageRoutes() {
  const location = useLocation();

  return (
    <div
      key={location.pathname}
      className="animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <Routes location={location}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/marks" element={<MarksPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/timetable" element={<TimetablePage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppDataProvider>
        <div className="min-h-screen bg-background pb-20">
          <OfflineIndicator />
          <PageRoutes />
          <BottomNav />
          <PwaBanner />
        </div>
      </AppDataProvider>
    </BrowserRouter>
  );
}
