import { useDialogStore, type DialogChoice } from "../stores/dialogStore";

export function showAlert(title: string, message?: string) {
  useDialogStore.getState().show({ title, message, variant: "info" });
}

export function showConfirm(
  title: string,
  message: string,
  onConfirm: () => void,
  opts?: {
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    onCancel?: () => void;
  }
) {
  useDialogStore.getState().show({
    title,
    message,
    variant: "confirm",
    onConfirm,
    confirmLabel: opts?.confirmLabel ?? "Confirm",
    cancelLabel: opts?.cancelLabel ?? "Cancel",
    destructive: opts?.destructive,
    onCancel: opts?.onCancel,
  });
}

/**
 * A stacked list of options with a Cancel — what a native action-sheet Alert
 * used to do, in the app's own dialog so it looks like everything else and can
 * be driven from outside React.
 *
 * `onCancel` fires for Cancel, the backdrop and the hardware back button, so a
 * caller awaiting a choice always gets an answer rather than hanging.
 */
export function showChoice(
  title: string,
  choices: DialogChoice[],
  opts?: { message?: string; cancelLabel?: string; onCancel?: () => void },
) {
  useDialogStore.getState().show({
    title,
    message: opts?.message,
    variant: "choice",
    choices,
    cancelLabel: opts?.cancelLabel ?? "Cancel",
    onCancel: opts?.onCancel,
  });
}
