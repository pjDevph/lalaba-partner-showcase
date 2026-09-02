// src/screens/settings/BranchBrandingEditor.styles.ts
// Styles for the branch branding editor sheet (logo / cover / description).

import { StyleSheet } from "react-native";
import { C, RADIUS, SP } from "../../theme/tokens";

export const brandingStyles = StyleSheet.create({
  flex1: { flex: 1 },
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.white, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SP._20, maxHeight: "92%" },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.gray200, alignSelf: "center", marginBottom: SP._16 },
  headRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: SP._12 },
  headText: { flex: 1, minWidth: 0, paddingRight: SP._12 },
  title: { fontSize: 20, fontWeight: "700", color: C.gray900 },
  subtitle: { fontSize: 13, color: C.gray500, marginTop: 2 },

  errorBanner: { flexDirection: "row", alignItems: "flex-start", gap: SP._8, backgroundColor: C.error100, borderWidth: 1, borderColor: C.error500, borderRadius: RADIUS.md, padding: SP._12, marginBottom: SP._12 },
  errorText: { flex: 1, fontSize: 13, color: C.error700, fontWeight: "600", lineHeight: 18 },

  sectionTitle: { fontSize: 13, fontWeight: "700", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: SP._8 },
  sectionTitleSpaced: { marginTop: SP._12 },
  hint: { fontSize: 12, color: C.gray400, marginBottom: SP._16, lineHeight: 16 },

  coverPicker: { borderRadius: RADIUS.lg, overflow: "hidden", marginBottom: SP._8, position: "relative" },
  coverImg: { width: "100%", height: 150 },
  coverPlaceholder: { width: "100%", height: 150, backgroundColor: C.gray100, alignItems: "center", justifyContent: "center", gap: SP._8, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: C.gray200, borderStyle: "dashed" },
  coverPlaceholderText: { fontSize: 13, color: C.gray400, fontWeight: "600" },
  coverEditBadge: { position: "absolute", bottom: SP._10, right: SP._10, width: 32, height: 32, borderRadius: RADIUS.full, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },

  logoRow: { flexDirection: "row", alignItems: "center", gap: SP._12, marginBottom: SP._8 },
  logoPicker: { width: 76, height: 76, borderRadius: RADIUS.lg, overflow: "hidden", backgroundColor: C.gray100, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: C.gray200 },
  logoImg: { width: "100%", height: "100%" },
  logoHint: { flex: 1, fontSize: 12, color: C.gray400, lineHeight: 16 },

  descInput: { height: 110, textAlignVertical: "top", marginBottom: SP._4 },

  saveBtn: { height: 48, borderRadius: RADIUS.md, backgroundColor: C.brand500, alignItems: "center", justifyContent: "center", marginTop: SP._12 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 15, fontWeight: "700", color: C.white },
  cancelBtn: { height: 48, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: C.gray200, alignItems: "center", justifyContent: "center", marginTop: SP._8 },
  cancelBtnText: { fontSize: 15, fontWeight: "600", color: C.gray600 },
});
