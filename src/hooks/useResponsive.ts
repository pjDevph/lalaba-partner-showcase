// Lalaba Merchant — Responsive layout hook
// Single source of truth for breakpoints + responsive page gutters/max-width.
// Use with <ResponsivePage> so every screen gets consistent, screen-aware margins.

import { useEffect, useState } from "react";
import { Dimensions, ScaledSize } from "react-native";

export type Breakpoint = "phone" | "tablet" | "desktop";

// Tablet detection uses the SHORTEST edge so orientation doesn't matter and
// large phones aren't misread as tablets (a phone's long edge can exceed 768).
const TABLET_MIN = 600;   // shortest edge — catches 7"+ tablets in any orientation
const DESKTOP_MIN = 1024; // shortest edge — large tablets / desktop windows

export interface Responsive {
  width: number;
  height: number;
  isLandscape: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  breakpoint: Breakpoint;
  /** Responsive horizontal page gutter (margin from the screen edge). */
  gutter: number;
  /** Width a single content column should cap at; it centers beyond this. */
  maxContentWidth: number;
}

function compute(screen: ScaledSize): Responsive {
  const { width, height } = screen;
  const isLandscape = width > height;
  const shortestEdge = Math.min(width, height);
  const isTablet = shortestEdge >= TABLET_MIN;
  const isDesktop = shortestEdge >= DESKTOP_MIN;
  const breakpoint: Breakpoint = isDesktop ? "desktop" : isTablet ? "tablet" : "phone";

  // Margins grow with the screen so content never hugs the edges on big devices.
  const gutter = breakpoint === "desktop" ? 32 : breakpoint === "tablet" ? 24 : 16;
  // Cap a single column so forms/cards stay readable on wide screens.
  const maxContentWidth = breakpoint === "phone" ? 480 : 460;

  return { width, height, isLandscape, isTablet, isDesktop, breakpoint, gutter, maxContentWidth };
}

/** Reactive screen metrics + responsive spacing. Re-renders on rotation/resize. */
export function useResponsive(): Responsive {
  const [state, setState] = useState<Responsive>(() => compute(Dimensions.get("screen")));

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ screen }) => setState(compute(screen)));
    return () => sub.remove();
  }, []);

  return state;
}
