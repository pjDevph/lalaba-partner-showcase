// src/features/tasks/taskHelpers.ts
// Shared task types, metadata, and period/reset helpers used by the owner and
// staff Tasks screens. Tasks reset on a client-side schedule (no server cron):
// a completed recurring task is un-checked once its period has rolled over.

import { C } from "../../theme/tokens";

// ─── Enums ─────────────────────────────────────────────────────────────────────

export type Frequency = "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
export type Category =
  | "CLEANING" | "INVENTORY" | "MAINTENANCE" | "OPENING" | "CLOSING" | "CUSTOMER_SERVICE" | "OTHER";
export type Priority = "NORMAL" | "IMPORTANT" | "URGENT";
// EVERYONE = all · OWNER = merchant only · STAFF = all staff · ROLE = a branch role · SPECIFIC = picked people
export type AssignMode = "EVERYONE" | "OWNER" | "STAFF" | "ROLE" | "SPECIFIC";
export type BranchRole = "MANAGER" | "STAFF";
// Legacy field kept for tasks created before the assignMode model.
export type AssignedTo = "ALL" | "MERCHANT" | "STAFF";

export interface Task {
  id: string;
  title: string;
  description?: string;
  category: Category;
  priority: Priority;
  frequency: Frequency;
  customDays?: number[];      // 0=Sun … 6=Sat — only for CUSTOM
  dueTime?: string | null;    // "HH:MM" 24h, or null
  assignMode: AssignMode;
  assignedRole?: BranchRole;  // only for ROLE
  assignedStaffIds?: string[];
  assignedTo?: AssignedTo;    // legacy
  requirePhoto?: boolean;
  requireNote?: boolean;
  notifyOwner?: boolean;
  source?: string | null;       // e.g. "costing:electricity" — auto-created reminders
  isCompleted: boolean;
  completedAt?: Date;
  completedBy?: string | null;
  completionNote?: string | null;
  proofPhotoUri?: string | null;
  lastResetAt?: Date;
  createdAt?: Date;
  merchantId: string;
  branchId?: string | null;
  order: number;
}

// ─── Metadata ──────────────────────────────────────────────────────────────────

export const FREQ_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "ONCE", label: "One-time" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "CUSTOM", label: "Custom" },
];

export const CATEGORY_OPTIONS: Category[] = [
  "CLEANING", "INVENTORY", "MAINTENANCE", "OPENING", "CLOSING", "CUSTOMER_SERVICE", "OTHER",
];

export const CATEGORY_META: Record<Category, { label: string; fg: string; bg: string }> = {
  CLEANING:         { label: "Cleaning",     fg: C.info500,    bg: C.info100 },
  INVENTORY:        { label: "Inventory",    fg: C.brand700,   bg: C.brand100 },
  MAINTENANCE:      { label: "Maintenance",  fg: C.warning700, bg: C.warning100 },
  OPENING:          { label: "Opening",      fg: C.success700, bg: C.success100 },
  CLOSING:          { label: "Closing",      fg: C.purple700,  bg: C.purple100 },
  CUSTOMER_SERVICE: { label: "Customer",     fg: C.accent700,  bg: C.accent100 },
  OTHER:            { label: "Other",        fg: C.gray600,    bg: C.gray100 },
};

export const PRIORITY_OPTIONS: Priority[] = ["NORMAL", "IMPORTANT", "URGENT"];

export const PRIORITY_META: Record<Priority, { label: string; fg: string; bg: string }> = {
  NORMAL:    { label: "Normal",    fg: C.gray600,    bg: C.gray100 },
  IMPORTANT: { label: "Important", fg: C.warning700, bg: C.warning100 },
  URGENT:    { label: "Urgent",    fg: C.error700,   bg: C.error100 },
};

