// Services list + empty-state presentational components. Extracted from services.tsx.
import React from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { C, SP } from "../../theme/tokens";
import { Card } from "../../components/ui";
import { IconPlus, IconStar, IconEdit, IconTrash } from "../../components/ui/icons";
import { calcServiceMargin, getMarginColor, formatCurrency, type Service, type StatusFilter } from "./model";
import { styles } from "./styles";

export function EmptyIllustration({ type }: Readonly<{ type: "active" | "inactive" | "archived" }>) {
  if (type === "inactive") {
    return <Ionicons name="pause-circle-outline" size={72} color={C.gray300} />;
  }
  if (type === "archived") {
    return <Ionicons name="archive-outline" size={72} color={C.gray300} />;
  }
  return <MaterialCommunityIcons name="file-plus-outline" size={72} color={C.gray300} />;
}

// ─── Category dot colors (matches design spec) ────────────────────────────────
const CAT_DOT_COLOR: Record<string, string> = {
  "Wash & Fold": C.brand500,
  "Wash & Iron": C.brand500,
  "Wash Only":   C.brand500,
  "Dry Clean":   C.accent500,
  "Iron Only":   C.warning500,
  "Express":     C.error500,
  "Delicate":    C.purple700,
  "Bedding":     C.purple700,
  "Curtains":    C.gray500,
  "Shoes":       C.gray500,
  "Bags":        C.gray500,
  "Other":       C.gray500,
  // legacy fallbacks so old in-memory values still get a color
  "Wash":        C.brand500,
  "Dry":         C.accent500,
  "Iron":        C.warning500,
  "Premium":     C.purple700,
};

