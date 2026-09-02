// app/(staff)/services.tsx
// Staff services tab — re-uses the merchant services screen, which already
// branches on role (STAFF sees branch + global services). Shown in the staff
// nav only when the staff holds a services permission (see _layout gating).
export { default } from "../(tabs)/services";
