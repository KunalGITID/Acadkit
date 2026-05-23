import { ArrowLeft, Check, Copy, Download, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  useClearDeclaredHoliday,
  useSettings,
  useUpdateSettings,
} from "@/hooks/useSettings";
import { supabase } from "@/lib/supabase";
import { setSyncPin } from "@/lib/device";
import { useAppStore } from "@/store/useAppStore";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const deviceId = useAppStore((s) => s.deviceId);
  const settings = useAppStore((s) => s.settings);
  useSettings();
  const updateSettings = useUpdateSettings();
  const clearHoliday = useClearDeclaredHoliday();

  // User name (localStorage)
  const [userName, setUserName] = useState(() => localStorage.getItem("ACADKIT_USER_NAME") ?? "");
  const [exporting, setExporting] = useState(false);

  // Section A state
  const [semester, setSemester] = useState(settings?.semester ?? 3);
  const [targetSgpa, setTargetSgpa] = useState(settings?.target_sgpa ?? 9.0);
  const [semStart, setSemStart] = useState(settings?.sem_start ?? "2026-07-21");
  const [semEnd, setSemEnd] = useState(settings?.sem_end ?? "2026-11-18");

  // Section B state
  const [minAttendance, setMinAttendance] = useState(settings?.min_attendance ?? 75);

  // Sync PIN
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  const handleSwitchPin = () => {
    if (!/^\d{4}$/.test(pinInput)) {
      setPinError("Enter exactly 4 digits");
      return;
    }
    setSyncPin(pinInput);
    window.location.reload();
  };

  // Copy state
  const [copied, setCopied] = useState(false);
  const [clearing, setClearing] = useState(false);

  const saveSection = async (updates: Parameters<typeof updateSettings.mutateAsync>[0]) => {
    await updateSettings.mutateAsync(updates);
    toast("Settings saved");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(deviceId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleClearData = async () => {
    const confirmed = window.confirm(
      "This will permanently delete all your subjects, attendance, marks and deadlines. Cannot be undone."
    );
    if (!confirmed) return;
    setClearing(true);
    try {
      await Promise.all([
        supabase.from("attendance").delete().eq("device_id", deviceId),
        supabase.from("marks").delete().eq("device_id", deviceId),
        supabase.from("deadlines").delete().eq("device_id", deviceId),
        supabase.from("timetable_slots").delete().eq("device_id", deviceId),
        supabase.from("subjects").delete().eq("device_id", deviceId),
      ]);
      await updateSettings.mutateAsync({
        semester: 3,
        target_sgpa: 9.0,
        min_attendance: 75,
        declared_holidays: [],
      });
      toast("All data cleared");
      navigate("/");
    } catch {
      toast("Failed to clear data");
    } finally {
      setClearing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const [subjects, attendance, marks, deadlines, timetable] = await Promise.all([
        supabase.from("subjects").select("*").eq("device_id", deviceId),
        supabase.from("attendance").select("*").eq("device_id", deviceId),
        supabase.from("marks").select("*").eq("device_id", deviceId),
        supabase.from("deadlines").select("*").eq("device_id", deviceId),
        supabase.from("timetable_slots").select("*").eq("device_id", deviceId),
      ]);
      const payload = {
        exported_at: new Date().toISOString(),
        device_id: deviceId,
        settings,
        subjects: subjects.data ?? [],
        timetable_slots: timetable.data ?? [],
        attendance: attendance.data ?? [],
        marks: marks.data ?? [],
        deadlines: deadlines.data ?? [],
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `acadkit-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast("Data exported successfully");
    } catch {
      toast("Failed to export data");
    } finally {
      setExporting(false);
    }
  };

  const holidays = settings?.declared_holidays ?? [];

  return (
    <main className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 border-b border-[#1e1e2e] bg-background/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#1e1e2e] text-muted-foreground hover:text-foreground"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="font-syne text-xl font-bold text-foreground">Settings</h1>
        </div>
      </header>

      <div className="space-y-6 px-4 py-5">
        {/* Section A - Semester Info */}
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Semester Info
          </p>
          <div className="rounded-lg border border-[#1e1e2e] bg-[#111118] p-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="semester">Semester</Label>
                  <Input
                    id="semester"
                    type="number"
                    min={1}
                    max={8}
                    value={semester}
                    onChange={(e) => setSemester(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="target-sgpa">Target SGPA</Label>
                  <Input
                    id="target-sgpa"
                    type="number"
                    min={0}
                    max={10}
                    step={0.1}
                    value={targetSgpa}
                    onChange={(e) => setTargetSgpa(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sem-start">Sem Start</Label>
                  <Input
                    id="sem-start"
                    type="date"
                    value={semStart}
                    onChange={(e) => setSemStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sem-end">Sem End</Label>
                  <Input
                    id="sem-end"
                    type="date"
                    value={semEnd}
                    onChange={(e) => setSemEnd(e.target.value)}
                  />
                </div>
              </div>
              <Button
                className="w-full bg-[#7c6af7] hover:bg-[#6b5be0]"
                onClick={() =>
                  saveSection({
                    semester,
                    target_sgpa: targetSgpa,
                    sem_start: semStart,
                    sem_end: semEnd,
                  })
                }
                disabled={updateSettings.isPending}
              >
                {updateSettings.isPending ? "Saving…" : "Save Semester Info"}
              </Button>
            </div>
          </div>
        </section>

        {/* Section B - Attendance */}
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Attendance
          </p>
          <div className="rounded-lg border border-[#1e1e2e] bg-[#111118] p-4">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="min-attendance">Minimum Attendance (%)</Label>
                <Input
                  id="min-attendance"
                  type="number"
                  min={0}
                  max={100}
                  value={minAttendance}
                  onChange={(e) => setMinAttendance(Number(e.target.value))}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                ℹ️ SRM requires 75% minimum attendance
              </p>
              <Button
                className="w-full bg-[#7c6af7] hover:bg-[#6b5be0]"
                onClick={() => saveSection({ min_attendance: minAttendance })}
                disabled={updateSettings.isPending}
              >
                {updateSettings.isPending ? "Saving…" : "Save Attendance Settings"}
              </Button>
            </div>
          </div>
        </section>

        {/* Section C - Declared Holidays */}
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Declared Holidays
          </p>
          <div className="rounded-lg border border-[#1e1e2e] bg-[#111118] p-4">
            {holidays.length === 0 ? (
              <p className="py-2 text-center text-sm text-muted-foreground">
                No declared holidays
              </p>
            ) : (
              <div className="space-y-2">
                {holidays.map((date) => (
                  <div
                    key={date}
                    className="flex items-center justify-between gap-3 rounded-md bg-[#0a0a0f] px-3 py-2"
                  >
                    <span className="font-mono text-sm text-foreground">
                      {new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => clearHoliday.mutate(date)}
                      className="text-xs text-[#fb7185] hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Section D - Profile */}
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Profile
          </p>
          <div className="rounded-lg border border-[#1e1e2e] bg-[#111118] p-4">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="user-name">Your Name</Label>
                <Input
                  id="user-name"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="e.g. Kunal"
                  maxLength={30}
                />
                <p className="text-xs text-muted-foreground">
                  Shown in the dashboard greeting.
                </p>
              </div>
              <Button
                className="w-full bg-[#7c6af7] hover:bg-[#6b5be0]"
                onClick={() => {
                  localStorage.setItem("ACADKIT_USER_NAME", userName.trim());
                  toast("Name saved");
                }}
              >
                Save Name
              </Button>
            </div>
          </div>
        </section>

        {/* Section E - Sync */}
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sync
          </p>
          <div className="rounded-lg border border-[#1e1e2e] bg-[#111118] p-4 space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Your sync PIN</p>
              <div className="flex items-center gap-2">
                <span className="font-mono text-3xl font-bold tracking-[0.3em] text-[#7c6af7]">
                  {deviceId.length === 4 ? deviceId : "????"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(deviceId);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="ml-2 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#7c6af7] hover:bg-[#7c6af7]/10"
                >
                  {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Share this PIN with your other devices to sync data.
              </p>
            </div>
            <div className="border-t border-[#1e1e2e] pt-4 space-y-2">
              <Label htmlFor="pin-input">Switch to another PIN</Label>
              <div className="flex gap-2">
                <Input
                  id="pin-input"
                  type="number"
                  inputMode="numeric"
                  placeholder="1234"
                  maxLength={4}
                  value={pinInput}
                  onChange={(e) => {
                    setPinInput(e.target.value.slice(0, 4));
                    setPinError("");
                  }}
                  className="w-28 font-mono text-lg tracking-widest"
                />
                <Button
                  className="bg-[#7c6af7] hover:bg-[#6b5be0]"
                  onClick={handleSwitchPin}
                >
                  Switch
                </Button>
              </div>
              {pinError && <p className="text-xs text-[#fb7185]">{pinError}</p>}
              <p className="text-xs text-muted-foreground">
                Entering another device's PIN will load its data on this device.
              </p>
            </div>
          </div>
        </section>

        {/* Section F - Data */}
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Data
          </p>
          <div className="space-y-3">
            <div className="rounded-lg border border-[#1e1e2e] bg-[#111118] p-4">
              <p className="mb-3 text-sm text-muted-foreground">
                Download a full JSON backup of all your data.
              </p>
              <Button
                className="w-full border border-[#7c6af7]/40 bg-[#7c6af7]/10 text-[#c4b5fd] hover:bg-[#7c6af7]/20"
                variant="outline"
                onClick={handleExport}
                disabled={exporting}
              >
                <Download className="mr-2 h-4 w-4" />
                {exporting ? "Exporting…" : "Export Data (JSON)"}
              </Button>
            </div>
            <div className="rounded-lg border border-[#fb7185]/30 bg-[#111118] p-4">
              <p className="mb-3 text-sm text-muted-foreground">
                Permanently deletes all your subjects, attendance records, marks, and deadlines. This cannot be undone.
              </p>
              <Button
                className="w-full border border-[#fb7185]/40 bg-[#fb7185]/10 text-[#fb7185] hover:bg-[#fb7185]/20"
                variant="outline"
                onClick={handleClearData}
                disabled={clearing}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {clearing ? "Clearing…" : "Clear All Data"}
              </Button>
            </div>
          </div>
        </section>

        {/* Section F - App Info */}
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            App Info
          </p>
          <div className="rounded-lg border border-[#1e1e2e] bg-[#111118] p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-syne font-semibold text-foreground">AcadKit</span>
                <span className="font-mono text-xs text-muted-foreground">v1.0.0</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Built for SRM KTR · Sem 3 2026-27
              </p>
              <div className="flex items-center gap-2 rounded-md bg-[#0a0a0f] px-3 py-2">
                <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
                  {deviceId.slice(0, 8)}...
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#7c6af7] hover:bg-[#7c6af7]/10"
                >
                  {copied ? (
                    <><Check className="h-3 w-3" /> Copied</>
                  ) : (
                    <><Copy className="h-3 w-3" /> Copy ID</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
