// src/screens/washer/profile/profile.styles.ts
// Shared styles for the washer profile screen and its sections.

import { StyleSheet } from "react-native";
import { C, RADIUS, SP, SHADOW } from "../../../theme/tokens";

const TEAL   = C.accent500;
const TEAL_L = C.accent100;
const TEAL_D = C.accent700;

export const profileStyles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.gray50 },
  flex1:  { flex: 1 },
  scroll: { maxWidth: 880, width: "100%", alignSelf: "center", paddingHorizontal: SP._16, paddingBottom: SP._40 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  bottomSpacer: { height: SP._40 },

  // Header
  header:      { flexDirection: "row", alignItems: "center", gap: SP._8, marginBottom: SP._16 },
  headerInfo:  { flex: 1 },
  pageTitle:   { fontSize: 20, fontWeight: "800", color: C.gray900 },
  pageSub:     { fontSize: 12.5, color: C.gray500, marginTop: 2 },
  editBtn:     { borderRadius: RADIUS.md, paddingHorizontal: SP._16, paddingVertical: SP._8, backgroundColor: C.gray100 },
  editBtnSave: { backgroundColor: TEAL },
  editBtnText: { fontSize: 13, fontWeight: "700", color: C.gray700 },
  editBtnTextSave: { color: C.white },

  // Save error banner — real failure state, not a false "Saved"
  saveErrorBanner: { flexDirection: "row", alignItems: "flex-start", gap: SP._8, backgroundColor: C.error100, borderWidth: 1, borderColor: C.error500, borderRadius: RADIUS.md, padding: SP._12, marginBottom: SP._12 },
  saveErrorText:   { flex: 1, fontSize: 13, color: C.error700, fontWeight: "600", lineHeight: 18 },

  // Section
  section:      { marginBottom: SP._16 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: SP._8 },
  sectionCard:  { backgroundColor: C.white, borderRadius: RADIUS.lg, padding: SP._16, ...SHADOW.sm, gap: SP._4 },
  readOnlyAddress: { fontSize: 14, color: C.gray700, lineHeight: 20, marginBottom: SP._12 },
  psgcBusyText:    { fontSize: 12.5, color: C.gray500, marginTop: -SP._8, marginBottom: SP._12, marginLeft: SP._4 },
  fieldError:   { fontSize: 12, color: C.error700, marginTop: 2, marginBottom: SP._8 },

  // Offered services (platform catalog)
  templateRow:      { flexDirection: "row", alignItems: "center", paddingVertical: SP._10, gap: SP._10 },
  templateInfo:     { flex: 1 },
  templateName:     { fontSize: 14, fontWeight: "700", color: C.gray900 },
  templatePrice:    { fontSize: 13, color: TEAL, fontWeight: "600", marginTop: 2 },
  templateDesc:     { fontSize: 12, color: C.gray400, marginTop: 2 },
  templateEmpty:    { padding: SP._16, alignItems: "center" },
  templateEmptyText:{ fontSize: 13, color: C.gray400, textAlign: "center", lineHeight: 19 },
  templateRetryBtn: { marginTop: SP._8, borderWidth: 1.5, borderColor: TEAL, borderRadius: RADIUS.md, paddingHorizontal: SP._16, paddingVertical: SP._8 },
  templateRetryText:{ fontSize: 13, fontWeight: "700", color: TEAL },
  divider:          { height: 1, backgroundColor: C.gray100 },

  // Per-service pricing editor
  segRow:        { flexDirection: "row", gap: SP._8, marginBottom: SP._12 },
  segOpt:        { flex: 1, borderWidth: 1.5, borderColor: C.gray200, borderRadius: RADIUS.md, paddingVertical: SP._8, paddingHorizontal: SP._4, alignItems: "center" },
  segOptActive:  { borderColor: TEAL, backgroundColor: TEAL_L },
  segLabel:      { fontSize: 12.5, fontWeight: "600", color: C.gray700, textAlign: "center" },
  segLabelActive:{ color: TEAL_D },

  pricingToggle:     { flexDirection: "row", alignItems: "center", gap: 4, paddingBottom: SP._10 },
  pricingToggleText: { fontSize: 13, fontWeight: "700", color: TEAL_D },
  pricingLocked:     { fontSize: 12.5, color: C.gray500, fontStyle: "italic", paddingBottom: SP._10 },
  pricingEditor:     { backgroundColor: C.gray50, borderRadius: RADIUS.md, padding: SP._12, marginBottom: SP._12, gap: SP._4 },
  pricingHint:       { fontSize: 12, color: C.gray500, marginTop: -SP._4, marginBottom: SP._8 },

  pricingPreview:      { backgroundColor: C.white, borderRadius: RADIUS.md, padding: SP._12, marginTop: SP._8, gap: 2 },
  pricingPreviewTitle: { fontSize: 12, fontWeight: "700", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.5 },
  pricingPreviewLine:  { fontSize: 13, color: C.gray700 },
  pricingPreviewStrong:{ fontSize: 15, fontWeight: "800", color: TEAL_D, marginTop: 2 },

  pricingActions:   { flexDirection: "row", gap: SP._8, marginTop: SP._12 },
  pricingResetBtn:  { flex: 1, borderWidth: 1.5, borderColor: C.gray200, borderRadius: RADIUS.md, paddingVertical: SP._10, alignItems: "center" },
  pricingResetText: { fontSize: 13, fontWeight: "700", color: C.gray700 },
  pricingSaveBtn:   { flex: 1, backgroundColor: TEAL, borderRadius: RADIUS.md, paddingVertical: SP._10, alignItems: "center" },
  pricingSaveText:  { fontSize: 13, fontWeight: "700", color: C.white },

  // Platform note
  platformNote:     { flexDirection: "row", alignItems: "flex-start", gap: SP._6, backgroundColor: TEAL_L, borderRadius: RADIUS.sm, padding: SP._10, marginTop: SP._8 },
  platformNoteText: { flex: 1, fontSize: 12, color: TEAL_D, fontWeight: "600", lineHeight: 17 },
});
