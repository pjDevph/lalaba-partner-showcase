// src/components/__tests__/TourOverlay.test.tsx
// RTL tests for TourOverlay — in-app product tour modal.
// Covers: null rendering, step display, button labels, step counter, callbacks.

// ── Mocks (hoisted before imports) ────────────────────────────────────────────

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// TourOverlay calls Dimensions.get() at module level (not inside a hook),
// so we must mock all of react-native to provide it before the module loads.
jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  Dimensions: {
    get: () => ({ width: 390, height: 844 }),
    addEventListener: () => ({ remove: jest.fn() }),
    removeEventListener: jest.fn(),
  },
}));

// Mock react-native-svg so SVG components render without errors in test env
jest.mock('react-native-svg', () => {
  const React = require('react');
  const View = require('react-native').View;
  const mock = (name: string) => (props: any) => React.createElement(View, { testID: name, ...props });
  return {
    __esModule: true,
    default: mock('Svg'),
    Svg: mock('Svg'),
    Path: mock('Path'),
    Line: mock('Line'),
    Polyline: mock('Polyline'),
    Rect: mock('Rect'),
    Circle: mock('Circle'),
  };
});

// Mock Animated to avoid warnings about native driver in test
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  RN.Animated.spring = () => ({ start: (cb?: () => void) => { cb?.(); }, stop: jest.fn() });
  RN.Animated.timing = () => ({ start: (cb?: () => void) => { cb?.(); }, stop: jest.fn() });
  RN.Animated.parallel = (anims: any[]) => ({
    start: (cb?: () => void) => { anims.forEach((a) => a?.start?.()); cb?.(); },
  });
  return RN;
});

jest.mock('../../stores/tourStore', () => ({ useTourStore: jest.fn() }));
jest.mock('../../data/tourContent', () => ({ TOUR_REGISTRY: {} }));

// Theme tokens — not mocked, they export plain JS objects so they work in tests.

// ── Imports ───────────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { TourOverlay } from '../tour/TourOverlay';
import { useTourStore } from '../../stores/tourStore';

const mockUseTourStore = useTourStore as unknown as jest.Mock;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockSteps = [
  { id: 'step-1', title: 'Welcome to POS', body: 'This is your POS terminal.', highlight: 'top' as const, iconName: 'layout' },
  { id: 'step-2', title: 'View Queue', body: 'See all pending orders here.', highlight: 'middle' as const, iconName: 'list' },
  { id: 'step-3', title: 'Claim Orders', body: 'Customers pick up here.', highlight: 'bottom' as const, iconName: 'check-circle' },
];

const makeStoreState = (overrides: Record<string, any> = {}) => ({
  activeTourId: 'dashboard',
  activeSteps: mockSteps,
  activeStepIndex: 0,
  nextStep: jest.fn(),
  skipTour: jest.fn(),
  hasHydrated: true,
  isTourSeen: jest.fn(() => true), // already seen → no auto-start
  startTour: jest.fn(),
  ...overrides,
});

// ══════════════════════════════════════════════════════════════════════════════
// TourOverlay tests
// ══════════════════════════════════════════════════════════════════════════════

