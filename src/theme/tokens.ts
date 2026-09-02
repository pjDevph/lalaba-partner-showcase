// Lalaba Merchant App — Design Tokens
// Matches customer app design system exactly

export const C = {
  // Brand — vivid sky blue (matches app icon)
  brand50:  '#E6F7FE',
  brandSoft: '#D0F0FD',
  brand100: '#AADFFA',
  brand200: '#72C9F6',
  brand300: '#2CB2F2',
  brand400: '#00A0E9',
  brand500: '#00AEEF',  // primary — vivid icon blue
  brand600: '#0088CC',  // pressed
  brand700: '#0066A0',
  brand800: '#004878',
  brand900: '#002E52',

  // Accent — teal
  accent100: '#DBF3F0',
  accent500: '#0EA5A4',
  accent700: '#087575',

  // ─── Partner App design-board role accents (exact hexes from the DS frames) ───
  // Home washer — unified onto the brand blue (was a standalone sea-green teal
  // sub-brand; dropped 2026-08-21 so the washer POV matches everywhere else).
  // Kept as its own token name (not a raw alias) since 45+ call sites across
  // 18 files key off `C.washer*` — changing the values here cascades to all
  // of them without touching call sites.
  washer100: '#E6F7FE', // = brand50
  washer300: '#72C9F6', // = brand200
  washer500: '#00AEEF', // = brand500
  washer700: '#0066A0', // = brand700

  // Courier / delivery staff — sky ("Courier staff dashboard" frame 27)
  courier100: '#EAF3FF',
  courier200: '#DBEAFE',
  courier500: '#0284C7',
  courier700: '#1D4ED8',

  // Neutrals
  gray50:  '#F8FAFC',
  gray100: '#F1F5F9',
  gray200: '#E2E8F0',
  gray300: '#CBD5E1',
  gray400: '#94A3B8',
  gray500: '#64748B',
  gray600: '#475569',
  gray700: '#334155',
  gray800: '#1E293B',
  gray900: '#0F172A',

  // Semantic
  success100: '#D1FAE5',
  success500: '#10B981',
  success700: '#047857',
  warning100: '#FEF3C7',
  warning300: '#FCD34D',
  warning500: '#F59E0B',
  warning600: '#D97706',
  warning700: '#B45309',
  error100:   '#FEE2E2',
  error500:   '#EF4444',
  error700:   '#B91C1C',
  info100:    '#DBEAFE',
  info500:    '#3B82F6',

  white: '#FFFFFF',

  // Purple — role / owner chips
  purple100: '#EDE9FE',
  purple700: '#6D28D9',
} as const;

// Shadow helpers for RN (use elevation + shadowColor)
export const SHADOW = {
  xs: {
    shadowColor: '#0F283C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  sm: {
    shadowColor: '#0F283C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: '#0F283C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  lg: {
    shadowColor: '#0F283C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 8,
  },
  brand: {
    shadowColor: '#00AEEF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 6,
  },
} as const;

export const RADIUS = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

export const FONT = {
  sans: undefined, // system default (Inter on most devices)
} as const;

// ─── Spacing ──────────────────────────────────────────────────────────────────
// Used across all screens for consistent padding/gap/margin
export const SP = {
  _2:  2,
  _4:  4,
  _6:  6,
  _8:  8,
  _10: 10,
  _12: 12,
  _14: 14,
  _16: 16,
  _20: 20,
  _24: 24,
  _28: 28,
  _32: 32,
  _40: 40,
  _48: 48,
} as const;

// ─── Component Presets ────────────────────────────────────────────────────────
// Shared style patterns that mirror the customer app design system.
// Import these in any screen that needs a CTA button, form field, or status banner.

export const COMP = {
  // Primary CTA — tall brand-blue full-width button (customer app standard)
  ctaBtn: {
    height: 52,
    borderRadius: RADIUS.lg,      // 16 — matches customer app 14-16px
    backgroundColor: C.brand500,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    width: "100%" as any,
    ...SHADOW.brand,
  },
  ctaBtnText: {
    color: C.white,
    fontSize: 16,
    fontWeight: "700" as const,
    letterSpacing: -0.2,
  },

  // Secondary CTA — white bg, brand border
  ctaBtnSecondary: {
    height: 52,
    borderRadius: RADIUS.lg,
    backgroundColor: C.white,
    borderWidth: 1.5,
    borderColor: C.brand500,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    width: "100%" as any,
  },
  ctaBtnSecondaryText: {
    color: C.brand600,
    fontSize: 16,
    fontWeight: "700" as const,
    letterSpacing: -0.2,
  },

  // Inline action button (header pill, modal save, etc.) — smaller
  pillBtn: {
    backgroundColor: C.brand500,
    paddingHorizontal: SP._16,
    paddingVertical: SP._8,
    borderRadius: RADIUS.md,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    minWidth: 64,
  },
  pillBtnText: {
    color: C.white,
    fontSize: 13,
    fontWeight: "700" as const,
  },

  // Form field — customer app style: white bg, gray border, rounded
  field: {
    borderWidth: 1.5,
    borderColor: C.gray200,
    borderRadius: RADIUS.md,      // 12 — matches customer app field radius
    paddingHorizontal: SP._16,
    paddingVertical: SP._14,
    fontSize: 15,
    color: C.gray900,
    backgroundColor: C.white,
  },
  fieldFocused: {
    borderColor: C.brand500,
    backgroundColor: C.white,
    // iOS shadow ring — approximates focus glow from customer app
    shadowColor: C.brand100,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 5,
    elevation: 0,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: C.gray700,
    marginBottom: 6,
  },

  // Status banner — full-width colored strip for order states
  // Usage: <View style={[COMP.statusBanner, COMP.statusBannerColor[order.status]]} />
  statusBanner: {
    paddingVertical: SP._14,
    paddingHorizontal: SP._16,
    borderRadius: RADIUS.md,
    width: "100%" as any,
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: SP._8,
  },
  statusBannerColor: {
    CREATED:          { backgroundColor: C.warning100, borderColor: C.warning500, borderWidth: 1 },
    PROCESSING:       { backgroundColor: C.info100,    borderColor: C.info500,    borderWidth: 1 },
    READY_FOR_PICKUP: { backgroundColor: C.brand100,   borderColor: C.brand500,   borderWidth: 1 },
    CLAIMED:          { backgroundColor: C.success100, borderColor: C.success500, borderWidth: 1 },
  } as Record<string, object>,
  statusBannerText: {
    CREATED:          { color: C.warning700 },
    PROCESSING:       { color: C.info500 },
    READY_FOR_PICKUP: { color: C.brand700 },
    CLAIMED:          { color: C.success700 },
  } as Record<string, object>,
} as const;
