// Styles for the Settings screen — extracted from settings.tsx for readability.
// `TH` and `S` are pure static StyleSheets; no behavior here.
import { StyleSheet } from "react-native";
import { C, RADIUS, SHADOW, SP } from "../../theme/tokens";

export const TH = StyleSheet.create({
  filtersWrap:   { paddingHorizontal: SP._16, paddingTop: SP._12, gap: SP._10, borderBottomWidth: 1, borderBottomColor: C.gray100, paddingBottom: SP._12, backgroundColor: C.white },
  searchRow:     { flexDirection: "row", alignItems: "center", backgroundColor: C.gray50, borderRadius: RADIUS.md, paddingHorizontal: SP._12, paddingVertical: SP._10, gap: SP._8, borderWidth: 1, borderColor: C.gray100 },
  searchInput:   { flex: 1, color: C.gray900, padding: 0 },
  pillsRow:      { flexDirection: "row", gap: SP._6, paddingBottom: 2 },
  pill:          { borderRadius: RADIUS.full, paddingHorizontal: SP._12, paddingVertical: 6, borderWidth: 1, borderColor: C.gray200, backgroundColor: C.white },
  pillActive:    { backgroundColor: C.brand500, borderColor: C.brand500 },
  pillText:      { color: C.gray600, fontWeight: "600" },
  pillTextActive:{ color: C.white },
  payDropdownBtn:   { flexDirection: "row", alignItems: "center", alignSelf: "flex-start" },
  payDropdownPanel: { marginTop: SP._6, backgroundColor: C.white, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.gray200, ...SHADOW.sm, paddingVertical: 4, alignSelf: "flex-start", minWidth: 180 },
  payDropdownRow:   { flexDirection: "row", alignItems: "center", gap: SP._10, paddingHorizontal: SP._14, paddingVertical: 10 },
  payDropdownRowText: { color: C.gray700, fontWeight: "500" },
  checkbox:         { width: 18, height: 18, borderRadius: RADIUS.sm, borderWidth: 1.5, borderColor: C.gray300, alignItems: "center", justifyContent: "center" },
  checkboxChecked:  { backgroundColor: C.brand500, borderColor: C.brand500 },
  checkboxMark:     { color: C.white, fontSize: 12, fontWeight: "800" },
  summaryRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: SP._16, paddingVertical: SP._10, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  summaryCount:  { color: C.gray500, fontWeight: "500" },
  summaryTotal:  { color: C.gray900, fontWeight: "700" },
  center:        { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText:     { color: C.gray400 },
  card:          { backgroundColor: C.white, borderRadius: RADIUS.lg, ...SHADOW.sm, flexDirection: "row", overflow: "hidden" },
  stripe:        { width: 4 },
  cardContent:   { flex: 1, padding: SP._14, gap: SP._8 },
  cardTop:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardCode:      { fontWeight: "700", color: C.gray900, letterSpacing: 0.3 },
  statusPill:    { borderRadius: RADIUS.full, paddingHorizontal: SP._10, paddingVertical: 3 },
  statusText:    { fontWeight: "700", letterSpacing: 0.2 },
  cardMid:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardCustomer:  { color: C.gray600, fontWeight: "500", flex: 1 },
  cardDate:      { color: C.gray400 },
  cardBot:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: SP._8, borderTopWidth: 1, borderTopColor: C.gray100 },
  cardMethod:    { backgroundColor: C.gray100, color: C.gray600, fontWeight: "600", borderRadius: RADIUS.sm, paddingHorizontal: SP._8, paddingVertical: 3, overflow: "hidden" },
  cardRef:       { color: C.gray400 },
  cardItems:     { color: C.gray500 },
  cardAmount:    { fontWeight: "800", color: C.brand600 },
  cardTendered:  { color: C.gray400 },
  exportBtn:     { backgroundColor: C.brand500, borderRadius: RADIUS.md, paddingHorizontal: SP._12, paddingVertical: 6, minWidth: 88, alignItems: "center", justifyContent: "center" },
  exportBtnText: { color: C.white, fontSize: 12, fontWeight: "700" },
  txFooterRow:   { flexDirection: "row", gap: SP._8, marginHorizontal: SP._16, marginVertical: SP._12 },
  downloadBtn:     { flex: 1, paddingVertical: SP._14, borderRadius: RADIUS.lg, alignItems: "center", justifyContent: "center", backgroundColor: C.brand500 },
  downloadBtnText: { color: C.white, fontWeight: "700", fontSize: 15 },
});

