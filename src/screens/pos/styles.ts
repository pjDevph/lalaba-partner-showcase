// Styles + palette for the POS screen — extracted from pos.tsx for readability.
// `P` is the POS-local color palette; `S` is the static StyleSheet. No behavior here.
import { StyleSheet } from "react-native";
import { C, RADIUS, SHADOW, SP } from "../../theme/tokens";

export const P = {
  bg:          "#F6F8FB",
  blue:        "#009ED8",
  text:        "#172033",
  muted:       "#8A97AA",
  border:      "#E6ECF2",
  success:     "#16B978",
  warning:     "#FFA800",
  white:       "#FFFFFF",
  blueTint:    "#E5F6FC",
  blueLight:   "#B8E8F7",
  successTint: "#E8FAF3",
  warningTint: "#FFF5E5",
  errorRed:    "#E84646",
  errorTint:   "#FDE8E8",
} as const;

export const S = StyleSheet.create({
  safe: { flex: 1, backgroundColor: P.bg },

  // Staff branch switcher (dropdown from the terminal header).
  branchMenuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 96,
    paddingHorizontal: SP._20,
  },
  branchMenuCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: C.white,
    borderRadius: RADIUS.lg,
    paddingVertical: SP._8,
    paddingHorizontal: SP._8,
    ...SHADOW.md,
  },
  branchMenuTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: C.gray500,
    paddingHorizontal: SP._12,
    paddingTop: SP._8,
    paddingBottom: SP._6,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  branchMenuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SP._8,
    paddingVertical: SP._12,
    paddingHorizontal: SP._12,
    borderRadius: RADIUS.md,
  },
  branchMenuRowActive: { backgroundColor: C.brand50 },
  branchMenuRowText: { flex: 1, fontSize: 15, fontWeight: "600", color: C.gray800 },
  branchMenuRowTextActive: { color: C.brand600 },
  branchMenuSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP._8,
    marginHorizontal: SP._8,
    marginBottom: SP._6,
    paddingHorizontal: SP._12,
    paddingVertical: SP._8,
    borderRadius: RADIUS.md,
    backgroundColor: C.gray100,
  },
  branchMenuSearchInput: { flex: 1, fontSize: 15, color: C.gray900, padding: 0 },
  branchMenuEmpty: {
    fontSize: 14,
    color: C.gray400,
    textAlign: "center",
    paddingVertical: SP._16,
  },

  // Header — matches the Settings header color (brand blue).
  header: {
    // Plain white like every other header in the app. POS used to be the one
    // brand-blue surface; with three header treatments across five tabs there
    // was no rule a user could learn, so they are all one now.
    backgroundColor: P.white,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
    paddingHorizontal: SP._20,
    paddingBottom: SP._10,
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: { fontSize: 19, fontWeight: "800", color: C.gray900, letterSpacing: -0.5 },
  headerSub: { fontSize: 12, color: C.gray500, marginTop: 2, fontWeight: "500" },
  headerQueueBadge: {
    backgroundColor: P.warning,
    borderRadius: RADIUS.full,
    minWidth: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SP._8,
  },
  headerQueueText: { fontSize: 14, fontWeight: "800", color: P.white },
  // Full-screen toggle button (white icon on the brand header)
  headerFsBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  compactHeaderRight: { flexDirection: "row", alignItems: "center", gap: SP._8 },


  // Segments — sits on the white background under the header
  segWrap: {
    backgroundColor: P.white,
    paddingHorizontal: SP._14,
    paddingVertical: SP._12,
  },

  // Scroll — light background, content on P.bg
  scroll: { padding: SP._16, paddingBottom: 28, gap: SP._16 },

  // Sections
  openSection: { gap: SP._8 },
  sectionMeta: {
    fontSize: 9, fontWeight: "600", color: P.muted,
    letterSpacing: 1.2, textTransform: "uppercase", marginBottom: SP._2,
  },

  // Customer
  inputRow: { flexDirection: "row" },
  inputPill: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: P.white, borderRadius: 14,
    borderWidth: 1.5, borderColor: P.border,
    paddingLeft: SP._12, paddingRight: SP._4,
  },
  inputPillIcon: { marginRight: SP._8 },
  inputPillText: { flex: 1, paddingVertical: 11, fontSize: 14, color: P.text },

  // Services header + zoom control
  servicesHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  zoomControl: { flexDirection: "row", alignItems: "center", gap: SP._6, marginBottom: 8 },
  zoomLabel: { fontSize: 9, fontWeight: "700", color: P.muted, letterSpacing: 1.2 },
  zoomBtn: {
    width: 30, height: 30, borderRadius: 8,
    borderWidth: 1.5, borderColor: P.border, backgroundColor: P.white,
    alignItems: "center", justifyContent: "center",
  },
  zoomBtnDisabled: { opacity: 0.4 },
  zoomBtnText: { fontSize: 18, fontWeight: "700", color: P.text, lineHeight: 20 },

  // Search
  searchZoomRow: { flexDirection: "row", alignItems: "center", gap: SP._8, marginBottom: SP._10 },
  zoomInline: { flexDirection: "row", alignItems: "center", gap: SP._6 },
  searchRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: P.white, borderRadius: 14,
    borderWidth: 1.5, borderColor: P.border,
    paddingHorizontal: SP._12, paddingVertical: SP._8, gap: SP._8,
    shadowColor: "#172033", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  searchInput: { flex: 1, fontSize: 14, color: P.text, padding: 0 },

  // Services / Products type tab switcher
  serviceTypeTabRow: {
    flexDirection: "row",
    backgroundColor: P.border,
    borderRadius: RADIUS.md,
    padding: 3,
    gap: 3,
  },
  serviceTypeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP._6,
    paddingVertical: SP._8,
    borderRadius: RADIUS.sm,
  },
  serviceTypeTabActive: {
    backgroundColor: P.white,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  serviceTypeTabText: { fontSize: 13, fontWeight: "600", color: P.muted },
  serviceTypeTabTextActive: { color: P.blue },
  serviceTypeTabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.full,
    backgroundColor: P.border,
  },
  serviceTypeTabBadgeActive: { backgroundColor: P.blueTint },
  serviceTypeTabBadgeText: { fontSize: 10, fontWeight: "700", color: P.muted },
  serviceTypeTabBadgeTextActive: { color: P.blue },

  // Category chips (terminal filter)
  chipRow: { flexDirection: "row", gap: SP._6, paddingBottom: SP._4 },
  catChip: {
    paddingHorizontal: SP._14, paddingVertical: SP._6,
    borderRadius: RADIUS.full,
    backgroundColor: P.white,
    borderWidth: 1, borderColor: P.border,
    alignSelf: "flex-start",
  },
  catChipOn: { backgroundColor: P.blueTint, borderColor: P.blueLight },
  catChipText: { fontSize: 12, fontWeight: "500", color: P.muted },
  catChipTextOn: { color: P.blue, fontWeight: "700" },

  // Featured quick-access (kept for possible use)
  featuredSection: { gap: SP._6 },
  featuredLabel: { fontSize: 11, fontWeight: "700", color: C.warning700, letterSpacing: 0.5 },
  featuredRow: { flexDirection: "row", gap: SP._8, paddingBottom: SP._4 },
  featuredChip: {
    backgroundColor: "#FFFBEB",
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: C.warning300,
    paddingHorizontal: SP._12,
    paddingVertical: SP._8,
    minWidth: 100,
    maxWidth: 160,
  },
  featuredChipOn: { backgroundColor: P.blueTint, borderColor: P.blueLight },
  featuredChipName: { fontSize: 13, fontWeight: "700", color: P.text, marginBottom: 2 },
  featuredChipNameOn: { color: P.blue },
  featuredChipPrice: { fontSize: 11, color: C.warning700 },
  featuredChipPriceOn: { color: P.blue },

  // ── Service tiles (cashier-first: + Add / stepper) ──────────────────────────
  tileEmpty: { paddingVertical: 36, alignItems: "center", paddingHorizontal: 24 },
  tileEmptyTitle: { fontSize: 15, fontWeight: "700", color: P.text, marginBottom: 6, textAlign: "center" },
  tileEmptyText: { fontSize: 13, color: P.muted, textAlign: "center", lineHeight: 20 },
  tileEmptyBtn: {
    marginTop: 16,
    height: 44,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: P.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  tileEmptyBtnText: { fontSize: 14, fontWeight: "700", color: P.white },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: SP._10 },
  tile: {
    width: "47.5%", backgroundColor: P.white,
    borderRadius: 14, borderWidth: 1, borderColor: P.border,
    padding: SP._12, gap: SP._8,
    shadowColor: "#172033", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  tileSelected: { backgroundColor: P.blueTint, borderColor: P.blueLight, borderWidth: 1.5 },
  // Full-width row layout (portrait 1-col): name+price left, control right
  tileWide: { width: "100%", gap: SP._10 },
  tileWideRow: { flexDirection: "row", alignItems: "center", gap: SP._12 },
  tileWideControl: { width: 150 },
  tileQuickRow: { flexDirection: "row", gap: SP._6 },
  tileQuickChip: {
    flex: 1, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center",
    backgroundColor: P.bg, borderWidth: 1, borderColor: P.border,
  },
  tileQuickChipActive: { backgroundColor: P.blueTint, borderColor: P.blue },
  tileQuickChipText: { fontSize: 14, fontWeight: "700", color: P.muted },
  tileQuickChipTextActive: { color: P.blue },
  tileName: { fontSize: 15, fontWeight: "700", color: P.text, lineHeight: 20, flex: 1 },
  tileStarBadge: {
    backgroundColor: P.warningTint,
    borderRadius: 4, padding: 3, marginTop: 1, flexShrink: 0,
  },
  tileNameSelected: { color: P.blue },
  tileBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SP._4 },
  tilePrice: { fontSize: 13, color: P.text, fontWeight: "600" },
  tilePriceSelected: { color: P.blue },
  // + Add button (full-width)
  tileAddBtn: {
    backgroundColor: P.blue, borderRadius: RADIUS.sm,
    alignItems: "center", paddingVertical: SP._8,
  },
  tileAddBtnText: { fontSize: 13, fontWeight: "700", color: P.white },
  // Qty stepper (−  N  +) — full-width, taller
  tileStepper: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: P.blueTint, borderRadius: RADIUS.sm,
    borderWidth: 1, borderColor: P.blueLight,
    overflow: "hidden", height: 36,
  },
  tileStepBtn: {
    flex: 1, height: 36, alignItems: "center", justifyContent: "center",
  },
  tileStepBtnText: { fontSize: 18, fontWeight: "700", color: P.blue, lineHeight: 22 },
  tileStepQty: {
    fontSize: 15, fontWeight: "700", color: P.blue,
    minWidth: 28, textAlign: "center",
  },
  // kg weight entry inside the tile stepper
  tileWeightWrap: {
    flex: 1.4, height: 36, flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: P.white, borderRadius: 6, marginVertical: 3,
  },
  tileWeightInput: {
    fontWeight: "800", color: P.blue, textAlign: "center",
    paddingVertical: 0, minWidth: 36, maxWidth: 64,
  },
  tileWeightUnit: { fontWeight: "700", color: P.blue, marginLeft: 2, opacity: 0.7 },
  // legacy — kept to avoid unused reference errors
  tileBadge: {
    backgroundColor: P.blue, borderRadius: RADIUS.full,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  tileBadgeText: { fontSize: 10, fontWeight: "700", color: P.white },

  // ── Sticky cart summary bar ──────────────────────────────────────────────────
  cartBar: {
    backgroundColor: P.white,
    borderTopWidth: 1, borderTopColor: P.border,
    paddingHorizontal: SP._16,
    paddingTop: SP._12,
    // paddingBottom is applied inline with useSafeAreaInsets().bottom
    minHeight: 64, justifyContent: "center",
  },
  cartBarEmpty: {
    fontSize: 12, color: P.muted, textAlign: "center",
    fontWeight: "400",
  },
  cartBarActive: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: P.blue, borderRadius: 14,
    paddingHorizontal: SP._16, paddingVertical: SP._12,
    justifyContent: "space-between",
  },
  cartBarInfo: { gap: 2 },
  cartBarCount: { fontSize: 11, color: "rgba(255,255,255,0.8)", fontWeight: "500" },
  cartBarTotal: { fontSize: 20, fontWeight: "800", color: P.white, letterSpacing: -0.5 },
  cartBarBtn: {
    backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 10,
    paddingHorizontal: SP._14, paddingVertical: SP._8,
  },
  cartBarBtnText: { fontSize: 14, fontWeight: "700", color: P.white },

  // ── Landscape two-column layout ──────────────────────────────────────────────
  // Left = services grid (flex), right = persistent "Current Sale" cart panel.
  landscapeRow:  { flex: 1, flexDirection: "row" },
  landscapeLeft: { flex: 1 },
  // Compact customer row
  custRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: P.white, borderWidth: 1, borderColor: P.border, borderRadius: RADIUS.lg,
    paddingHorizontal: SP._14, paddingVertical: SP._10, marginBottom: SP._12,
  },
  custLabel: { fontSize: 10, fontWeight: "700", color: P.muted, letterSpacing: 0.5 },
  custValue: { fontSize: 14, fontWeight: "700", color: P.text, marginTop: 1 },
  custBtn: { backgroundColor: P.blueTint, borderRadius: RADIUS.md, paddingHorizontal: SP._14, paddingVertical: SP._8 },
  custBtnText: { fontSize: 13, fontWeight: "700", color: P.blue },
  // Add-customer drawer
  drawerBackdrop: { flex: 1, flexDirection: "row", backgroundColor: "rgba(15,40,60,0.35)" },
  drawer: { width: 420, maxWidth: "92%", backgroundColor: P.white },
  drawerHeader: { flexDirection: "row", alignItems: "flex-start", padding: SP._16, borderBottomWidth: 1, borderBottomColor: P.border },
  drawerTitle: { fontSize: 18, fontWeight: "800", color: P.text },
  drawerSub: { fontSize: 12, color: P.muted, marginTop: 2 },
  fLabel: { fontSize: 12, fontWeight: "700", color: P.text, marginBottom: 6, marginTop: SP._12 },
  fInput: { borderWidth: 1, borderColor: P.border, borderRadius: RADIUS.md, paddingHorizontal: SP._12, paddingVertical: SP._10, fontSize: 14, color: P.text, backgroundColor: P.bg },
  drawerFooter: { flexDirection: "row", gap: SP._10, padding: SP._16, borderTopWidth: 1, borderTopColor: P.border },
  drawerCancel: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: SP._12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: P.border },
  drawerCancelText: { fontSize: 14, fontWeight: "700", color: P.text },
  drawerSave: { flex: 1.4, alignItems: "center", justifyContent: "center", paddingVertical: SP._12, borderRadius: RADIUS.md, backgroundColor: P.blue },
  drawerSaveDisabled: { opacity: 0.45 },
  drawerSaveText: { fontSize: 14, fontWeight: "700", color: P.white },
  cartPanel: {
    width: 340,
    backgroundColor: P.white,
    borderLeftWidth: 1, borderLeftColor: P.border,
  },
  cartPanelHeader: {
    paddingHorizontal: SP._20, paddingTop: SP._16, paddingBottom: SP._12,
    borderBottomWidth: 1, borderBottomColor: P.border,
  },
  cartPanelTitle: { fontSize: 18, fontWeight: "800", color: P.text },
  cartPanelEmpty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: SP._20 },

  // ── Review Order bottom sheet ────────────────────────────────────────────────
  reviewBackdrop: {
    flex: 1, backgroundColor: "rgba(23,32,51,0.45)",
    justifyContent: "flex-end",
  },
  reviewSheet: {
    backgroundColor: P.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    // paddingBottom is applied inline with useSafeAreaInsets().bottom
    paddingTop: SP._8,
    ...SHADOW.lg,
  },
  reviewHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: P.border, alignSelf: "center", marginBottom: SP._12,
  },
  reviewSheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SP._20, marginBottom: SP._12,
  },
  reviewSheetTitle: { fontSize: 18, fontWeight: "800", color: P.text },
  reviewSection: { paddingHorizontal: SP._20, gap: SP._10 },
  reviewTotals: {
    borderTopWidth: 1, borderTopColor: P.border,
    paddingTop: SP._12, gap: SP._4, marginTop: SP._4,
  },
  reviewPaySection: {
    paddingHorizontal: SP._20, paddingTop: SP._16, paddingBottom: SP._8,
  },
  reviewFooter: {
    paddingHorizontal: SP._16, paddingTop: SP._14,
    borderTopWidth: 1, borderTopColor: P.border,
    backgroundColor: P.white,
  },

  // Summary/order items (kept for ReviewSheet)
  summaryCard: {
    backgroundColor: P.white, borderRadius: 20,
    padding: SP._16, gap: SP._12, ...SHADOW.md,
  },
  summaryHeader: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  summaryTitle: { fontSize: 11, fontWeight: "700", color: P.muted, letterSpacing: 0.9, textTransform: "uppercase" },
  summaryCount: { fontSize: 12, color: P.muted },

  // Line items
  lineItem: { flexDirection: "row", alignItems: "center", paddingVertical: 5, gap: SP._8 },
  lineItemName: { flex: 1, fontSize: 14, fontWeight: "600", color: P.text },
  lineItemRight: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  qtyInput: {
    width: 42, height: 30,
    borderWidth: 1.5, borderColor: P.border, borderRadius: RADIUS.sm,
    fontSize: 13, fontWeight: "600", color: P.text,
    textAlign: "center", backgroundColor: P.bg, padding: 0,
  },
  lineItemUnit: { fontSize: 12, color: P.muted, minWidth: 16 },
  lineItemTotal: { fontSize: 13, fontWeight: "700", color: P.text, minWidth: 64, textAlign: "right" },
  removeBtn: { padding: SP._4 },

  // Add link
  addLink: { flexDirection: "row", alignItems: "center", gap: SP._8, paddingVertical: SP._4 },
  addLinkText: { fontSize: 13, color: P.muted, fontWeight: "500" },

  // Discount
  discountForm: { gap: SP._8 },
  discountInputRow: { flexDirection: "row" },
  discountInput: {
    borderWidth: 1.5, borderColor: P.border, borderRadius: 14,
    paddingHorizontal: SP._12, paddingVertical: SP._8,
    fontSize: 14, color: P.text, backgroundColor: P.bg,
  },
  discountApplyBtn: {
    flex: 1, backgroundColor: P.blue, borderRadius: 14,
    paddingVertical: SP._8, alignItems: "center",
  },
  discountApplyText: { fontSize: 13, fontWeight: "700", color: P.white },
  discountCancelBtn: {
    flex: 1, borderWidth: 1.5, borderColor: P.border, borderRadius: 14,
    paddingVertical: SP._8, alignItems: "center",
  },
  discountCancelText: { fontSize: 13, fontWeight: "600", color: P.muted },
  // Discount modal section labels
  discountSectionLabel: {
    fontSize: 10, fontWeight: "700", color: P.muted,
    letterSpacing: 0.8, textTransform: "uppercase",
    marginBottom: SP._8,
  },
  // Government discount preset buttons (large, filled, show ₱ amount)
  discountPresetBtn: {
    flex: 1, backgroundColor: P.blueTint, borderRadius: 16,
    borderWidth: 2, borderColor: P.blueLight,
    paddingVertical: SP._14, paddingHorizontal: SP._12,
    alignItems: "center", gap: SP._2,
  },
  discountPresetLabel: { fontSize: 13, fontWeight: "700", color: P.blue },
  discountPresetAmt:   { fontSize: 20, fontWeight: "800", color: P.blue },
  discountPresetPct:   { fontSize: 11, fontWeight: "500", color: P.blue, opacity: 0.7 },
  // Charge type 2-column grid
  chargeGrid: { flexDirection: "row", flexWrap: "wrap", gap: SP._8, marginBottom: SP._16 },
  chargeGridBtn: {
    width: "48%", paddingVertical: SP._14, paddingHorizontal: SP._12,
    borderRadius: 14, borderWidth: 2, borderColor: P.border,
    backgroundColor: P.bg, alignItems: "center", justifyContent: "center",
    position: "relative",
  },
  chargeGridBtnActive: { borderColor: P.warning, backgroundColor: "#FFF7ED" },
  chargeGridCheck: {
    position: "absolute", top: 6, right: 6,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: P.warning, alignItems: "center", justifyContent: "center",
  },
  chargeGridText: { fontSize: 13, fontWeight: "600", color: P.muted, textAlign: "center" },
  chargeGridTextActive: { color: P.warning },
  // Amount row — always visible, dims when no type selected
  chargeAmountRow: {
    flexDirection: "row", alignItems: "center",
    borderRadius: 16, borderWidth: 2.5, borderColor: P.border,
    backgroundColor: P.bg, paddingHorizontal: SP._16, paddingVertical: SP._10,
    marginBottom: SP._4,
  },
  chargeAmountRowActive: { borderColor: P.warning, backgroundColor: "#FFF7ED" },
  chargeAmountCurrency: { fontSize: 24, fontWeight: "700", color: P.muted, marginRight: SP._6 },
  chargeAmountInput: {
    flex: 1, fontSize: 28, fontWeight: "800", color: P.text,
    textAlign: "right", padding: 0,
  },
  discountApplied: {
    flexDirection: "row", alignItems: "center", gap: SP._8,
    backgroundColor: C.accent100, borderRadius: RADIUS.sm,
    paddingHorizontal: SP._12, paddingVertical: SP._8,
  },
  discountAppliedText: { fontSize: 12, color: C.accent700, fontWeight: "600" },

  // Notes
  notesInlineWrap: {
    flexDirection: "row", alignItems: "flex-start", gap: SP._8,
    backgroundColor: P.warningTint, borderRadius: 12,
    paddingHorizontal: SP._12, paddingVertical: SP._10,
  },
  notesInlineInput: {
    flex: 1, fontSize: 13, color: P.text,
    lineHeight: 19, padding: 0, minHeight: 20,
  },

  // Totals
  totalsBlock: {
    borderTopWidth: 1, borderTopColor: P.border,
    paddingTop: SP._12, gap: SP._4,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalRowLabel: { fontSize: 13, color: P.muted },
  totalRowValue: { fontSize: 13, fontWeight: "600", color: P.text },
  grandLabel: { fontSize: 16, fontWeight: "700", color: P.text },
  grandValue: { fontSize: 26, fontWeight: "800", color: P.text, letterSpacing: -0.6 },

  // Payment
  payCard: { backgroundColor: P.white, borderRadius: 20, padding: SP._16, ...SHADOW.xs },
  payMethodRow: { flexDirection: "row", gap: SP._8, marginTop: SP._8 },
  payBtn: {
    flex: 1, paddingVertical: SP._12,
    borderRadius: 14, borderWidth: 2, borderColor: P.border, alignItems: "center",
  },
  payBtnActive: { borderColor: P.blue, backgroundColor: P.blueTint },
  payBtnText: { fontSize: 15, fontWeight: "600", color: P.muted },
  payBtnTextActive: { color: P.blue },

  // Standalone full-width CTA inside modals (no flex:1 — that collapses when not in a row)
  modalCta: {
    backgroundColor: P.blue, borderRadius: 16,
    paddingVertical: SP._16, alignItems: "center", justifyContent: "center",
  },
  modalCtaText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },

  // Split toggle pill button
  splitToggle: {
    borderWidth: 1.5, borderColor: P.border, borderRadius: RADIUS.full,
    paddingHorizontal: SP._12, paddingVertical: SP._6,
    backgroundColor: P.white,
  },
  splitToggleActive: { borderColor: P.blue, backgroundColor: P.blueTint },
  splitToggleText: { fontSize: 13, fontWeight: "700", color: P.muted },
  splitToggleTextActive: { color: P.blue },

  // Payment 2-column grid
  payGrid: { gap: SP._8, marginTop: SP._4 },
  payGridRow: { flexDirection: "row", gap: SP._8 },
  payGridBtn: {
    flex: 1, height: 50,
    borderRadius: 14, borderWidth: 2, borderColor: P.border,
    alignItems: "center", justifyContent: "center",
  },
  payGridBtnFull: {
    height: 46, borderRadius: 14, borderWidth: 2, borderColor: P.border,
    alignItems: "center", justifyContent: "center",
  },
  payGridBtnActive: { borderColor: P.blue, backgroundColor: P.blueTint },
  payGridBtnText: { fontSize: 14, fontWeight: "600", color: P.muted },
  payGridBtnTextActive: { color: P.blue },

  // Enter amount tap target
  enterAmountBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: P.bg, borderRadius: 14, borderWidth: 2, borderColor: P.border,
    paddingHorizontal: SP._16, paddingVertical: SP._12,
  },
  enterAmountLabel: { fontSize: 11, fontWeight: "600", color: P.muted, marginBottom: 2 },
  enterAmountValue: { fontSize: 22, fontWeight: "700", color: P.text },
  enterAmountPlaceholder: { fontSize: 16, fontWeight: "400", color: P.muted },

  // Keypad
  keypadBtn: {
    flex: 1, height: 54, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    backgroundColor: P.bg, borderWidth: 1.5, borderColor: P.border,
  },
  keypadBtnText: { fontSize: 22, fontWeight: "600", color: P.text },

  // POS Modals (discount, charge, keypad, split)
  posModalOverlay: {
    flex: 1, backgroundColor: "rgba(23,32,51,0.52)",
    alignItems: "center", justifyContent: "center",
    padding: SP._20,
  },
  posModal: {
    backgroundColor: P.white, borderRadius: 24,
    padding: SP._20, width: "100%", maxWidth: 480, ...SHADOW.lg,
  },
  posModalTitle: { fontSize: 17, fontWeight: "700", color: P.text, marginBottom: SP._16 },

  // Cash
  cashDisplay: {
    backgroundColor: P.bg, borderRadius: 14,
    paddingHorizontal: SP._16, paddingVertical: SP._12,
  },
  cashDisplayLabel: { fontSize: 11, fontWeight: "600", color: P.muted, marginBottom: 2 },
  cashDisplayValue: { fontSize: 20, fontWeight: "700", color: P.text },
  cashDisplayPlaceholder: { color: P.muted, fontWeight: "400", fontSize: 15 },
  cashInput: {
    borderWidth: 1.5, borderColor: P.border, borderRadius: 14,
    paddingHorizontal: SP._12, paddingVertical: SP._10,
    fontSize: 14, color: P.text, backgroundColor: P.white, marginTop: SP._8,
  },
  changeBox: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: P.successTint, borderRadius: 14,
    paddingHorizontal: SP._12, paddingVertical: SP._8, marginTop: SP._8,
  },
  changeLabel: { fontSize: 13, color: P.success, fontWeight: "600" },
  changeValue: { fontSize: 16, fontWeight: "800", color: P.success },
  cashError: { fontSize: 12, color: P.errorRed, marginTop: SP._8, fontWeight: "600" },
  gcashHint: { fontSize: 12, color: P.muted, marginTop: SP._8, lineHeight: 18 },

  // CTA (used in review sheet footer)
  ctaBar: {
    paddingHorizontal: SP._16, paddingVertical: SP._12,
    backgroundColor: P.white, borderTopWidth: 1, borderTopColor: P.border,
  },
  cta: {
    height: 62, borderRadius: 18,
    alignItems: "center", justifyContent: "center", paddingHorizontal: SP._20,
  },
  ctaEmpty: { backgroundColor: C.gray100 },
  ctaError: { backgroundColor: C.gray200 },
  ctaActive: { backgroundColor: P.blue, ...SHADOW.brand },
  ctaInner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
  ctaLabel: { fontSize: 17, fontWeight: "700", color: P.white },
  ctaLabelMuted: { color: P.muted, textAlign: "center", flex: 1 },
  ctaLabelError: { color: C.gray600, textAlign: "center", flex: 1 },
  ctaPill: {
    backgroundColor: "rgba(255,255,255,0.22)", borderRadius: RADIUS.full,
    paddingHorizontal: SP._12, paddingVertical: SP._4,
  },
  ctaPillText: { fontSize: 14, fontWeight: "800", color: P.white },

  // ── Compact Queue/Claim header ──────────────────────────────────────────────
  compactHeader: {
    backgroundColor: C.brand500,
    paddingHorizontal: SP._20,
    paddingBottom: SP._8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  compactHeaderTitle: { fontSize: 17, fontWeight: "800", color: P.white, letterSpacing: -0.2 },
  compactHeaderSub: { fontSize: 10, color: "rgba(255,255,255,0.72)", marginTop: 1 },
  compactHeaderPills: { flexDirection: "row", gap: SP._6 },
  compactStatPill: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: RADIUS.md,
    paddingHorizontal: SP._10, paddingVertical: SP._4,
    minWidth: 52,
  },
  compactStatPillGreen: { backgroundColor: "rgba(22,185,120,0.3)" },
  compactStatNum: { fontSize: 16, fontWeight: "800", color: P.white, lineHeight: 20 },
  compactStatLabel: { fontSize: 9, fontWeight: "600", color: "rgba(255,255,255,0.78)", textTransform: "uppercase", letterSpacing: 0.4 },

  // Empty
  listPad: { padding: SP._12, paddingBottom: 24, gap: SP._6 },
  // Landscape: cap the queue list width instead of stretching cards edge-to-edge.
  listPadLandscape: { maxWidth: 760, width: "100%", alignSelf: "flex-start" },
  // Landscape: search + filter row shares the exact same max width and inset
  // as the card list below it, so both align to the same left/right edges.
  qLandscapeControlRow: {
    flexDirection: "row", alignItems: "center", gap: SP._10,
    maxWidth: 760, width: "100%", alignSelf: "flex-start",
    paddingHorizontal: SP._12, marginTop: SP._12,
  },
  emptyPane: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, paddingHorizontal: 40 },
  emptyCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: P.border, alignItems: "center", justifyContent: "center", marginBottom: SP._16,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: P.text, marginBottom: SP._8, textAlign: "center" },
  emptyBody: { fontSize: 13, color: P.muted, textAlign: "center", lineHeight: 20 },

  // Order cards
  orderCard: {
    flexDirection: "row", backgroundColor: C.white,
    borderRadius: 16, overflow: "hidden", ...SHADOW.xs,
  },
  orderStripe: { width: 4 },
  orderBody: { flex: 1, padding: SP._12, gap: SP._8 },
  orderTop: { flexDirection: "row", alignItems: "flex-start" },
  orderName: { fontSize: 15, fontWeight: "700", color: C.gray900 },
  orderPhone: { fontSize: 12, color: C.gray500, marginTop: 2 },
  orderMeta: { flexDirection: "row", alignItems: "center", gap: SP._4 },
  orderMetaText: { fontSize: 12, color: C.gray500 },
  orderItems: { gap: SP._4 },
  orderItem: { fontSize: 12, color: C.gray600 },

  // Status
  statusPill: {
    flexDirection: "row", alignItems: "center",
    borderRadius: RADIUS.full, paddingHorizontal: SP._8, paddingVertical: SP._4, gap: SP._4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "700" },

  // Advance button
  advBtn: {
    backgroundColor: C.brand500, borderRadius: RADIUS.lg,
    height: 44, alignItems: "center", justifyContent: "center",
    marginTop: SP._8,
  },
  advBtnText: { fontSize: 14, fontWeight: "700", color: C.white },

  // Cancel button
  cancelBtn: {
    width: 36, height: 44, borderRadius: RADIUS.lg,
    borderWidth: 1.5, borderColor: C.error100,
    alignItems: "center", justifyContent: "center",
    backgroundColor: C.error100,
  },

  // Claim section
  lookupCard: {
    backgroundColor: P.white, borderRadius: 16,
    padding: SP._20, marginBottom: SP._4, ...SHADOW.xs,
  },
  lookupRow: { flexDirection: "row", gap: SP._8, marginTop: SP._8 },
  lookupInput: {
    flex: 1, borderWidth: 1.5, borderColor: P.border, borderRadius: 14,
    paddingHorizontal: SP._12, paddingVertical: SP._12,
    fontSize: 16, fontWeight: "700", color: P.text,
    textAlign: "center", letterSpacing: 2, backgroundColor: P.bg,
  },
  lookupBtn: {
    backgroundColor: P.blue, borderRadius: 14,
    paddingHorizontal: SP._20, justifyContent: "center",
  },
  lookupBtnText: { fontSize: 14, fontWeight: "700", color: P.white },
  readyHeader: { flexDirection: "row", alignItems: "center", gap: SP._8, marginBottom: SP._8, marginTop: SP._4 },
  readyBadge: {
    minWidth: 22, height: 22, borderRadius: 11,
    backgroundColor: P.success, alignItems: "center", justifyContent: "center", paddingHorizontal: SP._4,
  },
  readyBadgeText: { fontSize: 11, fontWeight: "800", color: P.white },
  claimCodeBox: {
    backgroundColor: P.blueTint, borderRadius: 8, borderWidth: 1,
    borderColor: P.blueLight, paddingHorizontal: SP._8, paddingVertical: SP._4,
    alignItems: "center",
  },
  claimCodeLabel: { fontSize: 8, fontWeight: "700", color: P.blue, letterSpacing: 0.6 },
  claimCodeValue: { fontSize: 14, fontWeight: "800", color: P.blue, letterSpacing: 2 },
  claimBtn: {
    flex: 1, backgroundColor: P.success, borderRadius: 10,
    paddingVertical: 8, alignItems: "center", justifyContent: "center", marginTop: SP._8,
  },
  claimBtnText: { fontSize: 13, fontWeight: "700", color: P.white },

  // Claim confirm modal
  modalBg: {
    flex: 1, backgroundColor: "rgba(23,32,51,0.5)",
    alignItems: "center", justifyContent: "center",
    paddingVertical: SP._24, paddingHorizontal: SP._16,
  },
  claimConfirmModal: {
    backgroundColor: P.white, borderRadius: 24, padding: SP._24,
    width: "100%", maxWidth: 360, gap: SP._16, ...SHADOW.lg,
  },
  claimConfirmHeader: { alignItems: "center", gap: SP._8 },
  claimConfirmCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: P.successTint, alignItems: "center", justifyContent: "center",
  },
  claimConfirmTitle: { fontSize: 20, fontWeight: "800", color: P.text },
  claimConfirmName: { fontSize: 14, color: P.muted, fontWeight: "500" },
  claimConfirmItems: {
    backgroundColor: P.bg, borderRadius: 14, padding: SP._12, gap: SP._8,
  },
  claimConfirmRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  claimConfirmItemName: { fontSize: 13, color: P.muted, flex: 1 },
  claimConfirmItemAmt: { fontSize: 13, fontWeight: "600", color: P.text },
  claimConfirmTotalRow: {
    marginTop: SP._8, paddingTop: SP._8,
    borderTopWidth: 1, borderTopColor: P.border,
  },
  claimConfirmTotalLabel: { fontSize: 14, fontWeight: "700", color: P.text },
  claimConfirmTotalValue: { fontSize: 18, fontWeight: "800", color: P.text },
  claimConfirmActions: { flexDirection: "row", gap: SP._8 },
  claimConfirmDoneBtn: {
    flex: 1, backgroundColor: P.blue, borderRadius: 14,
    paddingVertical: SP._12, alignItems: "center",
  },
  claimConfirmDoneText: { fontSize: 14, fontWeight: "700", color: P.white },

  // Shift banner — sits on blue header, keep white text
  shiftBannerEmpty: {
    flexDirection: "row", alignItems: "center", gap: SP._8,
    backgroundColor: "rgba(0,0,0,0.08)",
    paddingHorizontal: SP._16, paddingVertical: SP._8,
  },
  shiftBannerEmptyText: { fontSize: 13, color: "rgba(255,255,255,0.8)", fontStyle: "italic" },
  shiftBannerActive: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "rgba(0,0,0,0.12)",
    paddingHorizontal: SP._16, paddingVertical: SP._8,
  },
  shiftBannerLeft: { flexDirection: "row", alignItems: "center", gap: SP._10 },
  shiftAvatarDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: P.success,
  },
  shiftBannerName: { fontSize: 14, fontWeight: "700", color: P.white },
  shiftBannerRole: { fontSize: 11, color: "rgba(255,255,255,0.8)" },
  shiftEndBtn: {
    paddingHorizontal: SP._12, paddingVertical: SP._6,
    borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.4)",
  },
  shiftEndBtnText: { fontSize: 12, fontWeight: "700", color: P.white },

  // Shift modal
  shiftModalBackdrop: {
    flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(23,32,51,0.45)",
  },
  shiftModalSheet: {
    backgroundColor: P.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    // paddingBottom is applied inline with useSafeAreaInsets().bottom
    paddingTop: SP._12,
    ...SHADOW.lg,
  },
  shiftModalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: P.border, alignSelf: "center", marginBottom: SP._16,
  },
  shiftModalTitle: {
    fontSize: 17, fontWeight: "800", color: P.text,
    paddingHorizontal: SP._16, marginBottom: SP._12,
  },
  shiftModalLabel: {
    fontSize: 12, fontWeight: "700", color: P.muted, letterSpacing: 0.4,
    textTransform: "uppercase", marginBottom: SP._8,
  },
  shiftStaffChip: {
    alignItems: "center", paddingHorizontal: SP._12, paddingVertical: SP._10,
    borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: P.border,
    backgroundColor: P.white, gap: SP._6, minWidth: 72,
  },
  shiftStaffChipOn: { borderColor: P.blueLight, backgroundColor: P.blueTint },
  shiftStaffAvatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  shiftStaffAvatarText: { fontSize: 18, fontWeight: "800" },
  shiftStaffName: { fontSize: 13, fontWeight: "700", color: P.text },
  shiftStaffRole: { fontSize: 11, color: P.muted },
  shiftPinInput: {
    marginHorizontal: SP._16, marginBottom: SP._12,
    borderWidth: 1.5, borderColor: P.blue, borderRadius: 14,
    paddingHorizontal: SP._16, paddingVertical: SP._14,
    fontSize: 22, fontWeight: "800", color: P.text,
    textAlign: "center", letterSpacing: 8, backgroundColor: P.blueTint,
  },
  shiftStartBtn: {
    backgroundColor: P.blue, borderRadius: RADIUS.lg,
    height: 48, alignItems: "center", justifyContent: "center",
    marginHorizontal: SP._16, ...SHADOW.brand,
  },
  shiftStartBtnText: { fontSize: 15, fontWeight: "700", color: P.white },

  // Edit Order — sticky footer (outside the ScrollView) so Save/Discard
  // never scroll out of reach, matching OrderDetailSheet's footer chrome.
  editOrderFooter: {
    flexDirection: "row", gap: SP._8,
    padding: SP._16, backgroundColor: P.white,
    borderTopWidth: 1, borderTopColor: C.gray100,
  },
  // Edit Order — landscape overlay, same centered/padded treatment as
  // Settings → Services' tabletOverlay.
  editModalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center", padding: 32,
  },

  // Landscape card overrides — shared across all bottom-sheet modals
  sheetLandscapeWrapper: {
    width: "100%" as const, maxWidth: 560, alignSelf: "center" as const,
  },
  sheetLandscape: {
    borderRadius: 24,
    marginHorizontal: 0,
    marginBottom: 20,
    // override the top-only radius set by base sheet style
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },

  // Cancel modal
  cancelModalBackdrop: {
    flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(23,32,51,0.45)",
  },
  cancelModalSheet: {
    backgroundColor: P.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    // paddingBottom is applied inline with useSafeAreaInsets().bottom
    paddingTop: SP._12,
    ...SHADOW.lg,
  },
  cancelModalTitle: {
    fontSize: 18, fontWeight: "800", color: P.text,
    paddingHorizontal: SP._16, marginBottom: SP._4,
  },
  cancelModalSub: {
    fontSize: 13, color: P.muted,
    paddingHorizontal: SP._16, marginBottom: SP._12,
  },
  cancelNoPermBanner: {
    marginHorizontal: SP._16, marginBottom: SP._16,
    backgroundColor: P.errorTint, borderRadius: 12, padding: SP._12,
  },
  cancelNoPermText: { fontSize: 13, color: P.errorRed, lineHeight: 18 },
  cancelPaidWarning: {
    marginHorizontal: SP._16, marginBottom: SP._12,
    backgroundColor: P.warningTint, borderRadius: 12, padding: SP._12,
  },
  cancelPaidWarningText: { fontSize: 13, color: P.warning, lineHeight: 18 },
  cancelReasonLabel: {
    fontSize: 12, fontWeight: "700", color: P.muted, letterSpacing: 0.4,
    textTransform: "uppercase", paddingHorizontal: SP._16, marginBottom: SP._8,
  },
  cancelReasonList: {
    flexDirection: "row", flexWrap: "wrap", gap: SP._8,
    paddingHorizontal: SP._16, marginBottom: SP._12,
  },
  cancelReasonChip: {
    paddingHorizontal: SP._12, paddingVertical: SP._8,
    borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: P.border,
    backgroundColor: P.white,
  },
  cancelReasonChipOn: {
    backgroundColor: P.errorRed, borderColor: P.errorRed,
  },
  cancelReasonText: { fontSize: 12, fontWeight: "600", color: P.muted },
  cancelReasonTextOn: { color: P.white },
  cancelNoteInput: {
    marginHorizontal: SP._16, marginBottom: SP._12,
    borderWidth: 1.5, borderColor: P.border, borderRadius: 14,
    paddingHorizontal: SP._12, paddingVertical: SP._10,
    fontSize: 14, color: P.text, backgroundColor: P.white,
  },
  cancelConfirmBtn: {
    backgroundColor: P.errorRed, borderRadius: RADIUS.lg,
    height: 48, alignItems: "center", justifyContent: "center",
    ...SHADOW.brand,
  },
  cancelConfirmText: { fontSize: 15, fontWeight: "700", color: P.white },

  // ── Queue filter chips ──────────────────────────────────────────────────────
  filterScroll: { backgroundColor: P.bg, flexGrow: 0, flexShrink: 0 },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP._6,
    paddingHorizontal: SP._14,
    paddingVertical: SP._8,
  },
  filterChip: {
    paddingHorizontal: SP._12,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: P.white,
    borderWidth: 1,
    borderColor: P.border,
    alignSelf: "flex-start",
  },
  filterChipActive: {
    backgroundColor: P.blueTint,
    borderColor: P.blueLight,
  },
  filterChipText: { fontSize: 12, fontWeight: "500", color: P.muted },
  filterChipTextActive: { color: P.blue, fontWeight: "700" },
  filterBadge: { backgroundColor: C.gray200, borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1, minWidth: 16, alignItems: "center" },
  filterBadgeActive: { backgroundColor: P.blue },
  filterBadgeText: { fontSize: 9, fontWeight: "700", color: C.gray500 },
  filterBadgeTextActive: { color: P.white },

  // ── Queue order cards — compact cashier-first layout ────────────────────────
  // borderWidth is always 2 (transparent by default) so toggling selection
  // only ever changes color, never the box model — a conditional 0↔2
  // borderWidth here previously forced a Yoga re-layout on selection change
  // that could leave the affected row unpainted on Android until re-tapped.
  qCard: {
    backgroundColor: P.white,
    borderRadius: RADIUS.md,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
    ...SHADOW.xs,
  },
  // Landscape master-detail: marks which card the open detail panel belongs to.
  qCardSelected: {
    borderColor: P.blue,
    backgroundColor: P.blueTint,
  },
  qStripe: { width: 4 },
  qBody: { flex: 1, paddingHorizontal: SP._10, paddingVertical: SP._8 },

  // Row A: ticket col (fixed) + content col (flex)
  qRowA: { flexDirection: "row", alignItems: "flex-start", gap: SP._8 },
  qTicketCol: { alignItems: "center", minWidth: 36 },
  qTicketTile: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: P.blueTint,
    alignItems: "center", justifyContent: "center",
  },
  qTicketNum: {
    fontSize: 14, fontWeight: "800", color: P.blue,
    letterSpacing: -0.3, lineHeight: 18,
    fontVariant: ["tabular-nums"] as any,
  },
  qTicketLabel: { fontSize: 7, color: P.muted, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },

  // Row A1: name + amount (inside content col)
  qRowA1: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  qName: { flex: 1, fontSize: 14, fontWeight: "700", color: P.text },
  qAmt: { fontSize: 14, fontWeight: "800", color: P.text, marginLeft: SP._8 },

  // Row A2: combined items · time
  qServices: { fontSize: 11, color: P.muted, marginBottom: SP._6 },
  qTime: { fontSize: 10, color: P.muted },

  // Row A3: status chip + [Cancel] + [inline CTA]
  qRow3: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  qRowA3: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  qRowActions: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  qCancelText: { fontSize: 11, color: P.muted, fontWeight: "600" },
  qCTA: {
    paddingHorizontal: SP._12, paddingVertical: 5,
    borderRadius: RADIUS.sm,
  },
  qCTAText: { fontSize: 12, fontWeight: "700", color: P.white },

  // Badges row — separate from the primary CTA so status/payment chips
  // never compete visually with the advance action below them.
  qBadgeRow: { flexDirection: "row", alignItems: "center", marginTop: SP._8 },
  qCancelOutlineText: { fontSize: 11, fontWeight: "700", color: P.errorRed },
  // Portrait: full-width primary action anchoring the bottom of the card.
  qCTAPortrait: {
    marginTop: SP._12, alignSelf: "stretch",
    paddingVertical: SP._12, alignItems: "center", justifyContent: "center",
  },
  // Landscape: content-sized, vertically centered inline with the row —
  // never stretched wall-to-wall.
  qCTALandscape: {
    minWidth: 160, alignItems: "center",
    paddingHorizontal: SP._16, paddingVertical: SP._12,
  },

  // ── Landscape queue card — single dense row, three proportioned zones ──────
  // identity 38% / status+waiting 24% / price+action 38% — the price+action
  // zone needs to reliably clear qCTALandscape's 160 minWidth, and status+
  // waiting needs room for two chips (e.g. "Ready for Pickup" + "Paid") on
  // one line, now that this card lives in the (narrower) Queue-tab list
  // column instead of a full-width list. The chip row itself also wraps
  // (see the two-Chip View below) as a fallback at the narrowest column widths.
  qLsRow: {
    flex: 1, flexDirection: "row", alignItems: "center",
    paddingHorizontal: SP._14, paddingVertical: SP._12, gap: SP._12,
  },
  qLsLeft: { flex: 38, flexDirection: "row", alignItems: "center", gap: SP._10, minWidth: 0 },
  qLsMid: { flex: 24, alignItems: "flex-start", gap: 6, minWidth: 0 },
  qLsWaiting: { fontSize: 11, color: C.gray600, fontWeight: "600" },
  qLsRight: { flex: 38, alignItems: "flex-end", justifyContent: "center", gap: SP._8, minWidth: 0 },
  qLsActionsRow: { flexDirection: "row", alignItems: "center", gap: SP._8, alignSelf: "stretch" },
  qLsDivider: { width: 1, alignSelf: "stretch", backgroundColor: C.gray200, marginVertical: SP._4 },
  qCancelLandscapeBtn: {
    minWidth: 110, alignItems: "center",
    paddingHorizontal: SP._14, paddingVertical: SP._12,
    borderRadius: RADIUS.sm, borderWidth: 1.5, borderColor: P.errorRed,
  },
  qCancelLandscapeText: { fontSize: 12, fontWeight: "700", color: P.errorRed },

  // ── Order detail sheet footer actions ───────────────────────────────────
  detailSecondaryRow: { flexDirection: "row", gap: SP._8 },
  detailSecondaryBtn: {
    flex: 1, height: 40, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center",
    backgroundColor: C.gray100, borderWidth: 1, borderColor: C.gray200,
  },
  detailSecondaryText: { fontSize: 13, fontWeight: "600", color: P.muted },
  detailAdvanceBtn: {
    height: 50, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center",
  },
  detailAdvanceText: { fontSize: 15, fontWeight: "800", color: P.white },

  // ── Processing confirmation modal ───────────────────────────────────────
  pmOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center", alignItems: "center", padding: SP._24,
  },
  pmCard: {
    backgroundColor: P.white, borderRadius: RADIUS.lg,
    padding: SP._24, width: "100%", maxWidth: 360,
  },
  pmTitle: { fontSize: 17, fontWeight: "700", color: P.text, marginBottom: SP._8 },
  pmBody: { fontSize: 14, color: P.muted, lineHeight: 20, marginBottom: SP._24 },
  pmActions: { flexDirection: "row", gap: SP._12 },
  pmCancel: {
    flex: 1, paddingVertical: 11, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: P.border, alignItems: "center",
  },
  pmCancelText: { fontSize: 14, fontWeight: "600", color: P.text },
  pmConfirm: {
    flex: 1, paddingVertical: 11, borderRadius: RADIUS.md,
    backgroundColor: P.blue, alignItems: "center",
  },
  pmConfirmText: { fontSize: 14, fontWeight: "700", color: P.white },

  // Full-width CTA at bottom of card (Mark Claimed, etc.)
  qAdvBtn: {
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: P.border,
  },
  qAdvBtnText: { fontSize: 13, fontWeight: "700", color: P.white, letterSpacing: 0.2 },

  // ── Claim tab toggle ────────────────────────────────────────────────────
  claimToggleRow: {
    flexDirection: "row",
    gap: SP._8,
    marginHorizontal: SP._14,
    marginTop: SP._12,
    marginBottom: SP._8,
    backgroundColor: P.bg,
    paddingBottom: SP._4,
  },
  claimToggleBtn: {
    flex: 1,
    paddingVertical: SP._10,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: P.border,
    backgroundColor: P.white,
    alignItems: "center",
  },
  claimToggleBtnActive: {
    borderColor: P.blue,
    backgroundColor: P.blueTint,
  },
  claimToggleBtnText: { fontSize: 13, fontWeight: "600", color: P.muted },
  claimToggleBtnTextActive: { color: P.blue },

  // ── Claim lookup card ──────────────────────────────────────────────────────
  lookupCardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: SP._12 },
  lookupCardTitle: { fontSize: 16, fontWeight: "800", color: P.text, marginBottom: 2 },
  lookupCardSub: { fontSize: 11, color: P.muted },
  lookupInputRow: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: P.border, borderRadius: 12,
    backgroundColor: P.white, marginTop: SP._10, marginBottom: SP._6,
  },
  lookupInputRowError: { borderColor: P.errorRed, backgroundColor: P.errorTint },
  lookupInputRowFound: { borderColor: P.success },
  lookupInputLarge: {
    flex: 1, paddingHorizontal: SP._14, paddingVertical: SP._12,
    fontSize: 20, fontWeight: "800", color: P.text,
    textAlign: "left", letterSpacing: 3,
    fontVariant: ["tabular-nums"] as any,
  },
  lookupNoMatch: { fontSize: 11, color: P.errorRed, marginBottom: SP._4 },
  lookupFound: { fontSize: 11, color: P.success, fontWeight: "600", marginBottom: SP._4 },
  // Matched order — prominent green result card
  matchedCard: {
    backgroundColor: P.successTint, borderRadius: 12,
    borderWidth: 1.5, borderColor: P.success,
    padding: SP._12, marginBottom: SP._12, gap: SP._8,
  },
  matchedTop: { flexDirection: "row", alignItems: "flex-start" },
  matchedName: { fontSize: 15, fontWeight: "800", color: P.text },
  matchedMeta: { fontSize: 11, color: P.muted, marginTop: 2 },
  matchedAmt: { fontSize: 15, fontWeight: "800", color: P.text },
  matchedCodeRow: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  matchedCodeLabel: { fontSize: 9, fontWeight: "700", color: P.success, letterSpacing: 0.5 },
  matchedCodeValue: {
    fontSize: 18, fontWeight: "800", color: P.text, letterSpacing: 4,
    fontVariant: ["tabular-nums"] as any,
  },
  matchedClaimBtn: {
    backgroundColor: P.success, borderRadius: 10,
    paddingVertical: SP._10, alignItems: "center",
  },
  matchedClaimBtnText: { fontSize: 14, fontWeight: "700", color: P.white },
  // Ready-for-pickup section label — slightly more visible than sectionMeta
  readySectionLabel: { fontSize: 11, fontWeight: "700", color: P.muted, letterSpacing: 0.8 },
  // Code inline in ready cards — system data feel, monospace
  claimCodeInline: {
    fontSize: 13, fontWeight: "700", color: P.success,
    letterSpacing: 2, fontVariant: ["tabular-nums"] as any,
  },
  // Highlighted card when typed code matches this card
  qCardHighlighted: { borderWidth: 1.5, borderColor: P.success },

});