export const ASSIGN_OPTIONS: { value: AssignMode; label: string }[] = [
  { value: "EVERYONE", label: "Everyone" },
  { value: "OWNER",    label: "Owner" },
  { value: "STAFF",    label: "All Staff" },
  { value: "ROLE",     label: "By Role" },
  { value: "SPECIFIC", label: "Specific" },
];

export const ROLE_OPTIONS: { value: BranchRole; label: string }[] = [
  { value: "MANAGER", label: "Managers" },
  { value: "STAFF",   label: "Staff" },
];

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Mapping ───────────────────────────────────────────────────────────────────

// Derive the new assignMode from a legacy task that only had assignedTo.
function deriveAssignMode(d: any): AssignMode {
  if (d.assignMode) return d.assignMode;
  switch (d.assignedTo) {
    case "MERCHANT": return "OWNER";
    case "STAFF":    return "STAFF";
    default:         return "EVERYONE";
  }
}

export function mapTask(d: any): Task {
  return {
    id: d.id,
    title: d.title ?? "",
    description: d.description,
    category: d.category ?? "OTHER",
    priority: d.priority ?? "NORMAL",
    frequency: d.frequency ?? "DAILY",
    customDays: Array.isArray(d.customDays) ? d.customDays : [],
    dueTime: d.dueTime ?? null,
    assignMode: deriveAssignMode(d),
    assignedRole: d.assignedRole,
    assignedStaffIds: Array.isArray(d.assignedStaffIds) ? d.assignedStaffIds : [],
    assignedTo: d.assignedTo,
    requirePhoto: !!d.requirePhoto,
    requireNote: !!d.requireNote,
    notifyOwner: !!d.notifyOwner,
    source: d.source ?? null,
    isCompleted: d.isCompleted ?? false,
    completedAt: d.completedAt ? new Date(d.completedAt) : undefined,
    completedBy: d.completedBy ?? null,
    completionNote: d.completionNote ?? null,
    proofPhotoUri: d.proofPhotoUri ?? null,
    lastResetAt: d.lastResetAt ? new Date(d.lastResetAt) : undefined,
    createdAt: d.createdAt ? new Date(d.createdAt) : undefined,
    merchantId: d.merchantId,
    branchId: d.branchId ?? null,
    order: d.order ?? 0,
  };
}

// ─── Time formatting ────────────────────────────────────────────────────────────

