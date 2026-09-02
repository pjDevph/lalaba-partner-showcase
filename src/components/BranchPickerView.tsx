// src/components/BranchPickerView.tsx
// Shared branch selection screen used by Services, POS, and Tasks tabs.
// Renders a full SafeAreaView with HeroHeader, search bar, and virtualized FlatList.
// FlatList handles 1000+ branches without janking — only visible rows render.

import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { HeroHeader, TopBar } from "./ui";
import { C, RADIUS, SP } from "../theme/tokens";
import type { Branch } from "../stores/merchantStore";

interface BranchPickerViewProps {
  title: string;
  subtitle?: string;
  branches: Branch[];
  onSelect: (branchId: string) => void;
  /** Optional extra line under address (e.g. "3 services", "2 staff") */
  getMetaText?: (b: Branch) => string;
  /** Optional count badge on the right of the row (e.g. pending approvals). 0 hides it. */
  getBadgeCount?: (b: Branch) => number;
  /** When provided, renders a TopBar with back button instead of HeroHeader */
  onBack?: () => void;
  /** Optional element rendered at the header's right edge (e.g. account avatar). */
  right?: React.ReactNode;
  /**
   * Use the blue HeroHeader (matching the Settings header) with a back button,
   * instead of the white TopBar. Keeps the picker's header color consistent
   * with the rest of that screen's headers.
   */
  blueHeader?: boolean;
  /** Pull-to-refresh — e.g. re-fetching device counts/meta text without leaving the picker. */
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function BranchPickerView({
  title,
  subtitle,
  branches,
  onSelect,
  getMetaText,
  getBadgeCount,
  onBack,
  right,
  blueHeader = false,
  refreshing,
  onRefresh,
}: Readonly<BranchPickerViewProps>) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.address ?? "").toLowerCase().includes(q)
    );
  }, [branches, search]);

  const pluralSuffix = branches.length !== 1 ? "es" : "";
  const branchCountLabel =
    filtered.length === branches.length
      ? `${branches.length} branch${pluralSuffix}`
      : `${filtered.length} of ${branches.length}`;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: C.white }]} edges={["top"]}>
      {/* `blueHeader` used to pick a different-coloured header; headers are one
          white treatment now, so it only chooses the compact variant. */}
      {blueHeader
        ? <HeroHeader compact noWave title={title} subtitle={subtitle ?? "Select a branch"} onBack={onBack} right={right} />
        : onBack
          ? <TopBar title={title} onBack={onBack} right={right} />
          : <HeroHeader title={title} subtitle={subtitle ?? "Select a branch"} right={right} />
      }

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={15} color={C.gray400} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search branches..."
            placeholderTextColor={C.gray400}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch("")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={14} color={C.gray400} />
            </TouchableOpacity>
          )}
        </View>
        {branches.length > 0 && (
          <Text style={styles.countHint}>{branchCountLabel}</Text>
        )}
      </View>

      {/* Virtualized branch list — only visible rows are in the render tree */}
      <FlatList
        data={filtered}
        keyExtractor={(b) => b.id}
        style={{ flex: 1, backgroundColor: C.gray100 }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>
              {search.trim()
                ? `No branches match "${search.trim()}"`
                : "No branches found"}
            </Text>
            {!search.trim() && (
              <Text style={styles.emptyDesc}>
                Add a branch in Settings to get started.
              </Text>
            )}
          </View>
        }
        renderItem={({ item: b }) => (
          <TouchableOpacity
            style={styles.branchCard}
            onPress={() => onSelect(b.id)}
            activeOpacity={0.75}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.branchCardName} numberOfLines={1}>{b.name}</Text>
              {!!b.address && (
                <Text style={styles.branchCardAddr} numberOfLines={1}>{b.address}</Text>
              )}
              {getMetaText ? (
                <Text style={styles.branchCardMeta}>{getMetaText(b)}</Text>
              ) : null}
            </View>
            {(() => {
              const count = getBadgeCount?.(b) ?? 0;
              return count > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
                </View>
              ) : null;
            })()}
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path
                d="M9 18l6-6-6-6"
                stroke={C.gray400}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.gray100 },

  searchRow: {
    backgroundColor: C.white,
    paddingHorizontal: SP._16,
    paddingVertical: SP._12,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
    gap: SP._6,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.gray100,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.gray200,
    paddingHorizontal: SP._12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: C.gray900,
    paddingVertical: 0,
  },
  countHint: {
    fontSize: 11,
    color: C.gray400,
    textAlign: "right",
  },

  listContent: { padding: SP._16, paddingBottom: 100 },

  branchCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.white,
    borderRadius: RADIUS.lg,
    padding: SP._16,
    marginBottom: SP._10,
    borderWidth: 1,
    borderColor: C.gray100,
  },
  branchCardName: { fontSize: 15, fontWeight: "700", color: C.gray900, marginBottom: 2 },
  branchCardAddr: { fontSize: 12, color: C.gray500, marginBottom: 2 },
  branchCardMeta: { fontSize: 12, fontWeight: "600", color: C.brand600 },

  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.warning500,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
    marginRight: SP._8,
  },
  badgeText: { color: C.white, fontSize: 12, fontWeight: "800" },

  emptyBox: { paddingVertical: 60, alignItems: "center" },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: C.gray700, marginBottom: 6, textAlign: "center" },
  emptyDesc:  { fontSize: 13, color: C.gray400, textAlign: "center" },
});
