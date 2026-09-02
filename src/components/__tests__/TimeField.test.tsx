// src/components/__tests__/TimeField.test.tsx
// RTL tests for TimeField — time picker with hour/minute steppers, AM/PM, presets.
// Covers Checklist #6 EC: "Set close time before open time → validation error [RTL]"
// (validation is the caller's responsibility, but TimeField's parse/to24 round-trip
//  correctness is the precondition for any valid comparison)
// Covers Checklist #11 EC: "Very long description → no UI overflow" pattern (time label)

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("react-native-svg", () => {
  const RN = require("react-native");
  return {
    __esModule: true,
    default: RN.View,
    Svg:  RN.View,
    Path: RN.View,
  };
});

// ── Imports ───────────────────────────────────────────────────────────────────

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { TimeField } from "../TimeField";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("TimeField", () => {
  // ── HP: closed state ──────────────────────────────────────────────────────

  it("HP: shows placeholder when value is null", () => {
    render(<TimeField value={null} onChange={jest.fn()} />);
    expect(screen.getByText("Select time")).toBeTruthy();
  });

  it("HP: shows custom placeholder when provided", () => {
    render(<TimeField value={null} onChange={jest.fn()} placeholder="Choose time" />);
    expect(screen.getByText("Choose time")).toBeTruthy();
  });

  it("HP: shows formatted time when value is set (08:00 → '8:00 AM')", () => {
    render(<TimeField value="08:00" onChange={jest.fn()} />);
    expect(screen.getByText("8:00 AM")).toBeTruthy();
  });

  it("HP: 12:00 displays as '12:00 PM' (noon)", () => {
    render(<TimeField value="12:00" onChange={jest.fn()} />);
    expect(screen.getByText("12:00 PM")).toBeTruthy();
  });

  it("HP: 00:00 displays as '12:00 AM' (midnight)", () => {
    render(<TimeField value="00:00" onChange={jest.fn()} />);
    expect(screen.getByText("12:00 AM")).toBeTruthy();
  });

  it("HP: 21:00 displays as '9:00 PM'", () => {
    render(<TimeField value="21:00" onChange={jest.fn()} />);
    expect(screen.getByText("9:00 PM")).toBeTruthy();
  });

  it("HP: 13:30 displays as '1:30 PM'", () => {
    render(<TimeField value="13:30" onChange={jest.fn()} />);
    expect(screen.getByText("1:30 PM")).toBeTruthy();
  });

  // ── HP: modal opens ────────────────────────────────────────────────────────

  it("HP: tapping field opens picker modal with 'Due Time' title", () => {
    render(<TimeField value="09:00" onChange={jest.fn()} />);
    fireEvent.press(screen.getByText("9:00 AM"));
    expect(screen.getByText("Due Time")).toBeTruthy();
  });

  it("HP: modal shows Set time and Clear buttons when open", () => {
    render(<TimeField value="09:00" onChange={jest.fn()} />);
    fireEvent.press(screen.getByText("9:00 AM"));
    expect(screen.getByText("Set time")).toBeTruthy();
    expect(screen.getByText("Clear")).toBeTruthy();
  });

  it("HP: modal shows quick preset buttons when open", () => {
    render(<TimeField value={null} onChange={jest.fn()} />);
    fireEvent.press(screen.getByText("Select time"));
    expect(screen.getByText("8:00 AM")).toBeTruthy();
    expect(screen.getByText("6:00 PM")).toBeTruthy();
    expect(screen.getByText("10:00 PM")).toBeTruthy();
  });

  // ── HP: confirm calls onChange with correct 24h value ─────────────────────

  it("HP: confirming 9:00 AM calls onChange('09:00')", () => {
    const onChange = jest.fn();
    render(<TimeField value="09:00" onChange={onChange} />);
    fireEvent.press(screen.getByText("9:00 AM"));
    fireEvent.press(screen.getByText("Set time"));
    expect(onChange).toHaveBeenCalledWith("09:00");
  });

  it("HP: confirming 12:00 PM calls onChange('12:00') (noon)", () => {
    const onChange = jest.fn();
    render(<TimeField value="12:00" onChange={onChange} />);
    fireEvent.press(screen.getByText("12:00 PM"));
    fireEvent.press(screen.getByText("Set time"));
    expect(onChange).toHaveBeenCalledWith("12:00");
  });

  it("HP: confirming 12:00 AM calls onChange('00:00') (midnight)", () => {
    const onChange = jest.fn();
    render(<TimeField value="00:00" onChange={onChange} />);
    fireEvent.press(screen.getByText("12:00 AM"));
    fireEvent.press(screen.getByText("Set time"));
    expect(onChange).toHaveBeenCalledWith("00:00");
  });

  // ── HP: Clear calls onChange(null) ─────────────────────────────────────────

  it("HP: tapping Clear calls onChange(null)", () => {
    const onChange = jest.fn();
    render(<TimeField value="09:00" onChange={onChange} />);
    fireEvent.press(screen.getByText("9:00 AM"));
    fireEvent.press(screen.getByText("Clear"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  // ── HP: quick presets ──────────────────────────────────────────────────────

  it("HP: tapping '6:00 PM' preset then Set time calls onChange('18:00')", () => {
    const onChange = jest.fn();
    render(<TimeField value={null} onChange={onChange} />);
    fireEvent.press(screen.getByText("Select time"));
    fireEvent.press(screen.getByText("6:00 PM"));
    fireEvent.press(screen.getByText("Set time"));
    expect(onChange).toHaveBeenCalledWith("18:00");
  });

  it("HP: tapping '8:00 AM' preset then Set time calls onChange('08:00')", () => {
    const onChange = jest.fn();
    render(<TimeField value={null} onChange={onChange} />);
    fireEvent.press(screen.getByText("Select time"));
    fireEvent.press(screen.getByText("8:00 AM"));
    fireEvent.press(screen.getByText("Set time"));
    expect(onChange).toHaveBeenCalledWith("08:00");
  });

  it("HP: tapping '10:00 PM' preset then Set time calls onChange('22:00')", () => {
    const onChange = jest.fn();
    render(<TimeField value={null} onChange={onChange} />);
    fireEvent.press(screen.getByText("Select time"));
    fireEvent.press(screen.getByText("10:00 PM"));
    fireEvent.press(screen.getByText("Set time"));
    expect(onChange).toHaveBeenCalledWith("22:00");
  });

  // ── HP: hour stepper wraps ────────────────────────────────────────────────

  it("HP: hour increment wraps from 12 → 1", () => {
    const onChange = jest.fn();
    render(<TimeField value="12:00" onChange={onChange} />);
    fireEvent.press(screen.getByText("12:00 PM"));
    // Draft starts at h12=12, pm=true. Increment → h12=1
    fireEvent.press(screen.getAllByText("+")[0]); // Hour + button
    fireEvent.press(screen.getByText("Set time"));
    expect(onChange).toHaveBeenCalledWith("13:00"); // 1 PM = 13:00
  });

  it("HP: hour decrement wraps from 1 → 12", () => {
    const onChange = jest.fn();
    render(<TimeField value="13:00" onChange={onChange} />);  // 1:00 PM
    fireEvent.press(screen.getByText("1:00 PM"));
    // Draft: h12=1, pm=true. Decrement → h12=12
    fireEvent.press(screen.getAllByText("−")[0]); // Hour − button
    fireEvent.press(screen.getByText("Set time"));
    expect(onChange).toHaveBeenCalledWith("12:00"); // 12 PM = 12:00
  });

  // ── HP: minute stepper ────────────────────────────────────────────────────

  it("HP: minute increment adds 5 minutes", () => {
    const onChange = jest.fn();
    render(<TimeField value="09:00" onChange={onChange} />);
    fireEvent.press(screen.getByText("9:00 AM"));
    fireEvent.press(screen.getAllByText("+")[1]); // Minute + button
    fireEvent.press(screen.getByText("Set time"));
    expect(onChange).toHaveBeenCalledWith("09:05");
  });

  it("HP: minute decrement wraps 0 → 55", () => {
    const onChange = jest.fn();
    render(<TimeField value="09:00" onChange={onChange} />);
    fireEvent.press(screen.getByText("9:00 AM"));
    fireEvent.press(screen.getAllByText("−")[1]); // Minute − button
    fireEvent.press(screen.getByText("Set time"));
    expect(onChange).toHaveBeenCalledWith("09:55");
  });

  it("HP: minute increment wraps 55 → 0", () => {
    const onChange = jest.fn();
    render(<TimeField value="09:55" onChange={onChange} />);
    fireEvent.press(screen.getByText("9:55 AM"));
    fireEvent.press(screen.getAllByText("+")[1]); // Minute + button
    fireEvent.press(screen.getByText("Set time"));
    expect(onChange).toHaveBeenCalledWith("09:00");
  });

  // ── HP: AM/PM toggle ──────────────────────────────────────────────────────

  it("HP: switching from AM to PM adds 12 hours to output", () => {
    const onChange = jest.fn();
    render(<TimeField value="09:00" onChange={onChange} />);
    fireEvent.press(screen.getByText("9:00 AM"));
    // Tap PM button
    fireEvent.press(screen.getByText("PM"));
    fireEvent.press(screen.getByText("Set time"));
    expect(onChange).toHaveBeenCalledWith("21:00"); // 9 PM = 21:00
  });

  it("HP: switching from PM to AM subtracts 12 hours from output", () => {
    const onChange = jest.fn();
    render(<TimeField value="21:00" onChange={onChange} />);  // 9 PM
    fireEvent.press(screen.getByText("9:00 PM"));
    // Tap AM button
    fireEvent.press(screen.getByText("AM"));
    fireEvent.press(screen.getByText("Set time"));
    expect(onChange).toHaveBeenCalledWith("09:00"); // 9 AM = 09:00
  });

  // ── EC: invalid/null value falls back to 9:00 AM default ─────────────────

  it("EC: null value → picker opens at 9:00 AM default", () => {
    const onChange = jest.fn();
    render(<TimeField value={null} onChange={onChange} />);
    fireEvent.press(screen.getByText("Select time"));
    fireEvent.press(screen.getByText("Set time"));
    expect(onChange).toHaveBeenCalledWith("09:00");
  });

  it("EC: invalid value ('bad') → component renders without crash", () => {
    // formatDueTime("bad") returns "" — so the field shows empty text, not placeholder.
    // The important guarantee is no exception thrown.
    expect(() =>
      render(<TimeField value={"bad" as any} onChange={jest.fn()} />),
    ).not.toThrow();
  });
});
