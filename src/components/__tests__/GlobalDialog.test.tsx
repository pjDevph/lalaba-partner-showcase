import React from "react";
import { render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { GlobalDialog } from "../GlobalDialog";
import { useDialogStore } from "../../stores/dialogStore";

/**
 * The info variant lays its single button out in a COLUMN. `flex: 1` there
 * means flexBasis:0 on the main axis, and the card's height is content-driven —
 * so a flex:1 button collapses to zero height and the alert renders with no
 * visible way to dismiss it. Confirm dialogs never showed the bug because their
 * row layout makes flex:1 split the width instead.
 */
const flatten = (style: unknown) => StyleSheet.flatten(style) as Record<string, unknown>;

/** Walk up from the label to whichever ancestor carries the button styling. */
function buttonStyleFor(node: any): Record<string, unknown> {
  let cur = node;
  for (let i = 0; i < 6 && cur; i += 1) {
    const style = flatten(cur.props?.style);
    if (style && (style.height === 44 || style.borderRadius !== undefined)) return style;
    cur = cur.parent;
  }
  return {};
}

describe("GlobalDialog", () => {
  afterEach(() => useDialogStore.getState().hide());

  it("renders a dismiss button for an info alert", () => {
    useDialogStore.getState().show({ title: "Expiry date needed", message: "Enter it first.", variant: "info" });
    const { getByText } = render(<GlobalDialog />);
    expect(getByText("OK")).toBeTruthy();
  });

  it("gives the info button a real height and no main-axis flex", () => {
    useDialogStore.getState().show({ title: "Error", message: "Failed to save.", variant: "info" });
    const { getByText } = render(<GlobalDialog />);
    // The Text's parent is the TouchableOpacity carrying the button style.
    const style = buttonStyleFor(getByText("OK"));
    expect(style.height).toBe(44);
    expect(style.flex).toBeUndefined();
  });

  it("still flexes both buttons across the row for a confirm dialog", () => {
    useDialogStore.getState().show({
      title: "Sign out", message: "Are you sure?", variant: "confirm", onConfirm: () => {},
    });
    const { getByText } = render(<GlobalDialog />);
    for (const label of ["Cancel", "Confirm"]) {
      const style = buttonStyleFor(getByText(label));
      expect(style.flex).toBe(1);
      expect(style.height).toBe(44);
    }
  });
});
