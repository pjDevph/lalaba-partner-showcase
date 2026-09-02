// Styles for the Register screen — extracted from app/register.tsx for readability.
import { StyleSheet } from "react-native";
import { C, RADIUS, SHADOW, SP } from "../../theme/tokens";

export const S = StyleSheet.create({
  scroll: { flexGrow: 1 },

  // ── Mobile hero header ────────────────────────────────────────────────────
  hero: {
    backgroundColor: C.brand500,
    paddingTop: 24,
    paddingBottom: 22,
    paddingHorizontal: 28,
    alignItems: "center",
    gap: 4,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: C.white,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  heroSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.82)",
    fontWeight: "500",
  },
  heroSteps: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
  },
  heroStep: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  heroStepActive: {
    width: 24,
    backgroundColor: C.white,
  },
  heroStepDone: {
    backgroundColor: "rgba(255,255,255,0.70)",
  },

  // ── Mobile form area (KAV wrapper — transparent, white lives on ScrollView) ─
  mobFormArea: { flex: 1 },
  // White sheet slides up 18px into the blue hero for a connected look
  mobScroll: {
    flex: 1,
    backgroundColor: C.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginTop: -18,
  },
  // paddingBottom is dynamic (insets.bottom + 24) — applied inline
  mobScrollContent: { paddingHorizontal: 24, paddingTop: 28 },
  // Mobile inline CTA section (replaces sticky bar)
  mobActions: { marginTop: 18 },

  // ── Mobile card override (container provides the radius / shadow) ──────────
  mobileCard: {
    width: "100%",
    maxWidth: 9999,
    borderRadius: 0,
    shadowOpacity: 0,
    elevation: 0,
  },

  // ── Mobile card wrapper (tablet portrait only) ────────────────────────────
  mobileCardWrap: {
    alignItems: "center",
    backgroundColor: C.brand500,
    paddingBottom: 24,
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    width: "92%",
    maxWidth: 420,
    backgroundColor: C.white,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 28,
    // subtle shadow
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardLandscape: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    borderRadius: 20,
  },
  cardTabletPortrait: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    borderRadius: 20,
  },

  // ── Tablet portrait layout ────────────────────────────────────────────────
  tabletPortraitScroll: {
    flexGrow: 1,
    backgroundColor: C.brand500,
  },
  tabletPortraitCardWrap: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 24,
    backgroundColor: C.brand500,
    width: "70%",
    maxWidth: 560,
    alignSelf: "center",
  },

  // ── Landscape split-pane layout (tablet + phone) ──────────────────────────
  landscapePanel: {
    width: "34%",
    backgroundColor: C.brand500,
    paddingTop: 40,
    paddingHorizontal: 32,
    paddingBottom: 32,
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  // Phone in landscape is short — widen the info panel and trim padding so the
  // left column reads cleanly without crowding the form.
  landscapePanelSmall: {
    width: "40%",
    paddingTop: 20,
    paddingHorizontal: 22,
    paddingBottom: 20,
  },
  panelAppName: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.70)",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 12,
  },
  panelAppNameSmall: {
    marginTop: 6,
    marginBottom: 8,
  },
  panelTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: C.white,
    letterSpacing: -0.5,
    lineHeight: 34,
    marginBottom: 8,
  },
  panelTitleSmall: {
    fontSize: 20,
    lineHeight: 26,
    marginBottom: 6,
  },
  panelSub: {
    fontSize: 13,
    color: "rgba(255,255,255,0.70)",
    fontWeight: "500",
    lineHeight: 20,
    marginBottom: 28,
  },
  panelSubSmall: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 16,
  },
  panelStepList: {
    gap: 14,
    flex: 1,
  },
  panelStepListSmall: {
    gap: 10,
  },
  panelStepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  panelStepBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.20)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  panelStepBubbleDone: {
    backgroundColor: "rgba(255,255,255,0.90)",
    borderColor: "rgba(255,255,255,0.90)",
  },
  panelStepBubbleActive: {
    backgroundColor: C.white,
    borderColor: C.white,
  },
  panelStepNum: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.70)",
  },
  panelStepNumActive: {
    color: C.brand500,
  },
  panelStepLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(255,255,255,0.60)",
  },
  panelStepLabelActive: {
    color: C.white,
    fontWeight: "700",
  },
  panelSupport: {
    marginTop: 28,
  },
  panelSupportSmall: {
    marginTop: 14,
  },
  panelSupportText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    fontWeight: "500",
  },
  landscapeScroll: {
    flexGrow: 1,
    padding: 32,
    alignItems: "center",
  },
  landscapeScrollSmall: {
    padding: 20,
  },

  // ── Compact stepper ───────────────────────────────────────────────────────
  stepper: {
    marginBottom: 20,
  },
  stepperDots: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  stepperDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.gray200,
  },
  stepperDotActive: {
    backgroundColor: C.brand500,
    width: 24,
  },
  stepperDotDone: {
    backgroundColor: C.brand300,
  },
  stepperText: {
    fontSize: 12,
    color: C.gray500,
  },
  stepperLabel: {
    fontWeight: "700",
    color: C.gray700,
  },

  // ── Step title / subtitle ─────────────────────────────────────────────────
  stepTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: C.gray900,
    marginBottom: 4,
  },
  stepSub: {
    fontSize: 13,
    color: C.gray500,
    marginBottom: 20,
    lineHeight: 19,
  },

  // ── Two-column grid (tablet landscape) ───────────────────────────────────
  gridRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 0,
  },
  gridCell: {
    flex: 1,
  },

  // ── Field ─────────────────────────────────────────────────────────────────
  fieldWrap: {
    marginBottom: SP._16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: C.gray700,
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  fieldInputWrap: {
    position: "relative",
  },
  fieldInput: {
    borderWidth: 1.3,
    borderColor: C.gray200,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: C.gray900,
    backgroundColor: C.white,
  },
  fieldInputFocused: {
    borderColor: C.brand500,
    backgroundColor: C.white,
    shadowColor: C.brand500,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  fieldInputError: {
    borderColor: C.error500,
    backgroundColor: "#fffafa",
  },
  fieldError: {
    fontSize: 11,
    color: C.error500,
    marginTop: 5,
  },
  fieldSuccess: {
    fontSize: 11,
    color: C.success700,
    marginTop: 5,
    fontWeight: "600",
  },
  fieldHint: {
    fontSize: 11,
    color: C.gray500,
    marginTop: 5,
    lineHeight: 16,
  },
  eyeBtn: {
    position: "absolute",
    right: 8,
    top: 5,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
    zIndex: 2,
  },

  // ── Service chips ─────────────────────────────────────────────────────────
  chipHint: {
    fontSize: 11,
    color: C.gray400,
    marginBottom: 10,
    marginTop: 2,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.3,
    borderColor: C.gray200,
    backgroundColor: C.white,
  },
  chipSelected: {
    backgroundColor: C.brand500,
    borderColor: C.brand500,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: C.gray700,
  },
  chipTextSelected: {
    color: C.white,
  },

  // ── Review sections (Step 3) ─────────────────────────────────────────────
  reviewSection: {
    backgroundColor: C.gray50,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.gray100,
  },
  reviewSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  reviewSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: C.gray500,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  reviewEditLink: {
    fontSize: 13,
    fontWeight: "700",
    color: C.brand500,
  },
  reviewItem: {
    fontSize: 14,
    color: C.gray800,
    lineHeight: 22,
  },

  // ── Agree row ─────────────────────────────────────────────────────────────
  agreeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SP._10,
    marginBottom: SP._14,
  },
  agreeText: {
    flex: 1,
    fontSize: 13,
    color: C.gray700,
    lineHeight: 20,
  },
  agreeLink: {
    color: C.brand500,
    fontWeight: "700",
  },
  agreeRowDisabled: {
    opacity: 0.5,
  },
  agreeTextDimmed: {
    color: C.gray400,
  },
  agreeHint: {
    fontSize: 11,
    color: C.brand500,
    marginTop: 2,
  },
  agreeCaveat: {
    fontSize: 11,
    color: C.gray500,
    lineHeight: 17,
    marginTop: SP._8,
    marginBottom: SP._20,
  },

  // ── Card footer CTA (tablet) ─────────────────────────────────────────────
  cardFooter: {
    marginTop: 24,
  },
  cardFooterLine: {
    height: 1,
    backgroundColor: C.gray100,
    marginBottom: 20,
  },
  cardFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardBackBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  cardBackText: {
    fontSize: 14,
    fontWeight: "700",
    color: C.brand500,
  },
  cardCtaBtn: {
    flex: 1,
    maxWidth: 300,
    height: 52,
    borderRadius: 14,
    backgroundColor: C.brand500,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.brand,
  },

  // ── Sticky CTA bar ────────────────────────────────────────────────────────
  stickyBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stickyCtaFlex: {
    flex: 1,
  },
  stickyBar: {
    backgroundColor: C.white,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: C.gray100,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },

  // ── CTA button ────────────────────────────────────────────────────────────
  cta: {
    height: 52,
    borderRadius: 16,
    backgroundColor: C.brand500,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.brand,
  },
  ctaDisabled: {
    backgroundColor: C.gray300,
    shadowOpacity: 0,
    elevation: 0,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: "800",
    color: C.white,
    letterSpacing: -0.2,
  },

  // ── Back / sign-in rows ───────────────────────────────────────────────────
  backRow: {
    alignItems: "center",
    paddingVertical: SP._14,
  },
  backText: {
    fontSize: 14,
    fontWeight: "700",
    color: C.brand500,
  },
  signinRow: {
    alignItems: "center",
    paddingVertical: 18,
    marginTop: SP._4,
  },
  signinText: {
    fontSize: 13,
    color: C.gray600,
  },
  signinLink: {
    color: C.brand500,
    fontWeight: "800",
  },

  // ── Google button ─────────────────────────────────────────────────────────
  socialHint: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    color: C.gray500,
    marginTop: SP._16,
    marginBottom: SP._8,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SP._12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.gray200,
  },
  dividerText: {
    fontSize: 12,
    color: C.gray400,
    marginHorizontal: 12,
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.3,
    borderColor: C.gray200,
    backgroundColor: C.white,
  },
  googleBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: C.gray800,
  },
  appleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.3,
    borderColor: C.gray200,
    backgroundColor: C.white,
    marginTop: SP._12,
  },
  appleBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: C.gray800,
  },

  // ── Setup prompt modal ────────────────────────────────────────────────────
  promptSafe: {
    flex: 1,
    backgroundColor: C.white,
  },
  promptContent: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 60,
    paddingBottom: 40,
    alignItems: "center",
  },
  promptIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.brand50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  promptTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: C.gray900,
    letterSpacing: -0.5,
    marginBottom: 12,
    textAlign: "center",
  },
  promptSub: {
    fontSize: 15,
    color: C.gray600,
    lineHeight: 23,
    textAlign: "center",
    marginBottom: 16,
  },
  promptNote: {
    fontSize: 12,
    color: C.gray400,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 40,
    paddingHorizontal: 8,
  },
  promptCta: {
    width: "100%",
    height: 54,
    borderRadius: 16,
    backgroundColor: C.brand500,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    ...SHADOW.brand,
  },
  promptCtaText: {
    fontSize: 16,
    fontWeight: "700",
    color: C.white,
    letterSpacing: -0.2,
  },
  promptSkip: {
    paddingVertical: 14,
    alignItems: "center",
  },
  promptSkipText: {
    fontSize: 14,
    fontWeight: "600",
    color: C.gray500,
  },

  // ── Registration success full-screen ─────────────────────────────────────
  successSafe: {
    flex: 1,
    backgroundColor: C.brand500,
  },
  successScroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  successIconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  successTitle: {
    fontSize: 30,
    fontWeight: "800",
    color: C.white,
    letterSpacing: -0.8,
    textAlign: "center",
    marginBottom: 14,
    lineHeight: 36,
  },
  successSub: {
    fontSize: 15,
    color: "rgba(255,255,255,0.85)",
    lineHeight: 23,
    textAlign: "center",
    marginBottom: 40,
  },
  successCta: {
    width: "100%",
    height: 54,
    borderRadius: 16,
    backgroundColor: C.white,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  successCtaText: {
    fontSize: 16,
    fontWeight: "800",
    color: C.brand500,
    letterSpacing: -0.2,
  },
  successSkip: {
    paddingVertical: 14,
    alignItems: "center",
  },
  successSkipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.75)",
  },
  successNote: {
    marginTop: 24,
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    lineHeight: 18,
  },

  // ── Registration success — tablet landscape card variant ──────────────────
  successScrollTablet: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  successCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: C.white,
    borderRadius: 24,
    paddingHorizontal: 36,
    paddingVertical: 40,
    alignItems: "center",
    ...SHADOW.lg,
  },
  successCardIconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.brand50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  successCardTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: C.gray900,
    letterSpacing: -0.6,
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 32,
  },
  successCardSub: {
    fontSize: 14,
    color: C.gray500,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 32,
  },
  successCardCta: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    backgroundColor: C.brand500,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    ...SHADOW.brand,
  },
  successCardCtaText: {
    fontSize: 15,
    fontWeight: "800",
    color: C.white,
    letterSpacing: -0.2,
  },
  successCardSkipText: {
    fontSize: 14,
    fontWeight: "600",
    color: C.gray400,
    paddingVertical: 10,
  },
  successCardNote: {
    marginTop: 16,
    fontSize: 11,
    color: C.gray300,
    textAlign: "center",
    lineHeight: 16,
  },

  // ── Legal modal ───────────────────────────────────────────────────────────
  legalSafe: {
    flex: 1,
    backgroundColor: C.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  legalCard: {
    width: "100%",
    maxWidth: 680,
    flex: 1,
    backgroundColor: C.white,
    borderRadius: 16,
    overflow: "hidden",
    alignSelf: "center",
    marginVertical: 0,
  },
  legalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
  },
  legalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: C.gray900,
  },
  legalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  legalFooter: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: C.gray100,
    backgroundColor: C.white,
  },
  legalAgreeBtn: {
    height: 50,
    borderRadius: 12,
    backgroundColor: C.brand500,
    alignItems: "center",
    justifyContent: "center",
  },
  legalAgreeBtnDisabled: {
    backgroundColor: C.gray100,
  },
  legalAgreeBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: C.white,
  },
  legalAgreeBtnTextDisabled: {
    color: C.gray400,
  },
  legalScroll: {
    flex: 1,
  },
  legalContent: {
    padding: 24,
    paddingBottom: 48,
  },
  legalMeta: {
    fontSize: 11,
    color: C.gray400,
    marginBottom: 16,
  },
  legalSection: {
    fontSize: 14,
    fontWeight: "700",
    color: C.gray900,
    marginTop: 20,
    marginBottom: 6,
  },
  legalBody: {
    fontSize: 13,
    color: C.gray600,
    lineHeight: 21,
  },
  legalBold: {
    fontWeight: "700",
    color: C.gray800,
  },
  legalUpdated: {
    fontSize: 11,
    color: C.gray400,
    marginTop: 32,
    textAlign: "center",
  },
});