describe('TourOverlay', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── HP: null render cases ──────────────────────────────────────────────────

  it('HP: renders null when activeTourId is null', () => {
    mockUseTourStore.mockReturnValue(makeStoreState({ activeTourId: null }));
    render(<TourOverlay tourId="dashboard" />);
    // No step content should be present
    expect(screen.queryByText('Welcome to POS')).toBeNull();
    expect(screen.queryByText('Next')).toBeNull();
  });

  it('HP: renders null when activeTourId does not match tourId prop', () => {
    // tourId="dashboard" but store has activeTourId="pos-terminal"
    mockUseTourStore.mockReturnValue(makeStoreState({ activeTourId: 'pos-terminal' }));
    render(<TourOverlay tourId="dashboard" />);
    expect(screen.queryByText('Welcome to POS')).toBeNull();
  });

  it('EC: renders null when hasHydrated is false', () => {
    // Guard: should not auto-start before AsyncStorage hydration completes.
    // activeTourId is also null in that state (store not yet resolved).
    mockUseTourStore.mockReturnValue(
      makeStoreState({ hasHydrated: false, activeTourId: null }),
    );
    render(<TourOverlay tourId="dashboard" />);
    expect(screen.queryByText('Welcome to POS')).toBeNull();
    expect(screen.queryByText('Next')).toBeNull();
  });

  // ── HP: active tour renders step content ──────────────────────────────────

  it('HP: renders step title when activeTourId matches tourId', () => {
    mockUseTourStore.mockReturnValue(makeStoreState({ activeStepIndex: 0 }));
    render(<TourOverlay tourId="dashboard" />);
    expect(screen.getByText('Welcome to POS')).toBeTruthy();
  });

  it('HP: renders step body text', () => {
    mockUseTourStore.mockReturnValue(makeStoreState({ activeStepIndex: 0 }));
    render(<TourOverlay tourId="dashboard" />);
    expect(screen.getByText('This is your POS terminal.')).toBeTruthy();
  });

  it('HP: renders second step title when activeStepIndex is 1', () => {
    mockUseTourStore.mockReturnValue(makeStoreState({ activeStepIndex: 1 }));
    render(<TourOverlay tourId="dashboard" />);
    expect(screen.getByText('View Queue')).toBeTruthy();
    expect(screen.getByText('See all pending orders here.')).toBeTruthy();
  });

  // ── HP: button label: "Next" vs "Got it" ──────────────────────────────────

  it('HP: shows "Next" button when not on last step', () => {
    mockUseTourStore.mockReturnValue(makeStoreState({ activeStepIndex: 0 }));
    render(<TourOverlay tourId="dashboard" />);
    expect(screen.getByText('Next')).toBeTruthy();
    expect(screen.queryByText('Got it')).toBeNull();
  });

  it('HP: shows "Next" button on second step (not last)', () => {
    mockUseTourStore.mockReturnValue(makeStoreState({ activeStepIndex: 1 }));
    render(<TourOverlay tourId="dashboard" />);
    expect(screen.getByText('Next')).toBeTruthy();
    expect(screen.queryByText('Got it')).toBeNull();
  });

  it('HP: shows "Got it" button on last step (activeStepIndex = steps.length - 1)', () => {
    mockUseTourStore.mockReturnValue(
      makeStoreState({ activeStepIndex: mockSteps.length - 1 }),
    );
    render(<TourOverlay tourId="dashboard" />);
    expect(screen.getByText('Got it')).toBeTruthy();
    expect(screen.queryByText('Next')).toBeNull();
  });

  // ── HP: "Skip" button always present ──────────────────────────────────────

  it('HP: shows "Skip" button on first step', () => {
    mockUseTourStore.mockReturnValue(makeStoreState({ activeStepIndex: 0 }));
    render(<TourOverlay tourId="dashboard" />);
    // There is a "Skip tour" button at the top AND a "Skip" button inside the card
    expect(screen.getByText('Skip')).toBeTruthy();
  });

  it('HP: shows "Skip" button on last step', () => {
    mockUseTourStore.mockReturnValue(
      makeStoreState({ activeStepIndex: mockSteps.length - 1 }),
    );
    render(<TourOverlay tourId="dashboard" />);
    expect(screen.getByText('Skip')).toBeTruthy();
  });

  // ── HP: step counter display ───────────────────────────────────────────────

  it('HP: shows step counter "1 / 3" on first step', () => {
    mockUseTourStore.mockReturnValue(makeStoreState({ activeStepIndex: 0 }));
    render(<TourOverlay tourId="dashboard" />);
    expect(screen.getByText('1 / 3')).toBeTruthy();
  });

  it('HP: shows step counter "2 / 3" on second step', () => {
    mockUseTourStore.mockReturnValue(makeStoreState({ activeStepIndex: 1 }));
    render(<TourOverlay tourId="dashboard" />);
    expect(screen.getByText('2 / 3')).toBeTruthy();
  });

  it('HP: shows step counter "3 / 3" on last step', () => {
    mockUseTourStore.mockReturnValue(
      makeStoreState({ activeStepIndex: mockSteps.length - 1 }),
    );
    render(<TourOverlay tourId="dashboard" />);
    expect(screen.getByText('3 / 3')).toBeTruthy();
  });

  // ── HP: button callbacks ───────────────────────────────────────────────────

  it('HP: tapping "Next" calls nextStep()', () => {
    const nextStep = jest.fn();
    mockUseTourStore.mockReturnValue(makeStoreState({ activeStepIndex: 0, nextStep }));
    render(<TourOverlay tourId="dashboard" />);
    fireEvent.press(screen.getByText('Next'));
    expect(nextStep).toHaveBeenCalledTimes(1);
  });

  it('HP: tapping "Got it" on last step calls nextStep()', () => {
    const nextStep = jest.fn();
    mockUseTourStore.mockReturnValue(
      makeStoreState({ activeStepIndex: mockSteps.length - 1, nextStep }),
    );
    render(<TourOverlay tourId="dashboard" />);
    fireEvent.press(screen.getByText('Got it'));
    expect(nextStep).toHaveBeenCalledTimes(1);
  });

  it('HP: tapping card "Skip" button calls skipTour()', () => {
    const skipTour = jest.fn();
    mockUseTourStore.mockReturnValue(makeStoreState({ activeStepIndex: 0, skipTour }));
    render(<TourOverlay tourId="dashboard" />);
    // The in-card Skip button (TouchableOpacity with text "Skip")
    fireEvent.press(screen.getByText('Skip'));
    expect(skipTour).toHaveBeenCalledTimes(1);
  });

  it('HP: tapping "Skip tour" header button calls skipTour()', () => {
    const skipTour = jest.fn();
    mockUseTourStore.mockReturnValue(makeStoreState({ activeStepIndex: 0, skipTour }));
    render(<TourOverlay tourId="dashboard" />);
    fireEvent.press(screen.getByText('Skip tour'));
    expect(skipTour).toHaveBeenCalledTimes(1);
  });

  // ── EC: single-step tour ──────────────────────────────────────────────────

  it('EC: single-step tour shows "Got it" immediately', () => {
    const singleStep = [mockSteps[0]];
    mockUseTourStore.mockReturnValue(
      makeStoreState({ activeSteps: singleStep, activeStepIndex: 0 }),
    );
    render(<TourOverlay tourId="dashboard" />);
    expect(screen.getByText('Got it')).toBeTruthy();
    expect(screen.queryByText('Next')).toBeNull();
  });

  it('EC: single-step tour shows counter "1 / 1"', () => {
    const singleStep = [mockSteps[0]];
    mockUseTourStore.mockReturnValue(
      makeStoreState({ activeSteps: singleStep, activeStepIndex: 0 }),
    );
    render(<TourOverlay tourId="dashboard" />);
    expect(screen.getByText('1 / 1')).toBeTruthy();
  });
});
