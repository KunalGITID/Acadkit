import { Component, lazy, Suspense } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("App crash:", error, info); }
  render() {
    if (this.state.error) {
      const msg = (this.state.error as Error).message;
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0f] px-6 text-center">
          <p className="font-syne text-lg text-foreground">Something went wrong</p>
          <p className="max-w-xs break-all text-xs text-muted-foreground">{msg}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-2 rounded-lg bg-[#7c6af7] px-5 py-2.5 text-sm font-medium text-white">Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}
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
const LogPage = lazy(() => import("@/pages/log"));

function AppDataProvider({ children }: { children: React.ReactNode }) {
  const subjectsQuery = useSubjects();
  const settingsQuery = useSettings();
  useDayOrderSync();
  useBroadcastSync();

  const isLoading = subjectsQuery.isLoading || settingsQuery.isLoading;

  if (isLoading) return <Splash />;

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
          <Route path="/log" element={<LogPage />} />
        </Routes>
      </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}
