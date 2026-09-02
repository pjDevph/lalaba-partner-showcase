// app/(staff)/chat.tsx
// Staff Messages — the same provider conversations screen the owner sees,
// mounted in the STAFF stack.
//
// The list is scoped server-side: a staff member resolves through their
// employer, so they answer AS the branch, and only for the branch their
// approved device pins them to. Gated on the Orders permission, because the
// conversation exists to service an order.
import React from "react";
import { View, Text } from "react-native";
import { C, SP } from "../../src/theme/tokens";
import { useEffectivePermissions } from "../../src/hooks/usePermission";
import { canAccessStaffDestination } from "../../src/features/staff/staffNav";
import { ProviderConversationsScreen } from "../../src/screens/providerChat/ProviderConversationsScreen";

export default function StaffChat() {
  // Same check the tab and sidebar use — see features/staff/staffNav.
  const perms = useEffectivePermissions();
  const canChat = canAccessStaffDestination(perms, "chat");

  if (!canChat) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: SP._24, backgroundColor: C.white }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: C.gray800, marginBottom: 6 }}>
          Messages not available
        </Text>
        <Text style={{ fontSize: 13, color: C.gray500, textAlign: "center", lineHeight: 19 }}>
          Customer messages come with Orders access. Ask the owner to grant it
          for this branch.
        </Text>
      </View>
    );
  }

  return <ProviderConversationsScreen basePath="/(staff)" />;
}
