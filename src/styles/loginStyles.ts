// Login screen styles — extracted from app/login.tsx to keep the screen lean.
// Three size tiers: base (phone portrait), `*Big` (tablet), `*Small` (phone landscape).

import { StyleSheet } from "react-native";
import { C, SHADOW } from "../theme/tokens";

export const S = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.brand500 },
  flex: { flex: 1 },

  // ── Field ──────────────────────────────────────────────────────────────────
  fieldWrap:       { marginBottom: 16 },
  fieldLabelRow:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  fieldLabel:      { fontSize: 13, fontWeight: "600", color: C.gray700 },
  fieldInputWrap:  { position: "relative" },
  fieldInput: {
    height: 48,
    borderWidth: 1.5,
    borderColor: C.gray200,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: C.gray900,
    backgroundColor: C.gray50,
  },
  fieldInputFocused: {
    borderColor: C.brand500,
    backgroundColor: C.white,
    shadowColor: C.brand500,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  fieldInputError: {
    borderColor: C.error500,
    backgroundColor: "#FFF5F5",
  },
  fieldError: {
    fontSize: 12,
    color: C.error500,
    marginTop: 4,
    marginLeft: 2,
  },
  eyeBtn: { position: "absolute", right: 14, top: 0, bottom: 0, justifyContent: "center", padding: 4, zIndex: 10, elevation: 3 },

  // ── Copy ──────────────────────────────────────────────────────────────────
  forgotText: { fontSize: 13, fontWeight: "600", color: C.brand500 },

  cardTitle: { fontSize: 28, fontWeight: "800", color: C.gray900, letterSpacing: -0.5, marginBottom: 6 },
  cardSub:   { fontSize: 15, color: C.gray500, marginBottom: 24, lineHeight: 21 },

  // ── Banners ───────────────────────────────────────────────────────────────
  errorBanner:   { backgroundColor: "#FEE2E2", borderRadius: 10, padding: 12, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: C.error500 },
  errorText:     { fontSize: 13, color: C.error700, lineHeight: 18 },
  successBanner: { backgroundColor: "#DCFCE7", borderRadius: 10, padding: 12, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: "#16A34A" },
  successText:   { fontSize: 13, color: "#15803D", lineHeight: 18, fontWeight: "600" },

  // ── Sign in button ─────────────────────────────────────────────────────────
  signInBtn:         { height: 50, borderRadius: 12, backgroundColor: C.brand500, alignItems: "center", justifyContent: "center", marginTop: 4, ...SHADOW.brand },
  signInBtnDisabled: { backgroundColor: C.gray300, shadowOpacity: 0, elevation: 0 },
  signInBtnText:     { color: C.white, fontSize: 16, fontWeight: "700", letterSpacing: -0.2 },
  signInBtnTextDisabled: { color: C.gray500 },

  // ── Remember device ────────────────────────────────────────────────────────
  checkboxRow:        { flexDirection: "row", alignItems: "center", marginTop: 14 },
  checkboxBox:        { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: C.gray300, backgroundColor: C.white, alignItems: "center", justifyContent: "center", marginRight: 10 },
  checkboxBoxChecked: { backgroundColor: C.brand500, borderColor: C.brand500 },
  checkboxLabel:      { fontSize: 13, color: C.gray600 },

  // ── Divider ────────────────────────────────────────────────────────────────
  divider:     { flexDirection: "row", alignItems: "center", marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.gray200 },
  dividerText: { fontSize: 12, color: C.gray400, marginHorizontal: 12 },

  // ── Social buttons ─────────────────────────────────────────────────────────
  googleBtn:     { height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: C.gray200, backgroundColor: C.white, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  googleBtnText: { fontSize: 15, fontWeight: "600", color: C.gray800 },
  appleBtn:      { height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: C.gray200, backgroundColor: C.white, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 10 },
  appleBtnText:  { fontSize: 15, fontWeight: "600", color: C.gray800 },

  // ── Register / support links ───────────────────────────────────────────────
  registerRow:      { alignItems: "center", marginTop: 16 },
  registerText:     { fontSize: 13, color: C.gray500 },
  registerLink:     { color: C.brand500, fontWeight: "700" },
  registerTextDark: { fontSize: 13, color: "rgba(255,255,255,0.75)" },
  registerLinkDark: { color: C.white, fontWeight: "700" },

  supportRow:      { alignItems: "center", marginTop: 12 },
  supportText:     { fontSize: 12, color: C.gray400 },
  supportLink:     { color: C.brand500, fontWeight: "600" },
  supportTextDark: { fontSize: 12, color: "rgba(255,255,255,0.55)" },
  supportLinkDark: { color: "rgba(255,255,255,0.85)", fontWeight: "600" },

  // ── Version footer ─────────────────────────────────────────────────────────
  versionText: {
    textAlign: "center",
    fontSize: 11,
    color: C.gray300,
    marginTop: 12,
    marginBottom: 4,
  },

  // ── Tablet landscape ───────────────────────────────────────────────────────
  lsRoot:  { flex: 1, flexDirection: "row" },
  lsBrand: {
    width: "40%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingVertical: 40,
    backgroundColor: C.brand500,
  },
  lsLogo:       { width: 260, height: 260, tintColor: C.white, marginBottom: 20 },
  lsTagline:    { fontSize: 28, fontWeight: "800", color: C.white, textAlign: "center", lineHeight: 36, letterSpacing: -0.5, marginBottom: 10 },
  lsTaglineSub: { fontSize: 16, color: "rgba(255,255,255,0.88)", textAlign: "center", lineHeight: 23 },
  statStack: { width: "100%", marginTop: 28, gap: 10 },
  statCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  statIcon:  { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  statInfo:  {},
  statValue: { fontSize: 16, fontWeight: "700", color: C.white, letterSpacing: -0.3 },
  statLabel: { fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 1 },

  lsPanel:        { flex: 1, backgroundColor: C.white },
  lsPanelContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 32 },
  lsCard:         { width: 480, maxWidth: "100%" },

  // ── Tablet portrait ──────────────────────────────────────────────────────
  // Card fills the screen (minus ResponsivePage `fill` margins); the form is
  // centered within it at a readable width.
  tpCard: {
    flex: 1,
    width: "100%",
    backgroundColor: C.white,
    borderRadius: 24,
    paddingHorizontal: 32,
    paddingVertical: 32,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.lg,
  },
  tpFormWrap: {
    width: "100%",
    maxWidth: 520,
  },
  tpLogo: {
    width: 200,
    height: 200,
    tintColor: C.brand500,
    alignSelf: "center",
    marginBottom: 20,
  },

  // ── Tablet portrait — enlarged form (GCash-style) ──────────────────────────
  fieldWrapBig:     { marginBottom: 24 },
  fieldLabelBig:    { fontSize: 16 },
  fieldInputBig:    { height: 62, fontSize: 18, paddingHorizontal: 18, borderRadius: 14 },
  forgotTextBig:    { fontSize: 15 },
  signInBtnBig:     { height: 62 },
  signInBtnTextBig: { fontSize: 19 },
  checkboxLabelBig: { fontSize: 15 },
  dividerTextBig:   { fontSize: 14 },
  googleBtnBig:     { height: 60 },
  googleBtnTextBig: { fontSize: 17 },
  appleBtnBig:      { height: 60 },
  appleBtnTextBig:  { fontSize: 17 },

  // ── Phone landscape — shrunk form (short screen) ───────────────────────────
  fieldWrapSmall:     { marginBottom: 12 },
  fieldLabelSmall:    { fontSize: 12 },
  fieldInputSmall:    { height: 42, fontSize: 14, paddingHorizontal: 14, borderRadius: 10 },
  forgotTextSmall:    { fontSize: 12 },
  signInBtnSmall:     { height: 44, marginTop: 2 },
  signInBtnTextSmall: { fontSize: 15 },
  checkboxRowSmall:   { marginTop: 10 },
  checkboxLabelSmall: { fontSize: 12 },
  dividerSmall:       { marginVertical: 12 },
  dividerTextSmall:   { fontSize: 11 },
  googleBtnSmall:     { height: 44 },
  googleBtnTextSmall: { fontSize: 14 },
  appleBtnSmall:      { height: 44, marginTop: 8 },
  appleBtnTextSmall:  { fontSize: 14 },
  cardTitleSmall:     { fontSize: 18, marginBottom: 2 },
  cardSubSmall:       { fontSize: 12, marginBottom: 16, lineHeight: 16 },
  lsBrandSmall:       { paddingHorizontal: 20, paddingVertical: 16 },
  lsLogoSmall:        { width: 120, height: 120, marginBottom: 0 },
  lsTaglineSmall:     { fontSize: 18, lineHeight: 24, marginBottom: 4 },
  lsTaglineSubSmall:  { fontSize: 12, lineHeight: 17 },
  lsPanelContentSmall:{ paddingVertical: 20, paddingHorizontal: 24 },
  statStackSmall:     { marginTop: 16, gap: 8 },
  statCardSmall:      { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, gap: 10 },
  statIconSmall:      { width: 30, height: 30, borderRadius: 8 },
  statValueSmall:     { fontSize: 14 },
  statLabelSmall:     { fontSize: 10 },

  // ── Mobile ─────────────────────────────────────────────────────────────────
  mobBrand: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 28,
    paddingBottom: 28,
    gap: 4,
  },
  mobBrandCompact: { paddingTop: 16, paddingBottom: 16 },
  mobLogo:    { width: 160, height: 160, tintColor: C.white, marginBottom: 8 },
  mobLogoCompact: { width: 124, height: 124, marginBottom: 4 },
  mobTagline: { fontSize: 12, color: "rgba(255,255,255,0.72)", letterSpacing: 0.2, marginTop: 2 },
  mobTitle:   { fontSize: 20, fontWeight: "800", color: C.gray900, letterSpacing: -0.4, marginBottom: 4 },
  mobSub:     { fontSize: 13, color: C.gray500, marginBottom: 20, lineHeight: 18 },
  mobSheet: {
    flex: 1,
    backgroundColor: C.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  mobSheetContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
  },
  // Flexible gap that expands to push footer links to the bottom; collapses on
  // short screens so content can still scroll instead of clipping.
  mobSpacer: { flex: 1, minHeight: 16 },
});
