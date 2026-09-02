// src/screens/wallet/TopUpSheet.styles.ts
// Styles for the shared secure top-up sheet (merchant + washer wallets).

import { StyleSheet } from "react-native";
import { C, RADIUS, SP } from "../../theme/tokens";

export const topUpStyles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", alignItems: "center", justifyContent: "center", padding: SP._24 },
  card: { backgroundColor: C.white, borderRadius: 20, padding: SP._20, width: "100%", maxWidth: 380, gap: SP._12 },
  headRow: { flexDirection: "row", alignItems: "center" },
  title: { fontSize: 18, fontWeight: "800", color: C.gray900 },
  spacer: { flex: 1 },
  sub: { fontSize: 13, color: C.gray600 },

  errorBanner: { flexDirection: "row", alignItems: "flex-start", gap: SP._8, backgroundColor: C.error100, borderWidth: 1, borderColor: C.error500, borderRadius: RADIUS.md, padding: SP._12 },
  errorText: { flex: 1, fontSize: 13, color: C.error700, fontWeight: "600", lineHeight: 18 },

  presetRow: { flexDirection: "row", gap: SP._8 },
  preset: { flex: 1, alignItems: "center", paddingVertical: SP._12, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: C.gray200, backgroundColor: C.white },
  presetText: { fontSize: 15, fontWeight: "800", color: C.gray800 },

  customLabel: { fontSize: 12, fontWeight: "700", color: C.gray700 },
  customRow: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  customPrefix: { fontSize: 18, fontWeight: "800", color: C.gray700 },
  customInput: { flex: 1, borderWidth: 1.5, borderColor: C.gray200, borderRadius: RADIUS.md, paddingHorizontal: SP._12, paddingVertical: SP._10, fontSize: 16, fontWeight: "700", color: C.gray900, backgroundColor: C.gray50 },
  fieldError: { fontSize: 12, color: C.error700 },

  note: { fontSize: 12, color: C.gray500, lineHeight: 17 },
  devNote: { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: C.warning100, borderRadius: RADIUS.md, padding: SP._10 },
  devNoteText: { flex: 1, fontSize: 12, color: C.warning700, fontWeight: "600", lineHeight: 16 },

  primaryBtn: { height: 50, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", marginTop: SP._4, flexDirection: "row", gap: SP._8 },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { fontSize: 15, fontWeight: "800", color: C.white },
  secondaryBtn: { height: 46, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: C.gray200, alignItems: "center", justifyContent: "center" },
  secondaryBtnText: { fontSize: 14, fontWeight: "700", color: C.gray600 },

  // Pending / result states
  centerBox: { alignItems: "center", gap: SP._10, paddingVertical: SP._8 },
  stateIconWrap: { width: 56, height: 56, borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center" },
  stateTitle: { fontSize: 17, fontWeight: "800", color: C.gray900, textAlign: "center" },
  stateText: { fontSize: 13, color: C.gray600, textAlign: "center", lineHeight: 19 },
  amountText: { fontSize: 24, fontWeight: "800", color: C.gray900 },
  btnStretch: { alignSelf: "stretch" },
});
