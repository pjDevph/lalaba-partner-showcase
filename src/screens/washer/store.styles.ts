// src/screens/washer/store.styles.ts
// Styles for the washer Online Store screen (app/(washer)/store.tsx).

import { StyleSheet } from "react-native";
import { C, RADIUS, SP } from "../../theme/tokens";

const TEAL   = C.accent500;
const TEAL_L = C.accent100;
const TEAL_D = C.accent700;

export const storeStyles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.gray50 },
  flex1:  { flex: 1 },
  scroll: { paddingHorizontal: SP._16, paddingBottom: SP._40 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  bottomSpacer: { height: SP._40 },

  backBtn:  { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: SP._8 },
  backText: { fontSize: 15, color: TEAL, fontWeight: "600" },

  pageTitle: { fontSize: 24, fontWeight: "700", color: C.gray900, marginBottom: 4 },
  pageSub:   { fontSize: 14, color: C.gray500, lineHeight: 20, marginBottom: SP._20 },

  sectionTitle:  { fontSize: 14, fontWeight: "700", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: SP._8 },
  sectionTitleSpaced: { marginTop: SP._16 },

  // Save failure — real error state, not a false "Saved"
  saveErrorBanner: { flexDirection: "row", alignItems: "flex-start", gap: SP._8, backgroundColor: C.error100, borderWidth: 1, borderColor: C.error500, borderRadius: RADIUS.md, padding: SP._12, marginBottom: SP._12 },
  saveErrorText:   { flex: 1, fontSize: 13, color: C.error700, fontWeight: "600", lineHeight: 18 },

  // Cover photo
  coverPickerWrap:  { borderRadius: RADIUS.lg, overflow: "hidden", marginBottom: SP._8, position: "relative" },
  coverImg:         { width: "100%", height: 180 },
  coverPlaceholder: { width: "100%", height: 180, backgroundColor: C.gray100, alignItems: "center", justifyContent: "center", gap: SP._8, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: C.gray200, borderStyle: "dashed" },
  coverPlaceholderText: { fontSize: 13, color: C.gray400, fontWeight: "600" },
  coverEditBadge:   { position: "absolute", bottom: SP._10, right: SP._10, width: 34, height: 34, borderRadius: RADIUS.full, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  coverHint:        { fontSize: 12, color: C.gray400, marginBottom: SP._16, lineHeight: 16 },

  // Logo
  logoRow:       { flexDirection: "row", alignItems: "center", gap: SP._12, marginBottom: SP._8 },
  logoPicker:    { width: 84, height: 84, borderRadius: RADIUS.lg, overflow: "hidden", backgroundColor: C.gray100, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: C.gray200 },
  logoImg:       { width: "100%", height: "100%" },
  logoHint:      { flex: 1, fontSize: 12, color: C.gray400, lineHeight: 16 },

  // Description
  descInput: { height: 120, textAlignVertical: "top", marginBottom: SP._4 },

  // Action row
  actionRow:       { flexDirection: "row", gap: SP._10, marginTop: SP._16 },
  previewBtn:      { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SP._8, borderWidth: 1.5, borderColor: TEAL, borderRadius: RADIUS.lg, height: 48 },
  previewBtnText:  { fontSize: 14, fontWeight: "700", color: TEAL },
  saveBtn:         { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: TEAL, borderRadius: RADIUS.lg, height: 48 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText:     { fontSize: 14, fontWeight: "700", color: C.white },
});

export const storePreviewStyles = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: C.gray50 },
  scroll:      { flex: 1 },
  topBar:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.white, paddingHorizontal: SP._16, paddingBottom: SP._12, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  closeBtn:    { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  previewLabel:{ fontSize: 14, fontWeight: "700", color: C.gray700 },

  cover:            { height: 200, backgroundColor: C.gray100 },
  coverImg:         { width: "100%", height: "100%" },
  coverPlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: C.gray100 },
  logoInset:        { position: "absolute", bottom: -24, left: SP._16, width: 56, height: 56, borderRadius: RADIUS.lg, borderWidth: 2, borderColor: C.white, backgroundColor: TEAL_L, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  logoInsetImg:     { width: "100%", height: "100%" },
  logoInsetText:    { fontSize: 18, fontWeight: "800", color: TEAL_D },

  body: { padding: SP._16, paddingTop: SP._24 + 8 },

  name:     { fontSize: 22, fontWeight: "700", color: C.gray900, marginBottom: 2 },
  location: { fontSize: 13, color: C.gray500, marginBottom: SP._8 },

  ratingRow: { flexDirection: "row", alignItems: "center", gap: SP._4, marginBottom: SP._12 },
  ratingText:{ fontSize: 14, fontWeight: "700", color: C.gray800 },
  ratingCount:{ fontSize: 12, color: C.gray400, fontWeight: "400" },

  section:      { marginBottom: SP._16 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: SP._8 },
  descText:     { fontSize: 14, color: C.gray700, lineHeight: 21 },

  ctaWrap:    { marginTop: SP._8, alignItems: "center" },
  ctaBtn:     { width: "100%", backgroundColor: C.gray200, borderRadius: RADIUS.lg, height: 52, alignItems: "center", justifyContent: "center", marginBottom: SP._8 },
  ctaBtnText: { fontSize: 16, fontWeight: "700", color: C.gray500 },
  ctaNote:    { fontSize: 12, color: C.gray400, textAlign: "center" },
});
