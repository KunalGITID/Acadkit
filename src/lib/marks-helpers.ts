import type { Mark, MarkComponentType } from "@/types/database";

export function defaultMaxMarks(type: MarkComponentType): number {
  switch (type) {
    case "CT":
      return 25;
    case "Lab":
      return 50;
    case "Assignment":
      return 100;
    case "Project":
      return 100;
    case "External":
      return 40;
    default:
      return 25;
  }
}

export function suggestLabel(
  type: MarkComponentType,
  internalMarks: Mark[]
): string {
  const same = internalMarks.filter((m) => m.component_type === type);
  const n = same.length + 1;
  switch (type) {
    case "CT":
      return `CT${n}`;
    case "Lab":
      return `Lab ${n}`;
    case "Assignment":
      return `Assignment ${n}`;
    case "Project":
      return `Project ${n}`;
    default:
      return "End Sem";
  }
}

export function formatAddedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export const COMPONENT_BADGE: Record<MarkComponentType, string> = {
  CT: "bg-[#7c6af7]/20 text-[#7c6af7]",
  Lab: "bg-cyan-500/20 text-cyan-300",
  Assignment: "bg-amber-500/20 text-amber-300",
  Project: "bg-pink-500/20 text-pink-300",
  External: "bg-orange-500/20 text-orange-300",
};
