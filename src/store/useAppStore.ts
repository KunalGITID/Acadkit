import { create } from "zustand";
import { getDeviceId } from "@/lib/device";
import type { Settings, Subject } from "@/types/database";

interface AppStore {
  deviceId: string;
  subjects: Subject[];
  settings: Settings | null;
  todayDayOrder: number | null;
  setSubjects: (subjects: Subject[]) => void;
  setSettings: (settings: Settings) => void;
  setTodayDayOrder: (order: number | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  deviceId: getDeviceId(),
  subjects: [],
  settings: null,
  todayDayOrder: null,
  setSubjects: (subjects) => set({ subjects }),
  setSettings: (settings) => set({ settings }),
  setTodayDayOrder: (order) => set({ todayDayOrder: order }),
}));
