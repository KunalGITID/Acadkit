import { lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import Onboarding from "@/pages/Onboarding";
import { useAppStore } from "@/store/app";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Attendance = lazy(() => import("@/pages/Attendance"));
const Marks = lazy(() => import("@/pages/Marks"));
const Timetable = lazy(() => import("@/pages/Timetable"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const Settings = lazy(() => import("@/pages/Settings"));
const AbsentLog = lazy(() => import("@/pages/AbsentLog"));
const Insights = lazy(() => import("@/pages/Insights"));

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

export default function App() {
  const pin = useAppStore((s) => s.pin);

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <Toaster
          position="top-center"
          toastOptions={{
            className: "!rounded-2xl !border !bg-surface !text-ink !shadow-card",
          }}
        />
        {!pin ? (
          <Onboarding />
        ) : (
          <BrowserRouter>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<Dashboard />} />
                <Route path="/attendance" element={<Attendance />} />
                <Route path="/marks" element={<Marks />} />
                <Route path="/insights" element={<Insights />} />
                <Route path="/timetable" element={<Timetable />} />
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/log" element={<AbsentLog />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        )}
      </MotionConfig>
    </QueryClientProvider>
  );
}
