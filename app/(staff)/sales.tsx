// app/(staff)/sales.tsx
// Staff reports tab — re-uses the merchant Reports/sales screen. Data comes from
// myOrders scoped to the staff's branch. Shown in the staff nav only when the
// staff holds a reports permission (see _layout gating).
export { default } from "../(tabs)/sales";