export const S = StyleSheet.create({
  // Common
  safe: { flex: 1, backgroundColor: C.gray50 },
  loadBox: { height: 220, alignItems: "center", justifyContent: "center", backgroundColor: C.gray50 },
  divider: { height: 1, backgroundColor: C.gray100 },

  // Hub
  hubScroll: { padding: SP._14, paddingBottom: SP._32 },
  hubCard: {
    backgroundColor: C.white, borderRadius: RADIUS.md, overflow: "hidden",
    ...SHADOW.xs, marginBottom: SP._14,
  },
  // Section header above each grouped card
  hubSectionLabel: {
    fontSize: 12, fontWeight: "700", color: C.gray500, letterSpacing: 0.6,
    textTransform: "uppercase", marginTop: SP._8, marginBottom: SP._8, marginLeft: SP._4,
  },
  // Business profile card (compact single row)
  bizCard: {
    flexDirection: "row", alignItems: "center", gap: SP._12,
    backgroundColor: C.white, borderRadius: RADIUS.md,
    ...SHADOW.xs, paddingHorizontal: SP._14, paddingVertical: SP._12, marginBottom: SP._8,
  },
  bizAvatar: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: C.brand500,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  bizName: { fontSize: 16, fontWeight: "800", color: C.gray900 },
  bizMeta: { fontSize: 12, color: C.gray500, marginTop: 2 },
  hubNavCard: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: SP._16, paddingVertical: SP._14, gap: SP._12,
  },
  hubIconCircle: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  hubNavCardText: { flex: 1, minWidth: 0 },
  hubNavCardLabel: { fontSize: 14, fontWeight: "600", color: C.gray900 },
  hubNavCardSubtitle: { fontSize: 11, color: C.gray500, marginTop: 2, overflow: "hidden" },
  hubBadge: {
    backgroundColor: C.brand500, borderRadius: RADIUS.full,
    paddingHorizontal: SP._8, paddingVertical: SP._2, minWidth: 20, alignItems: "center",
  },
  hubBadgeText: { fontSize: 11, fontWeight: "700", color: C.white },

  // Compact workspace top bar (tablet landscape)
  compactTopBar: {
    backgroundColor: C.brand600,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP._20,
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.12)",
  },
  compactTopBarLeft: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  compactTopBarLogo: { width: 26, height: 26, tintColor: "#fff" },
  compactTopBarBrand: { fontSize: 15, fontWeight: "700", color: "#fff", letterSpacing: -0.2 },
  compactTopBarRight: { flexDirection: "row", alignItems: "center", gap: SP._10 },
  compactTopBarUser: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.85)" },
  compactTopBarDivider: { width: 1, height: 16, backgroundColor: "rgba(255,255,255,0.3)" },

  // Type chip
  typeChip: {
    backgroundColor: "rgba(255,255,255,0.18)", borderRadius: RADIUS.full,
    paddingHorizontal: SP._12, paddingVertical: SP._6,
  },
  typeChipText: { fontSize: 11, fontWeight: "700", color: C.white, letterSpacing: 0.3 },

  // Sign out card
  signOutCard: {
    backgroundColor: C.white, borderRadius: RADIUS.md, overflow: "hidden",
    ...SHADOW.xs, marginBottom: SP._20,
  },
  signOutRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: SP._16, paddingVertical: SP._14, gap: SP._12,
  },
  signOutIconCircle: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: C.error100, alignItems: "center", justifyContent: "center",
  },
  signOutText: { fontSize: 14, fontWeight: "600", color: C.error700, flex: 1 },
  versionText: { fontSize: 11, color: C.gray400, textAlign: "center", marginTop: SP._4 },

  // HubRow active state (tablet sidebar selection highlight)
  hubNavCardActive: {
    backgroundColor: C.brand50,
    borderLeftWidth: 3,
    borderLeftColor: C.brand500,
    paddingLeft: 13,
  },

  // Master-Detail layout (tablet landscape)
  splitContainer: { flex: 1, flexDirection: "row", backgroundColor: C.gray100 },
  splitSidebar: {
    width: 280, backgroundColor: C.white,
    borderRightWidth: 1, borderRightColor: C.gray100,
  },
  sidebarNavPeekBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP._8,
    paddingHorizontal: SP._16,
    paddingVertical: SP._10,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
    backgroundColor: C.white,
  },
  sidebarNavPeekLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: C.brand600,
    letterSpacing: 0.1,
  },
  splitSidebarScroll: { padding: SP._12, paddingBottom: SP._24 },
  splitSidebarCard: {
    backgroundColor: C.white, borderRadius: RADIUS.md, overflow: "hidden",
    ...SHADOW.xs, marginBottom: SP._10,
  },
  splitDetail: { flex: 1, backgroundColor: C.gray50 },
  splitEmptyState: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: SP._8,
  },
  splitEmptyTitle: {
    fontSize: 16, fontWeight: "700", color: C.gray400, marginTop: SP._8,
  },
  splitEmptySub: {
    fontSize: 13, color: C.gray300, textAlign: "center", paddingHorizontal: SP._24,
  },

  // Permissions matrix
  permHeader: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.gray200, marginBottom: 4 },
  permHeaderText: { width: 54, textAlign: "center", fontSize: 10, fontWeight: "700", color: C.gray500, textTransform: "uppercase" },
  permRowAlt: { backgroundColor: C.gray50, borderRadius: 6 },
  permLabel: { flex: 1, fontSize: 13, color: C.gray800 },
  permCell: { width: 54, alignItems: "center" },
  permGroupLabel: { fontSize: 11, fontWeight: "800", color: C.gray400, textTransform: "uppercase", letterSpacing: 0.4, marginTop: SP._16, marginBottom: SP._4 },
  permNote: { fontSize: 12, color: C.gray400, marginTop: SP._20, textAlign: "center", lineHeight: 17 },

  // Branch toggle row in Add Staff form
  branchToggleRow: { flexDirection: "row", alignItems: "center", gap: SP._10, paddingVertical: SP._6 },
  branchToggleBox: {
    width: 20, height: 20, borderRadius: 4,
    borderWidth: 1.5, borderColor: C.gray300,
    alignItems: "center", justifyContent: "center",
  },
  branchToggleBoxChecked: { backgroundColor: C.brand500, borderColor: C.brand500 },
  branchToggleLabel: { fontSize: 14, color: C.gray800, flex: 1 },

  // StaffRow branch access section
  staffBranchSection: {
    paddingTop: SP._10,
    paddingBottom: SP._6,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
    marginBottom: SP._6,
  },
  staffBranchLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: C.gray500,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SP._8,
  },
  staffBranchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP._10,
    paddingVertical: SP._6,
  },
  staffBranchName: { fontSize: 13, color: C.gray800, flex: 1 },
  staffBranchPrimary: {
    fontSize: 11,
    fontWeight: "600",
    color: C.brand600,
    paddingHorizontal: SP._8,
    paddingVertical: 2,
    backgroundColor: C.brand50,
    borderRadius: RADIUS.full,
  },

  // Legacy signOutBtn kept for any remaining references
  signOutBtn: { display: "none" as any },
  signOutBtnText: { display: "none" as any },

  // ── Deactivate Account modals ────────────────────────────────────────────
  deleteModalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center", alignItems: "center", padding: SP._20,
  },
  deleteModalCard: {
    backgroundColor: C.white, borderRadius: RADIUS.xl,
    padding: SP._24, width: "100%", maxWidth: 480,
    ...SHADOW.md,
  },
  deleteModalTitle: {
    fontSize: 18, fontWeight: "700", color: C.gray900, marginBottom: SP._8,
  },
  deleteModalBody: {
    fontSize: 14, color: C.gray600, lineHeight: 20, marginBottom: SP._16,
  },
  deleteImpactBox: {
    backgroundColor: C.gray50 ?? C.gray100, borderRadius: RADIUS.lg,
    padding: SP._12, marginBottom: SP._12,
  },
  deleteImpactHeading: {
    fontSize: 11, fontWeight: "700", color: C.gray500, marginBottom: SP._8,
    textTransform: "uppercase", letterSpacing: 0.4,
  },
  deleteImpactRow: { flexDirection: "row", gap: SP._8, marginBottom: SP._6, alignItems: "flex-start" },
  deleteStepCheckbox: {
    width: 18, height: 18, borderRadius: 5, marginTop: 1,
    borderWidth: 1.5, borderColor: C.gray300 ?? C.gray400,
    backgroundColor: C.white,
  },
  deleteImpactBullet: { fontSize: 16, color: C.gray400, lineHeight: 20 },
  deleteImpactText: { flex: 1, fontSize: 13, color: C.gray700, lineHeight: 19 },
  deleteRecoveryBox: {
    backgroundColor: "#FEF3C7", borderRadius: RADIUS.lg,
    padding: SP._12, marginBottom: SP._20,
  },
  deleteRecoveryLabel: { fontSize: 11, fontWeight: "700", color: "#92400E", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  deleteRecoveryValue: { fontSize: 17, fontWeight: "800", color: "#78350F", marginBottom: SP._4 },
  deleteRecoveryHint: { fontSize: 12, color: "#92400E", lineHeight: 17 },
  deleteModalActions: {
    flexDirection: "row", gap: SP._10,
  },
  deleteModalActionsStacked: {
    gap: SP._10,
  },
  // Full-width variant for stacked (column) actions — the row buttons above
  // rely on flex: 1, which collapses to zero height inside a column.
  deleteModalBtnPrimaryStacked: {
    paddingVertical: SP._12, borderRadius: RADIUS.lg,
    backgroundColor: C.brand500, alignItems: "center",
  },
  deleteModalHeader: {
    flexDirection: "row", alignItems: "center", gap: SP._10, marginBottom: SP._8,
  },
  deleteModalCloseBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.gray100, alignItems: "center", justifyContent: "center",
  },
  deleteModalCloseX: { fontSize: 14, fontWeight: "600", color: C.gray500, lineHeight: 16 },
  deleteModalBtnSecondary: {
    flex: 1, paddingVertical: SP._12, borderRadius: RADIUS.lg,
    backgroundColor: C.gray100, alignItems: "center",
  },
  deleteModalBtnSecondaryText: { fontSize: 14, fontWeight: "600", color: C.gray700 },
  deleteModalBtnPrimary: {
    flex: 1, paddingVertical: SP._12, borderRadius: RADIUS.lg,
    backgroundColor: C.brand500, alignItems: "center",
  },
  deleteModalBtnPrimaryText: { fontSize: 14, fontWeight: "700", color: C.white },
  deleteModalBtnDanger: {
    flex: 1, paddingVertical: SP._12, borderRadius: RADIUS.lg,
    backgroundColor: C.error500, alignItems: "center",
  },
  deleteModalBtnDangerText: { fontSize: 14, fontWeight: "700", color: C.white },
  deleteConfirmInput: {
    borderWidth: 1.5, borderColor: C.gray200, borderRadius: RADIUS.lg,
    paddingHorizontal: SP._14, paddingVertical: SP._12,
    fontSize: 16, fontWeight: "700", color: C.gray900,
    letterSpacing: 2, marginBottom: SP._16,
    textAlign: "center",
  },

  // ── Audit Trail ─────────────────────────────────────────────────────────────
  auditStickyHeader: {
    backgroundColor: C.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.gray200,
  },
  auditSearchWrap: {
    flexDirection: "row", alignItems: "center", gap: SP._8,
    marginHorizontal: SP._16, marginTop: SP._10, marginBottom: SP._8,
    backgroundColor: C.gray50, borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: C.gray200,
    paddingHorizontal: SP._12, paddingVertical: SP._10,
  },
  auditSearchInput: {
    flex: 1, fontSize: 14, color: C.gray900, paddingVertical: 0,
  },
  auditDateHeader: {
    fontSize: 11, fontWeight: "700", color: C.gray400,
    textTransform: "uppercase", letterSpacing: 0.6,
    marginTop: SP._16, marginBottom: SP._6, marginLeft: SP._4,
  },
  auditCard: {
    flexDirection: "row", alignItems: "flex-start", gap: SP._10,
    backgroundColor: C.white, borderRadius: RADIUS.lg,
    padding: SP._14, borderWidth: StyleSheet.hairlineWidth, borderColor: C.gray100,
    ...SHADOW.xs,
  },
  auditDot: { width: 9, height: 9, borderRadius: 5, marginTop: 5 },
  auditCardTop: { flexDirection: "row", alignItems: "center", gap: SP._8, marginBottom: 3 },
  auditCardAction: { flex: 1, fontSize: 13, fontWeight: "700", color: C.gray900 },
  auditCardSub: { fontSize: 13, color: C.gray600, lineHeight: 18, marginBottom: 4 },
  auditCardMeta: { fontSize: 11, color: C.gray400 },
  auditSeverityBadge: {
    paddingHorizontal: SP._6, paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  auditSeverityText: { fontSize: 10, fontWeight: "700" },
  // Detail modal
  auditDetailOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.50)",
    justifyContent: "center", alignItems: "center", padding: SP._20,
  },
  auditDetailCard: {
    backgroundColor: C.white, borderRadius: RADIUS.xl,
    padding: SP._20, width: "100%", maxWidth: 520,
    ...SHADOW.md,
  },
  auditDetailHeader: {
    flexDirection: "row", alignItems: "flex-start", gap: SP._10, marginBottom: SP._12,
  },
  auditDetailTitle: { fontSize: 16, fontWeight: "700", color: C.gray900, marginBottom: 2 },
  auditDetailModule: { fontSize: 12, fontWeight: "600", color: C.brand600, marginTop: 1, marginBottom: 2 },
  auditDetailRecord: { fontSize: 13, color: C.gray500 },
  auditDetailDivider: {
    height: StyleSheet.hairlineWidth, backgroundColor: C.gray100, marginBottom: SP._12,
  },
  auditDetailRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    paddingVertical: SP._8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.gray100,
    gap: SP._12,
  },
  auditDetailLabel: { fontSize: 12, color: C.gray400, fontWeight: "600", minWidth: 110 },
  auditDetailValue: { flex: 1, fontSize: 13, color: C.gray800, textAlign: "right", fontWeight: "500" },
  auditDetailCloseBtn: {
    marginTop: SP._16, backgroundColor: C.brand500, borderRadius: RADIUS.lg,
    paddingVertical: SP._12, alignItems: "center",
  },
  auditDetailCloseBtnText: { fontSize: 14, fontWeight: "700", color: C.white },

  // Hours inline — compact redesign
  hoursQuickRow: {
    flexDirection: "row", gap: SP._8, marginBottom: SP._12,
  },
  hoursQuickBtn: {
    flex: 1, paddingVertical: SP._8, borderRadius: RADIUS.full,
    backgroundColor: C.brand50, borderWidth: 1, borderColor: C.brand200,
    alignItems: "center",
  },
  hoursQuickBtnText: { fontSize: 12, fontWeight: "600", color: C.brand600 },
  hoursCard: {
    backgroundColor: C.white, borderRadius: RADIUS.xl,
    borderWidth: 1, borderColor: C.gray100,
    overflow: "hidden", ...SHADOW.xs,
  },
  hoursDayRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: SP._14, paddingVertical: SP._12,
    gap: SP._10,
  },
  hoursDayRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.gray100 },
  hoursDayLabelWrap: { width: 56 },
  hoursDayShort: { fontSize: 13, fontWeight: "700", color: C.gray900 },
  hoursDayShortClosed: { color: C.gray400 },
  hoursDayFull: { fontSize: 10, color: C.gray500, marginTop: 1 },
  hoursDayFullClosed: { color: C.gray300 },
  hoursTimeBlock: { flex: 1, alignItems: "center" },
  hoursTimeRow: { flexDirection: "row", alignItems: "center", gap: SP._6 },
  hoursTimeInput: {
    width: 78, height: 40, borderWidth: 1.5, borderColor: C.gray200,
    borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center",
    backgroundColor: C.gray50, paddingHorizontal: SP._4,
  },
  hoursTimeInputText: {
    fontSize: 13, fontWeight: "700", color: C.gray900, textAlign: "center",
  },
  hoursTimeInputTablet: {
    width: 90, height: 48,
  },
  hoursDayRowTablet: {
    paddingVertical: SP._8,
  },
  hoursTimeDash: { fontSize: 14, color: C.gray400, fontWeight: "300" },
  hoursClosedBadge: {
    paddingHorizontal: SP._10, paddingVertical: SP._4,
    backgroundColor: C.gray100, borderRadius: RADIUS.full,
  },
  hoursClosedText: { fontSize: 12, fontWeight: "600", color: C.gray400, letterSpacing: 0.2 },
  hours24Badge: {
    paddingHorizontal: SP._10, paddingVertical: SP._4,
    backgroundColor: C.brand50, borderWidth: 1, borderColor: C.brand200,
    borderRadius: RADIUS.full,
  },
  hours24BadgeText: { fontSize: 12, fontWeight: "600", color: C.brand600, letterSpacing: 0.2 },
  hoursHint: {
    fontSize: 11, color: C.gray400, textAlign: "center", marginTop: SP._12,
    lineHeight: 16,
  },
  // Time picker popover (Hour / Minute / AM-PM columns)
  timePickerBackdrop: {
    flex: 1, backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center", justifyContent: "center", padding: SP._24,
  },
  timePickerCard: {
    width: "100%", maxWidth: 320, backgroundColor: C.white,
    borderRadius: RADIUS.xl, padding: SP._16, ...SHADOW.lg,
  },
  timePickerTitle: {
    fontSize: 14, fontWeight: "700", color: C.gray900,
    textAlign: "center", marginBottom: SP._12,
  },
  timePickerColumns: {
    flexDirection: "row", gap: SP._8, height: 200,
  },
  timePickerCol: { flex: 1 },
  timePickerOption: {
    paddingVertical: SP._10, alignItems: "center",
    borderRadius: RADIUS.md,
  },
  timePickerOptionActive: { backgroundColor: C.brand50 },
  timePickerOptionText: { fontSize: 14, color: C.gray700, fontWeight: "600" },
  timePickerOptionTextActive: { color: C.brand600, fontWeight: "800" },
  timePickerActions: {
    flexDirection: "row", gap: SP._8, marginTop: SP._12,
  },
  timePickerCancelBtn: {
    flex: 1, backgroundColor: C.gray100, borderRadius: RADIUS.md,
    paddingVertical: SP._12, alignItems: "center",
  },
  timePickerCancelBtnText: { fontSize: 14, fontWeight: "700", color: C.gray700 },
  timePickerDoneBtn: {
    flex: 1, backgroundColor: C.brand500, borderRadius: RADIUS.md,
    paddingVertical: SP._12, alignItems: "center",
  },
  timePickerDoneBtnText: { fontSize: 14, fontWeight: "700", color: C.white },
  // Legacy (preserved to avoid removing)
  dayRowInline: { display: "none" as any },
  dayNameInline: { display: "none" as any },
  timeRowInline: { display: "none" as any },
  timeInputInline: { display: "none" as any },
  timeDashInline: { display: "none" as any },

  // Sticky footer
  stickyFooter: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.gray100,
    padding: SP._16, paddingBottom: SP._24,
  },

  // Activity log inline
  filterChipInline: {
    paddingHorizontal: SP._12, paddingVertical: SP._6,
    borderRadius: RADIUS.full, backgroundColor: C.gray100,
    borderWidth: 1, borderColor: C.gray200,
  },
  filterChipInlineOn: { backgroundColor: C.brand500, borderColor: C.brand500 },
  filterChipTextInline: { fontSize: 12, fontWeight: "600", color: C.gray600 },
  filterChipTextInlineOn: { color: C.white },
  auditDropdownBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SP._12, paddingVertical: SP._8,
    borderRadius: RADIUS.lg, backgroundColor: C.gray50,
    borderWidth: 1, borderColor: C.gray200,
  },
  auditDropdownBtnText: { flex: 1, fontSize: 13, fontWeight: "600", color: C.gray700 },
  auditPickerCard: {
    backgroundColor: C.white, borderRadius: RADIUS.xl,
    padding: SP._10, width: "100%", maxWidth: 360,
    ...SHADOW.md,
  },
  auditPickerHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SP._10, paddingTop: SP._6, paddingBottom: SP._10,
  },
  auditPickerTitle: {
    fontSize: 13, fontWeight: "700", color: C.gray400,
    textTransform: "uppercase", letterSpacing: 0.4,
  },
  auditPickerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SP._10, paddingVertical: SP._12,
    borderRadius: RADIUS.md,
  },
  auditPickerRowText: { fontSize: 15, fontWeight: "500", color: C.gray800 },
  auditPickerRowTextOn: { color: C.brand600, fontWeight: "700" },
  auditLoadMoreBtn: {
    marginTop: SP._6, paddingVertical: SP._12, borderRadius: RADIUS.lg,
    backgroundColor: C.gray50, borderWidth: 1, borderColor: C.gray200,
    alignItems: "center", justifyContent: "center",
  },
  auditLoadMoreText: { fontSize: 13, fontWeight: "700", color: C.brand600 },
  auditEndOfList: {
    marginTop: SP._10, fontSize: 12, fontWeight: "600", color: C.gray300,
    textAlign: "center",
  },
  logCardInline: {
    flexDirection: "row", gap: SP._12,
    backgroundColor: C.white, borderRadius: RADIUS.md,
    padding: SP._12, ...SHADOW.xs,
  },
  logDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  logActionInline: { fontSize: 12, fontWeight: "700", color: C.gray900 },
  logEntityNameInline: { fontSize: 14, fontWeight: "600", color: C.gray700, marginTop: 2 },
  logActorInline: { fontSize: 11, fontWeight: "600", color: C.gray600 },
  logTimeInline: { fontSize: 10, color: C.gray400 },

  // Staff (kept for inline version)
  staffSummaryRow: { flexDirection: "row", gap: SP._8, marginBottom: SP._16 },

  // Section headings that separate the staff roster from the courier roster
  staffSectionTitle: { fontSize: 16, fontWeight: "800", color: C.gray900, marginTop: SP._12, marginBottom: SP._8 },
  staffSectionHeaderRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: SP._12,
  },
  staffSectionHint: { fontSize: 12, color: C.gray500, lineHeight: 17, marginBottom: SP._12 },

  // Branch picker cards (staff screen level 1)
  staffBranchCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP._16,
    paddingVertical: SP._14,
    gap: SP._12,
  },
  staffBranchCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.brand50,
    alignItems: "center",
    justifyContent: "center",
  },
  staffBranchCardName: { fontSize: 15, fontWeight: "700", color: C.gray900 },
  staffBranchCardAddr: { fontSize: 12, color: C.gray500, marginTop: 1 },
  staffBranchCardCount: { fontSize: 12, color: C.brand500, fontWeight: "600", marginTop: 3 },

  // Staff search (branch picker level)
  staffSearchWrap: {
    paddingHorizontal: SP._16,
    paddingVertical: SP._10,
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
  },
  staffSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP._10,
    paddingHorizontal: SP._14,
    paddingVertical: SP._10,
    borderRadius: RADIUS.md,
    backgroundColor: C.gray50,
    borderWidth: 1,
    borderColor: C.gray200,
  },
  staffSearchInput: {
    flex: 1,
    fontSize: 14,
    color: C.gray900,
    padding: 0,
  },
  staffSearchResultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SP._16,
    paddingVertical: SP._12,
    gap: SP._12,
  },
  staffSearchResultBranch: {
    fontSize: 12,
    color: C.brand500,
    fontWeight: "600",
    marginTop: 1,
  },
  staffChip: {
    flex: 1, backgroundColor: C.gray100, borderRadius: 12,
    paddingVertical: SP._12, alignItems: "center",
  },
  staffChipNum:   { fontSize: 22, fontWeight: "800", color: C.gray800 },
  staffChipLabel: { fontSize: 11, color: C.gray500, fontWeight: "600", marginTop: 2 },
  staffEmpty: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 32 },
  staffEmptyIcon:  { marginBottom: SP._12 },
  staffEmptyTitle: { fontSize: 16, fontWeight: "700", color: C.gray700, marginBottom: SP._8 },
  staffEmptyBody:  { fontSize: 13, color: C.gray400, textAlign: "center", lineHeight: 20 },
  staffRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: SP._16, paddingVertical: SP._12, gap: SP._12,
  },
  staffAvatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  staffAvatarText:  { fontSize: 16, fontWeight: "700", color: C.white },
  staffName:        { fontSize: 14, fontWeight: "600", color: C.gray900 },
  staffRoleBadge:   { borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 2 },
  staffRoleText:    { fontSize: 9, fontWeight: "700", color: C.white, letterSpacing: 0.4 },
  staffPhone:       { fontSize: 12, color: C.gray500, marginTop: 2 },
  staffStatusDot:   { width: 12, height: 12, borderRadius: 6 },
  staffExpanded: {
    paddingHorizontal: SP._16,
    paddingBottom: SP._12,
    borderTopWidth: 1,
    borderTopColor: C.gray100,
  },
  staffActionRow: {
    flexDirection: "row",
    gap: SP._6,
    marginTop: SP._10,
    flexWrap: "wrap",
  },
  staffActionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP._4,
    paddingHorizontal: SP._12,
    paddingVertical: SP._6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: C.gray200,
    backgroundColor: C.white,
  },
  staffActionPillText: { fontSize: 12, fontWeight: "600", color: C.gray700 },
  archivedToggleRow: {
    flexDirection: "row", alignItems: "center", gap: SP._8,
    paddingVertical: SP._12, paddingHorizontal: SP._4,
    marginTop: SP._20,
  },
  archivedToggleText: { flex: 1, fontSize: 14, fontWeight: "600", color: C.gray500 },
  archivedRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: SP._16, paddingVertical: SP._12, gap: SP._12,
  },
  archivedNote: { fontSize: 12, color: C.warning600, marginTop: 2 },
  restoreBtn: {
    paddingHorizontal: SP._12, paddingVertical: SP._6,
    borderRadius: RADIUS.md, borderWidth: 1,
    borderColor: C.success500, backgroundColor: C.success100,
  },
  restoreBtnText: { fontSize: 12, fontWeight: "700", color: C.success700 },
  sheetCloseBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.gray100, alignItems: "center", justifyContent: "center",
  },
  roleRow:             { flexDirection: "row", flexWrap: "wrap", gap: SP._8, marginBottom: SP._16 },
  roleChip: {
    paddingHorizontal: SP._12, paddingVertical: SP._8,
    borderRadius: RADIUS.full, backgroundColor: C.gray100, borderWidth: 1, borderColor: C.gray200,
  },
  roleChipText:        { fontSize: 12, fontWeight: "600", color: C.gray600 },
  addStaffConfirmBtn: {
    backgroundColor: C.brand500, borderRadius: 14,
    height: 52, alignItems: "center", justifyContent: "center",
    marginTop: SP._4, ...SHADOW.xs,
  },
  addStaffConfirmText: { fontSize: 15, fontWeight: "700", color: C.white },
  // Permissions
  permInfoBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: SP._8,
    backgroundColor: C.brand50, borderRadius: RADIUS.md,
    padding: SP._12, marginBottom: SP._4,
    borderWidth: 1, borderColor: C.brand100,
  },
  permInfoText: { flex: 1, fontSize: 13, color: C.brand700, lineHeight: 19 },
  permRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: SP._16, paddingVertical: SP._12, gap: SP._12,
  },
  permRowLabel: { fontSize: 14, fontWeight: "600", color: C.gray800 },
  permRowHint:  { fontSize: 11, color: C.gray400, marginTop: 2 },
  permRowDesc:  { fontSize: 11, color: C.gray400, marginTop: 3, lineHeight: 16, fontStyle: "italic" },
  resetPermsBtn: {
    marginTop: SP._24,
    backgroundColor: C.gray100, borderRadius: RADIUS.md,
    paddingVertical: SP._14, alignItems: "center",
  },
  resetPermsBtnText: { fontSize: 13, fontWeight: "700", color: C.gray600 },
  // Form fields
  fieldLabel: { fontSize: 12, fontWeight: "700", color: C.gray600, letterSpacing: 0.2 },
  fieldHint:  { fontSize: 11, color: C.gray400, marginTop: 4, lineHeight: 16 },
  infoRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: SP._16, paddingVertical: SP._12,
  },
  infoLabel:  { fontSize: 13, fontWeight: "600", color: C.gray600 },
  infoValue:  { fontSize: 13, color: C.gray800, maxWidth: 200, textAlign: "right" },
  // Activity logs (legacy, kept for compatibility)
  logsNoAccess: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: SP._12, padding: 40, backgroundColor: C.gray50,
  },
  logsNoAccessText: { fontSize: 14, color: C.gray500, textAlign: "center", lineHeight: 21 },

  // Sub-screen (modal full-page) shared styles
  subSafe: { flex: 1, backgroundColor: C.white },
  subHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SP._16, paddingVertical: SP._12,
    borderBottomWidth: 1, borderBottomColor: C.gray100, backgroundColor: C.white,
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: SP._4, minWidth: 60 },
  backText: { fontSize: 15, fontWeight: "600", color: C.brand500 },
  subHeaderCenter: { flex: 1, alignItems: "center" },
  subTitle: { fontSize: 16, fontWeight: "700", color: C.gray900 },
  subSubtitle: { fontSize: 11, color: C.gray500, marginTop: 1 },
  saveBtn: {
    backgroundColor: C.brand500, borderRadius: RADIUS.md,
    paddingHorizontal: SP._16, paddingVertical: SP._8, minWidth: 60,
  },
  saveBtnText: { fontSize: 13, fontWeight: "700", color: C.white, textAlign: "center" },
  subScroll: { padding: SP._16, paddingBottom: 80 },
  subGroupLabel: {
    fontSize: 11, fontWeight: "700", color: C.gray500, letterSpacing: 0.6,
    textTransform: "uppercase", marginBottom: SP._8,
  },
  permGroupHeaderRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  permGroupToggleLabel: {
    fontSize: 11, fontWeight: "600", color: C.gray400,
  },
  permGroupHint: {
    fontSize: 11, color: C.gray400, marginBottom: SP._8, marginTop: -SP._4,
  },
  subCard: {
    backgroundColor: C.white, borderRadius: 16, overflow: "hidden",
    ...SHADOW.xs, marginBottom: SP._16,
  },

  // ── Help & Support ──
  helpSearchBox: {
    flexDirection: "row", alignItems: "center", gap: SP._8,
    backgroundColor: C.white, borderRadius: 12, paddingHorizontal: SP._12,
    height: 44, ...SHADOW.xs,
  },
  helpSearchInput: { flex: 1, fontSize: 14, color: C.gray900, paddingVertical: 0 },
  helpTopicRow: {
    flexDirection: "row", alignItems: "center", gap: SP._12,
    paddingHorizontal: SP._16, paddingVertical: SP._14,
  },
  helpTopicQ: { flex: 1, fontSize: 14, fontWeight: "600", color: C.gray900 },
  helpTopicA: {
    fontSize: 13, lineHeight: 19, color: C.gray600,
    paddingHorizontal: SP._16, paddingBottom: SP._14, marginTop: -SP._4,
  },
  helpEmpty: { fontSize: 13, color: C.gray500, padding: SP._16, textAlign: "center" },
  helpContactRow: {
    flexDirection: "row", alignItems: "center", gap: SP._12,
    paddingHorizontal: SP._16, paddingVertical: SP._14,
  },
  helpContactTitle: { fontSize: 14, fontWeight: "600", color: C.gray900 },
  helpContactSub: { fontSize: 11, color: C.gray500, marginTop: 2 },
  helpReportCard: {
    flexDirection: "row", alignItems: "center", gap: SP._12,
    backgroundColor: C.white, borderRadius: 16, padding: SP._16,
    ...SHADOW.xs,
  },
  helpReportTitle: { fontSize: 14, fontWeight: "600", color: C.gray900 },
  helpReportSub: { fontSize: 12, lineHeight: 17, color: C.gray500, marginTop: 2 },
  helpFootnote: { fontSize: 11, color: C.gray400, textAlign: "center", marginTop: SP._20 },

  // BField input styles
  bFieldInput: {
    height: 44, borderWidth: 1.5, borderColor: C.gray200, borderRadius: RADIUS.md,
    paddingHorizontal: SP._12, fontSize: 14, color: C.gray900,
    backgroundColor: C.white, marginTop: SP._6,
  },
  bFieldInputFocused: { borderColor: C.brand500 },

  // ── App Tours sub-page ──────────────────────────────────────────────────────
  tourPageHint: {
    fontSize: 13, color: C.gray500, marginBottom: SP._16, lineHeight: 20,
  },
  tourCard: {
    backgroundColor: C.white, borderRadius: RADIUS.xl,
    marginBottom: SP._12, padding: SP._16,
    borderWidth: 1, borderColor: C.gray100, ...SHADOW.xs,
  },
  tourCardTitle: { fontSize: 14, fontWeight: "700", color: C.gray900, marginBottom: SP._2 },
  tourCardSub:   { fontSize: 12, color: C.gray400, marginBottom: SP._12 },
  tourRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", paddingVertical: SP._12,
  },
  tourRowLeft:    { flexDirection: "row", alignItems: "center", gap: SP._10 },
  tourStatusIcon: { width: 20, height: 20, alignItems: "center", justifyContent: "center" },
  tourLabel:      { fontSize: 13, fontWeight: "600", color: C.gray800 },
  tourRowSub:     { fontSize: 11, color: C.gray400, marginTop: 2 },
  tourReplayBtn: {
    paddingHorizontal: SP._12, paddingVertical: SP._6,
    borderRadius: RADIUS.md, backgroundColor: C.brand50,
  },
  tourReplayText: { fontSize: 12, fontWeight: "700", color: C.brand600 },

  // ── Branches screen ──────────────────────────────────────────────────────
  branchEmpty: { alignItems: "center", paddingVertical: 48, gap: SP._10 },
  branchEmptyTitle: { fontSize: 15, fontWeight: "700", color: C.gray700 },
  branchEmptyText:  { fontSize: 13, color: C.gray400, textAlign: "center", lineHeight: 20 },
  branchRow: {
    flexDirection: "row", alignItems: "flex-start",
    gap: SP._12, paddingHorizontal: SP._16, paddingVertical: SP._14,
  },
  // Indented to sit under its branch row rather than reading as a new section.
  branchSettingRow: {
    paddingHorizontal: SP._16, paddingBottom: SP._14, paddingLeft: SP._16 + 36 + SP._12,
  },
  branchIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.brand50,
    alignItems: "center", justifyContent: "center",
  },
  branchRowName: { fontSize: 14, fontWeight: "700", color: C.gray900 },
  branchRowAddr: { fontSize: 12, color: C.gray500, marginTop: 2 },
  branchRowMeta: { fontSize: 11, color: C.gray400, marginTop: 1 },
  branchActions: { flexDirection: "row", alignItems: "center", gap: SP._4 },
  branchActionBtn: { padding: SP._6 },
  archivedToggle: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: SP._14, marginTop: SP._12,
  },
  branchArchivedToggleText: { fontSize: 13, fontWeight: "600", color: C.gray600 },
  archivedEmptyText: { fontSize: 13, color: C.gray400, textAlign: "center", paddingVertical: SP._12 },
  reactivateBtn: {
    backgroundColor: C.success100, borderRadius: RADIUS.sm,
    paddingHorizontal: SP._10, paddingVertical: SP._4,
  },
  reactivateBtnText: { fontSize: 12, fontWeight: "700", color: C.success700 },
  branchRowTagRow: { flexDirection: "row", marginTop: SP._6, gap: SP._6 },
  branchTypeTag: {
    backgroundColor: C.brand50, borderRadius: RADIUS.sm,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  branchTypeTagText: { fontSize: 11, fontWeight: "600", color: C.brand600 },

  // Sheet tablet overlay (branch modals)
  sheetTabletOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 32 },
  // Fixed height (not maxHeight) — same as the Services modal — so the card
  // doesn't shrink-wrap to short forms and gets consistent breathing room.
  sheetTabletCard: { borderRadius: RADIUS.xl, overflow: "hidden", width: "100%", maxWidth: 560, height: "88%" } as any,

  // Sheet (add branch modal)
  sheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SP._20, paddingVertical: SP._16,
    borderBottomWidth: 1, borderBottomColor: C.gray100,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: C.gray900 },
  // Generous bottom padding — same as the Services modal — so the last field
  // scrolls clear of the keyboard and short forms get breathing room above
  // the sticky footer instead of hugging it.
  sheetBody:  { padding: SP._20, paddingBottom: 240 },
  sheetFieldLabel: { fontSize: 12, fontWeight: "700", color: C.gray700, marginTop: SP._16, marginBottom: SP._6 },
  sheetFieldHint:  { fontSize: 11, color: C.gray400, marginTop: SP._4, lineHeight: 16 },
  sheetInput: {
    borderWidth: 1.5, borderColor: C.gray200, borderRadius: RADIUS.md,
    paddingHorizontal: SP._14, paddingVertical: SP._12,
    fontSize: 15, color: C.gray900, backgroundColor: C.gray50,
  },
  sheetInputError: { borderColor: C.error500, backgroundColor: "#fff5f5" },
  sheetFieldError: { fontSize: 11, color: C.error500, marginTop: 4 },
  typeChipSelect: {
    flex: 1, borderWidth: 1.5, borderColor: C.gray200,
    borderRadius: RADIUS.md, padding: SP._12, backgroundColor: C.gray50,
  },
  typeChipSelectOn:      { borderColor: C.brand500, backgroundColor: C.brand50 },
  typeChipSelectText:    { fontSize: 13, fontWeight: "700", color: C.gray700 },
  typeChipSelectTextOn:  { color: C.brand600 },
  typeChipSelectSub:     { fontSize: 11, color: C.gray400, marginTop: 2 },
  sheetCta: {
    height: 52, borderRadius: 16, backgroundColor: C.brand500,
    alignItems: "center", justifyContent: "center",
    marginTop: SP._28, ...SHADOW.brand,
  },
  sheetCtaText: { fontSize: 16, fontWeight: "700", color: C.white },

  // ── Edit/Add sheet — sections + sticky footer ──
  sheetSubtitle: { fontSize: 12, color: C.gray500, marginTop: 3, lineHeight: 16 },
  sheetSectionLabel: {
    fontSize: 12, fontWeight: "800", color: C.gray500, letterSpacing: 0.6,
    textTransform: "uppercase", marginTop: SP._24, marginBottom: SP._4,
  },
  sheetFooter: {
    flexDirection: "row", gap: SP._12,
    paddingHorizontal: SP._20, paddingTop: SP._12, paddingBottom: SP._12,
    borderTopWidth: 1, borderTopColor: C.gray100, backgroundColor: C.white,
  },
  sheetCancelBtn: {
    paddingHorizontal: SP._20, height: 52, borderRadius: 16,
    borderWidth: 1.5, borderColor: C.gray200,
    alignItems: "center", justifyContent: "center",
  },
  sheetCancelText: { fontSize: 16, fontWeight: "700", color: C.gray700 },

  // ── Branch form sheets (BranchFormSheets.tsx helpers) ──
  sheetFlexFill:  { flex: 1 },
  sheetSafeArea:  { flex: 1, backgroundColor: C.white },
  requiredStar:   { color: C.error500, fontWeight: "700" },
  sheetFieldLabelSpaced:   { marginTop: SP._16 },
  sheetFieldLabelSpaced12: { marginTop: SP._12 },
  // Business-registration block in the edit-branch sheet: a muted helper line
  // and a wrapping row of single-select chips.
  sheetFieldLabelMuted: { color: C.gray500, fontWeight: "400" as const },
  chipRow:          { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 },
  chip:             { paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full, borderWidth: 1, borderColor: C.gray200, backgroundColor: C.white },
  chipSelected:     { borderColor: C.brand500, backgroundColor: C.brand50 },
  chipText:         { fontSize: 13, fontWeight: "500" as const, color: C.gray700 },
  chipTextSelected: { fontWeight: "700" as const, color: C.brand700 },
  psgcBusyRow:    { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  psgcBusyText:   { fontSize: 13, color: C.gray500 },
  sheetCtaFooter: { flex: 1, marginTop: 0 },
  sheetCtaDisabled: { backgroundColor: C.gray300, shadowOpacity: 0, elevation: 0 },
  sheetHeaderTop: { alignItems: "flex-start" },
  sheetHeadText:  { flex: 1, minWidth: 0, paddingRight: SP._12 },
  sheetHeadClose: { marginTop: 2 },
  mt0:   { marginTop: 0 },
  dim60: { opacity: 0.6 },
  dim70: { opacity: 0.7 },

  // ── Branches screen layout ──
  branchesScroll:        { flex: 1, backgroundColor: C.gray100, maxWidth: 880, width: "100%", alignSelf: "center" },
  branchesScrollContent: { padding: SP._16, paddingBottom: 40 },
  branchRowBody:         { flex: 1, minWidth: 0 },
  archivedSpinner:       { marginTop: SP._16 },
  archivedList:          { marginTop: SP._8 },

  // ── Verification (KYC) screen ──
  kycBranchChips:         { marginBottom: SP._12, flexGrow: 0 },
  kycBranchChip:          { height: 34, paddingHorizontal: SP._14, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: C.gray200, backgroundColor: C.white, alignItems: "center", justifyContent: "center", marginRight: SP._8, maxWidth: 220 },
  kycBranchChipActive:    { borderColor: C.brand500, backgroundColor: C.brand50 },
  kycBranchChipText:      { fontSize: 13, fontWeight: "600", color: C.gray600 },
  kycBranchChipTextActive:{ color: C.brand600 },

  // Device approval notification row (dashboard widget — kept for compat)
  deviceNotifRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: SP._16, paddingVertical: SP._14, gap: SP._12,
  },
  deviceNotifIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.warning100,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  deviceNotifName:  { fontSize: 14, fontWeight: "700", color: C.gray900 },
  deviceNotifMeta:  { fontSize: 11, color: C.gray500, marginTop: 2 },
  deviceNotifId:    { fontSize: 10, color: C.gray400, marginTop: 2, fontFamily: "monospace" },
  deviceNotifActions: { flexDirection: "column", gap: SP._6 },
  deviceActionBtn: {
    borderWidth: 1, borderRadius: RADIUS.sm,
    paddingHorizontal: SP._10, paddingVertical: 9,
    alignItems: "center", justifyContent: "center",
  },
  deviceActionText: { fontSize: 13, fontWeight: "700" },

  pendingTopBadge: {
    backgroundColor: C.warning500, borderRadius: RADIUS.full,
    paddingHorizontal: SP._8, paddingVertical: 3,
  },
  pendingTopBadgeText: { fontSize: 11, fontWeight: "700", color: C.white },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  sectionTitle:  { fontSize: 10, fontWeight: "700", color: C.gray400, letterSpacing: 0.8, flex: 1 },
  sectionCountBadge: {
    backgroundColor: C.gray100, borderRadius: RADIUS.full,
    paddingHorizontal: SP._8, paddingVertical: 2,
  },
  sectionCountText: { fontSize: 11, fontWeight: "700", color: C.gray600 },

  deviceCard: {
    backgroundColor: C.white,
    borderRadius: RADIUS.lg,
    padding: SP._14,
    gap: SP._12,
    borderWidth: 1, borderColor: C.gray100,
    ...SHADOW.xs,
  },
  deviceCardIcon: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  deviceCardName:  { fontSize: 15, fontWeight: "700", color: C.gray900 },
  deviceCardStaff: { fontSize: 13, color: C.gray500, marginTop: 2 },
  platformPill: {
    paddingHorizontal: SP._6, paddingVertical: 2,
    borderRadius: RADIUS.xs, borderWidth: 1,
    borderColor: C.gray200, backgroundColor: C.gray50,
  },
  platformPillText: { fontSize: 10, fontWeight: "600", color: C.gray600 },
  deviceCardId:    { fontSize: 11, color: C.gray400, marginTop: SP._4 },
  deviceCardIdVal: { fontFamily: "monospace", color: C.gray500 },

  deviceCardActions: {
    flexDirection: "row", gap: SP._8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.gray100,
    paddingTop: SP._10,
  },
  deviceActionCompact: {
    flex: 1, borderWidth: 1, borderRadius: RADIUS.sm,
    paddingVertical: SP._8, alignItems: "center", justifyContent: "center",
  },
  deviceActionCompactText: { fontSize: 13, fontWeight: "700" },

  emptyDevices: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: SP._32, gap: SP._12, backgroundColor: C.gray50,
  },
  emptyDevicesIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: C.gray100,
    alignItems: "center", justifyContent: "center",
    marginBottom: SP._4,
  },
  emptyDevicesTitle: { fontSize: 16, fontWeight: "700", color: C.gray700, textAlign: "center" },
  emptyDevicesBody:  { fontSize: 13, color: C.gray400, textAlign: "center", lineHeight: 20 },

  // Branch access "Included by assigned branch" label
  branchIncludedLabel: {
    fontSize: 10,
    color: C.gray400,
    fontStyle: "italic",
    flexShrink: 1,
  },

  // Branch access confirmation modal
  confirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SP._24,
  },
  confirmCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: C.white,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SP._24,
    paddingTop: SP._24,
    paddingBottom: SP._20,
    ...SHADOW.md,
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: C.gray900,
    marginBottom: SP._16,
  },
  confirmSection: {
    marginBottom: SP._14,
  },
  confirmSectionLabel: {
    fontSize: 12,
    color: C.gray500,
    marginBottom: SP._6,
  },
  confirmSectionValue: {
    fontSize: 14,
    fontWeight: "600",
    color: C.gray800,
  },
  confirmBranchPill: {
    alignSelf: "flex-start",
    paddingHorizontal: SP._12,
    paddingVertical: SP._6,
    borderRadius: RADIUS.full,
    backgroundColor: C.gray100,
  },
  confirmBranchPillText: {
    fontSize: 14,
    fontWeight: "600",
    color: C.gray800,
  },
  confirmNote: {
    fontSize: 12,
    color: C.gray500,
    lineHeight: 18,
    marginBottom: SP._16,
    fontStyle: "italic",
  },
  confirmActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: SP._8,
    marginTop: SP._6,
  },
  confirmCancelBtn: {
    paddingHorizontal: SP._16,
    paddingVertical: SP._10,
    borderRadius: RADIUS.full,
  },
  confirmCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: C.gray500,
  },
  confirmActionBtn: {
    paddingHorizontal: SP._20,
    paddingVertical: SP._10,
    borderRadius: RADIUS.full,
    backgroundColor: C.brand500,
    minWidth: 100,
    alignItems: "center",
  },
  confirmActionBtnDestructive: {
    backgroundColor: C.error500,
  },
  confirmActionText: {
    fontSize: 14,
    fontWeight: "700",
    color: C.white,
  },
});