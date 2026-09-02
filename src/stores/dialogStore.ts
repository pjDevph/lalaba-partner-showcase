import { create } from "zustand";

/** One tappable choice in a `choice` dialog. */
export interface DialogChoice {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

export interface DialogConfig {
  title: string;
  message?: string;
  /**
   * `choice` renders a stacked list of options plus Cancel — the replacement
   * for a native action-sheet Alert, which could not be styled, tested or
   * reused and looked nothing like the rest of the app.
   */
  variant?: "info" | "confirm" | "choice";
  choices?: DialogChoice[];
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface DialogState {
  dialog: DialogConfig | null;
  show: (config: DialogConfig) => void;
  hide: () => void;
}

export const useDialogStore = create<DialogState>()((set) => ({
  dialog: null,
  show: (config) => set({ dialog: config }),
  hide: () => set({ dialog: null }),
}));
