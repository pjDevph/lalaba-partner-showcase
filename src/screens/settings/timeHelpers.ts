// Time parsing/formatting helpers for the Settings hours + staff screens.
export const TIME_PICKER_HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1–12
export const TIME_PICKER_MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,…,55
export const TIME_PICKER_MERIDIEMS = ["AM", "PM"] as const;
export type Meridiem = (typeof TIME_PICKER_MERIDIEMS)[number];

export function parseTime24(value: string): { hour12: number; minute: number; meridiem: Meridiem } {
  const [hStr, mStr] = value.split(":");
  const hh = Number.parseInt(hStr, 10) || 0;
  const mm = Number.parseInt(mStr, 10) || 0;
  const meridiem: Meridiem = hh >= 12 ? "PM" : "AM";
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return { hour12, minute: mm, meridiem };
}

export function formatTime24(hour12: number, minute: number, meridiem: Meridiem): string {
  const hh = meridiem === "PM" ? (hour12 % 12) + 12 : hour12 % 12;
  return `${hh.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

export function formatTime12(value: string): string {
  const { hour12, minute, meridiem } = parseTime24(value);
  return `${hour12}:${minute.toString().padStart(2, "0")} ${meridiem}`;
}

