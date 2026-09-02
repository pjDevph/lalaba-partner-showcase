// src/screens/kyc/kyc.styles.ts
// Styles for the shared KYC verification section (merchant + washer).

import { StyleSheet } from "react-native";
import { C, RADIUS, SP, SHADOW } from "../../theme/tokens";

export const kycStyles = StyleSheet.create({
  container: { gap: SP._12 },

  // Badge card
  badgeCard: { flexDirection: "row", alignItems: "center", gap: SP._12, backgroundColor: C.white, borderRadius: 16, padding: SP._14, ...SHADOW.sm },
  badgeIconWrap: { width: 44, height: 44, borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center" },
  badgeBody: { flex: 1, minWidth: 0 },
  badgeTitle: { fontSize: 15, fontWeight: "800", color: C.gray900 },
  badgeSub: { fontSize: 12.5, color: C.gray600, marginTop: 2, lineHeight: 17 },

  // Rejection banner
  rejectBanner: { flexDirection: "row", alignItems: "flex-start", gap: SP._8, backgroundColor: C.error100, borderWidth: 1, borderColor: C.error500, borderRadius: RADIUS.md, padding: SP._12 },
  rejectText: { flex: 1, fontSize: 13, color: C.error700, fontWeight: "600", lineHeight: 18 },

  // Error / loading
  errorBanner: { flexDirection: "row", alignItems: "flex-start", gap: SP._8, backgroundColor: C.error100, borderWidth: 1, borderColor: C.error500, borderRadius: RADIUS.md, padding: SP._12 },
  errorText: { flex: 1, fontSize: 13, color: C.error700, fontWeight: "600", lineHeight: 18 },
  centerBox: { padding: SP._20, alignItems: "center", gap: SP._8 },
  retryBtn: { marginTop: SP._4, borderWidth: 1.5, borderRadius: RADIUS.md, paddingHorizontal: SP._16, paddingVertical: SP._8 },
  retryText: { fontSize: 13, fontWeight: "700" },

  // Document rows
  docCard: { backgroundColor: C.white, borderRadius: 16, ...SHADOW.sm, overflow: "hidden" },
  docRow: { flexDirection: "row", alignItems: "center", gap: SP._12, padding: SP._14 },
  docIconWrap: { width: 36, height: 36, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  docBody: { flex: 1, minWidth: 0 },
  docTitle: { fontSize: 14, fontWeight: "700", color: C.gray900 },
  docMeta: { fontSize: 12, color: C.gray500, marginTop: 1 },
  docReject: { fontSize: 12, color: C.error700, marginTop: 2, lineHeight: 16 },
  statusPill: { height: 22, paddingHorizontal: SP._8, borderRadius: RADIUS.full, alignItems: "center", justifyContent: "center" },
  statusPillText: { fontSize: 11, fontWeight: "700" },
  docActionBtn: { height: 30, borderRadius: RADIUS.sm, borderWidth: 1.5, paddingHorizontal: SP._10, alignItems: "center", justifyContent: "center" },
  docActionText: { fontSize: 12, fontWeight: "700" },
  divider: { height: 1, backgroundColor: C.gray100, marginLeft: 62 },

  // Footnote
  footnote: { fontSize: 12, color: C.gray500, lineHeight: 17, paddingHorizontal: SP._4 },
});