// "21:00" → "9:00 PM". Returns "" for empty/invalid input.
export function formatDueTime(hhmm?: string | null): string {
  if (!hhmm) return "";
  const [hStr, mStr] = hhmm.split(":");
  const h = Number.parseInt(hStr, 10);
  const m = Number.parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// ─── Labels & summaries ─────────────────────────────────────────────────────────

export function freqLabel(freq: Frequency): string {
  const f = FREQ_OPTIONS.find((o) => o.value === freq);
  return f ? f.label : freq;
}

// Frequency as a sentence, expanding CUSTOM into its weekdays.
export function frequencyText(task: Pick<Task, "frequency" | "customDays">): string {
  if (task.frequency === "CUSTOM") {
    const days = (task.customDays ?? []).slice().sort((a, b) => a - b).map((d) => WEEKDAYS[d]);
    return days.length ? days.join(", ") : "Custom";
  }
  return freqLabel(task.frequency);
}

export function assignmentText(
  task: Pick<Task, "assignMode" | "assignedRole" | "assignedStaffIds">,
  staffNameById?: Record<string, string>,
): string {
  switch (task.assignMode) {
    case "OWNER": return "Owner";
    case "STAFF": return "All staff";
    case "ROLE": return task.assignedRole === "MANAGER" ? "Managers" : "Staff";
    case "SPECIFIC": {
      const ids = task.assignedStaffIds ?? [];
      if (ids.length === 0) return "No one yet";
      if (!staffNameById) return `${ids.length} ${ids.length === 1 ? "person" : "people"}`;
      const names = ids.map((id) => staffNameById[id] ?? "Unknown");
      return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
    }
    default: return "Everyone";
  }
}

// One-line preview shown before saving / on cards.
export function previewLine(task: Pick<Task, "frequency" | "customDays" | "dueTime" | "assignMode" | "assignedRole" | "assignedStaffIds">): string {
  const parts = [frequencyText(task)];
  const due = formatDueTime(task.dueTime);
  if (due) parts.push(`Due ${due}`);
  parts.push(assignmentText(task));
  return parts.join(" · ");
}

// ─── Scheduling / reset ──────────────────────────────────────────────────────────

function asDate(v: any): Date {
  if (v instanceof Date) return v;
  return v?.toDate?.() ?? new Date(0);
}

// Is this task active on today's date? CUSTOM tasks only run on their weekdays.
export function scheduledToday(task: Pick<Task, "frequency" | "customDays">): boolean {
  if (task.frequency === "CUSTOM") {
    return (task.customDays ?? []).includes(new Date().getDay());
  }
  return true;
}

// True when a completed task's period has rolled over and it should be un-checked.
// ONCE never resets. CUSTOM resets daily (each scheduled day is a fresh instance).
export function shouldReset(task: Task): boolean {
  if (task.frequency === "ONCE") return false;
  if (!task.lastResetAt) return task.isCompleted;
  const last = asDate(task.lastResetAt);
  const now = new Date();
  const sameDay =
    last.getFullYear() === now.getFullYear() &&
    last.getMonth() === now.getMonth() &&
    last.getDate() === now.getDate();
  if (task.frequency === "DAILY" || task.frequency === "CUSTOM") {
    return !sameDay;
  }
  if (task.frequency === "WEEKLY") {
    const weekOf = (d: Date) => {
      const day = new Date(d);
      day.setDate(d.getDate() - d.getDay());
      return day.toDateString();
    };
    return weekOf(last) !== weekOf(now);
  }
  if (task.frequency === "MONTHLY") {
    return last.getFullYear() !== now.getFullYear() || last.getMonth() !== now.getMonth();
  }
  return false;
}

// Human countdown until the next reset boundary (e.g. "8h 12m"). "" for ONCE.
export function getResetCountdown(freq: Frequency): string {
  if (freq === "ONCE") return "";
  const now = new Date();
  const resetDate = new Date(now);
  if (freq === "DAILY" || freq === "CUSTOM") {
    resetDate.setDate(resetDate.getDate() + 1);
    resetDate.setHours(0, 0, 0, 0);
  } else if (freq === "WEEKLY") {
    resetDate.setDate(resetDate.getDate() + (7 - resetDate.getDay()));
    resetDate.setHours(0, 0, 0, 0);
  } else {
    resetDate.setMonth(resetDate.getMonth() + 1);
    resetDate.setDate(1);
    resetDate.setHours(0, 0, 0, 0);
  }
  const diff = resetDate.getTime() - now.getTime();
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

// ─── Staff visibility ────────────────────────────────────────────────────────────

// Whether a task should appear for a given staff member (branch + assignment + schedule).
export function taskVisibleToStaff(
  task: Task,
  staff: { uid?: string | null; branchId?: string | null; branchRole?: BranchRole | null },
): boolean {
  // Branch scope: global tasks (no branchId) show everywhere.
  if (task.branchId && staff.branchId && task.branchId !== staff.branchId) return false;
  // Owner-only tasks never show to staff.
  if (task.assignMode === "OWNER") return false;
  // Role assignment: this staff's branch role must match.
  if (task.assignMode === "ROLE" && task.assignedRole !== (staff.branchRole ?? "STAFF")) return false;
  // Specific assignment: this staff must be in the list.
  if (task.assignMode === "SPECIFIC") {
    if (!staff.uid || !(task.assignedStaffIds ?? []).includes(staff.uid)) return false;
  }
  // CUSTOM tasks only on scheduled weekdays.
  if (!scheduledToday(task)) return false;
  return true;
}
