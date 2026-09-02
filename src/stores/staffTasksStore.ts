// src/stores/staffTasksStore.ts
// Lightweight count of the signed-in staff member's pending (incomplete) tasks.
// Drives the Profile tab badge and the "My Tasks" row badge so cashier/staff get
// a limited "what's not done" signal without a full dashboard.

import { create } from "zustand";
import { gqlMyTasks } from "../services/graphql/tasks";
import { useAuthStore } from "./authStore";

interface StaffTasksState {
  pendingCount: number;
  refresh: () => Promise<void>;
}

export const useStaffTasksStore = create<StaffTasksState>((set) => ({
  pendingCount: 0,
  refresh: async () => {
    const { user } = useAuthStore.getState();
    if (!user) { set({ pendingCount: 0 }); return; }
    try {
      const tasks = await gqlMyTasks({ isCompleted: false, limit: 200 });
      set({ pendingCount: tasks.filter((t) => t.isVisibleToStaff).length });
    } catch {
      /* offline — keep last known */
    }
  },
}));
