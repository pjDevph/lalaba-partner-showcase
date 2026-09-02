// app/(courier)/task-detail.tsx
// Thin route wrapper — the screen itself lives in
// src/screens/orderLeg/TaskDetailScreen.tsx so a provider who self-assigns
// their own pickup/return leg can reach the identical screen from their own
// role's Tabs stack (app/(washer)/task-detail.tsx, app/(tabs)/task-detail.tsx)
// instead of a re-implementation. See that file for details.
export { default } from "../../src/screens/orderLeg/TaskDetailScreen";