// ─── Types & Constants ────────────────────────────────────────────────────────
export function EmptyServicesBox({ cfg, isFirstService, statusFilter }: Readonly<{
  cfg: { title: string; desc: string; cta?: string; ctaAction?: () => void };
  isFirstService: boolean;
  statusFilter: StatusFilter;
}>) {
  return (
    <View style={styles.emptyBox}>
      <View style={styles.emptyIllustration}>
        <EmptyIllustration type={statusFilter} />
      </View>
      <Text style={styles.emptyTitle}>{cfg.title}</Text>
      <Text style={styles.emptyDesc}>{cfg.desc}</Text>
      {cfg.cta && cfg.ctaAction && (
        <TouchableOpacity style={styles.emptyAction} onPress={cfg.ctaAction} activeOpacity={0.8}>
          {isFirstService && statusFilter === "active" && <IconPlus color={C.white} />}
          <Text style={styles.emptyActionText}>{cfg.cta}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── ServicesListSection ───────────────────────────────────────────────────────

interface ServicesListSectionProps {
  featuredServices: Service[];
  searchText: string;
  statusFilter: StatusFilter;
  visibleGrouped: Record<string, Service[]>;
  visible: Service[];
  onToggleFeatured: (svc: Service) => void;
  onEdit: (svc: Service) => void;
  onArchive: (svc: Service) => void;
  onRestore: (svc: Service) => void;
  canEdit: boolean;
  canRestore: boolean;
  canArchive: boolean;
}

// Memoized: this list stays mounted behind the add/edit modal, so without the
// bail-out every keystroke in the form re-renders all ~100 service cards. All
// props must keep stable identities (see the useMemo/useCallback in ServicesScreen).
export const ServicesListSection = React.memo(function ServicesListSection({
  featuredServices, searchText, statusFilter, visibleGrouped, visible,
  onToggleFeatured, onEdit, onArchive, onRestore, canEdit, canRestore, canArchive,
}: Readonly<ServicesListSectionProps>) {
  return (
    <>
      {featuredServices.length > 0 && searchText.trim() === "" && (
        <View style={styles.featuredSection}>
          <View style={styles.featuredLabel}>
            <View style={styles.featuredBadge}><IconStar size={12} color={C.warning700} /></View>
            <Text style={styles.featuredLabelText}>Featured</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.featuredScroll}
            contentContainerStyle={styles.featuredContent}
          >
            {featuredServices.map((svc) => {
              const m = calcServiceMargin(svc);
              const marginDisplay = m === null ? "—" : `${m.toFixed(0)}%`;
              return (
                <TouchableOpacity key={svc.id} style={styles.featuredCard} onPress={() => onEdit(svc)} disabled={!canEdit} activeOpacity={canEdit ? 0.75 : 1}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Text style={styles.featuredCardName} numberOfLines={1}>{svc.name}</Text>
                    <IconStar size={12} color={C.warning500} />
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: SP._6, gap: 2 }}>
                    <Text style={styles.featuredCardPrice}>{formatCurrency(svc.price)}</Text>
                    <Text style={styles.featuredCardUnit}>/{svc.unit}</Text>
                  </View>
                  <Text style={styles.featuredCardMargin}>margin {marginDisplay}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {statusFilter === "active" && Object.entries(visibleGrouped).map(([category, svcs]) => (
        <View key={category} style={styles.categoryGroup}>
          <Text style={styles.categoryHeader}>{category.toUpperCase()}</Text>
          <View style={{ gap: SP._10 }}>
            {svcs.map((svc) => {
              const m = calcServiceMargin(svc);
              const noCostData = svc.cost === 0;
              const marginColor = noCostData ? C.gray400 : getMarginColor(m);
              const dotColor = CAT_DOT_COLOR[svc.category] ?? C.gray400;
              const marginValue = m === null ? "—" : `${m.toFixed(0)}% margin`;
              const marginDisplay = noCostData ? "cost not set" : marginValue;
              return (
                <Card key={svc.id} elevation="sm" padding={14} style={styles.serviceCard}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: SP._12 }}>
                    <View style={[styles.catDot, { backgroundColor: dotColor }]} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.serviceCardName}>{svc.name}</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: SP._6, marginTop: 2 }}>
                        <Text style={styles.serviceCardPrice}>{formatCurrency(svc.price)}</Text>
                        <Text style={styles.serviceCardUnit}>/{svc.unit}</Text>
                        {svc.cost > 0 && (
                          <Text style={styles.serviceCardCost}>· supplies {formatCurrency(svc.cost)}</Text>
                        )}
                        <Text style={[styles.serviceMarginText, { color: marginColor }]}>· {marginDisplay}</Text>
                      </View>
                    </View>
                    <TouchableOpacity hitSlop={8} onPress={() => onToggleFeatured(svc)}>
                      <IconStar size={18} color={svc.isFeatured ? C.warning500 : C.gray300} />
                    </TouchableOpacity>
                    {canEdit && (
                      <TouchableOpacity onPress={() => onEdit(svc)} hitSlop={8} activeOpacity={0.7}>
                        <IconEdit />
                      </TouchableOpacity>
                    )}
                    {canArchive && (
                      <TouchableOpacity onPress={() => onArchive(svc)} hitSlop={8} activeOpacity={0.7}>
                        <IconTrash />
                      </TouchableOpacity>
                    )}
                  </View>
                </Card>
              );
            })}
          </View>
        </View>
      ))}

      {(statusFilter === "archived" || statusFilter === "inactive") && visible.map((svc) => {
        const daysLeft = svc.hardDeleteAt
          ? Math.max(0, Math.ceil((svc.hardDeleteAt.getTime() - Date.now()) / 86400000))
          : 30;
        return (
          <Card key={svc.id} elevation="sm" padding={14} style={{ ...styles.archivedServiceCard, opacity: 0.75, marginBottom: 10 }}>
            <View style={styles.archivedServiceTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.archivedServiceName}>{svc.name}</Text>
                <Text style={styles.archivedServiceDate}>
                  {statusFilter === "archived"
                    ? `Permanently deleted in ${daysLeft}d`
                    : `${formatCurrency(svc.price)} · ${svc.unit} · Inactive`}
                </Text>
              </View>
              {statusFilter === "archived" ? (
                <TouchableOpacity onPress={() => onRestore(svc)} disabled={!canRestore} activeOpacity={0.7}>
                  <Text style={[styles.restoreBtn, !canRestore && { opacity: 0.4 }]}>Restore</Text>
                </TouchableOpacity>
              ) : canEdit ? (
                <TouchableOpacity onPress={() => onEdit(svc)} activeOpacity={0.7}>
                  <Text style={styles.restoreBtn}>Edit</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </Card>
        );
      })}

      {visible.length > 0 && <Text style={styles.endOfList}>— End of results —</Text>}
    </>
  );
});
