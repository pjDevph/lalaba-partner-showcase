// src/screens/pos/POSHeader.tsx
// Unified POS header — one consistent bar across the Terminal, Queue and Claim
// tabs. Left: tab title + branch (a dropdown for merchants and multi-branch
// staff, otherwise the branch name plus the network status pill). Right:
// portrait fullscreen toggle and portrait merchant avatar.
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { C, SP } from "../../theme/tokens";
import { S } from "./styles";
import { Icon } from "./shared";
import { NetworkStatusPill } from "./Banners";
import { AvatarMenu } from "../dashboard/AvatarMenu";
import { StaffNotificationBell } from "../../components/staff/StaffNotificationBell";

export interface POSHeaderProps {
  readonly insetsTop: number;
  readonly title: string;
  readonly branchName: string | null;
  /** Merchants and multi-branch staff — show a tappable branch dropdown instead of the pill. */
  readonly showBranchDropdown: boolean;
  readonly onOpenBranchMenu: () => void;
  readonly showFullscreen: boolean;
  readonly posFullScreen: boolean;
  readonly onToggleFullscreen: () => void;
  readonly showAvatar: boolean;
  /** Staff only — the owner's bell lives on the dashboard. */
  readonly showBell?: boolean;
  readonly avatarInitials: string;
}

export function POSHeader({
  insetsTop, title, branchName, showBranchDropdown, onOpenBranchMenu,
  showFullscreen, posFullScreen, onToggleFullscreen,
  showAvatar, avatarInitials, showBell = false,
}: POSHeaderProps) {
  return (
    <View style={[S.header, { paddingTop: insetsTop + SP._6 }]}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: SP._8 }}>
          <Text style={S.headerTitle}>{title}</Text>
          {showFullscreen && (
            <TouchableOpacity
              style={S.headerFsBtn}
              onPress={onToggleFullscreen}
              activeOpacity={0.8}
              accessibilityLabel={posFullScreen ? "Exit full screen" : "Full screen"}
            >
              {posFullScreen ? <Icon.Collapse c={C.gray700} /> : <Icon.Expand c={C.gray700} />}
            </TouchableOpacity>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
          {showBranchDropdown ? (
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 }}
              onPress={onOpenBranchMenu}
              activeOpacity={0.7}
            >
              <Text style={S.headerSub} numberOfLines={1}>{branchName ?? "Select branch"}</Text>
              <Icon.ChevronDown c={C.gray700} s={16} />
            </TouchableOpacity>
          ) : (
            <>
              <Text style={S.headerSub} numberOfLines={1}>{branchName ?? "Terminal"}</Text>
              <NetworkStatusPill />
            </>
          )}
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SP._8 }}>
        {/* Staff have no dashboard to carry a bell, and POS is where they
            spend the shift — so it lives here for them. The owner reaches
            notifications from the dashboard instead. */}
        {showBell && <StaffNotificationBell />}
        {showAvatar && <AvatarMenu initials={avatarInitials} />}
      </View>
    </View>
  );
}
