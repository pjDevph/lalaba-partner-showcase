// app/(washer)/task-detail.tsx
// Same screen a courier uses (src/screens/orderLeg/TaskDetailScreen.tsx),
// reached when a washer self-assigns her own pickup/return leg — see
// ProviderOrders.tsx's "Manage pickup"/"Manage return" action. Registering it
// here (rather than always pushing into `/(courier)/task-detail`) means it
// renders inside the washer's own teal Tabs shell, not the courier stack's.
export { default } from "../../src/screens/orderLeg/TaskDetailScreen";
