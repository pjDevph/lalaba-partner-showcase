// app/(tabs)/chat.tsx
// Merchant Messages — thin wrapper over the shared provider conversations
// screen. Reached from the dashboard header chat icon (the merchant has no
// Chat tab).
import React from "react";
import { ProviderConversationsScreen } from "../../src/screens/providerChat/ProviderConversationsScreen";

export default function MerchantChat() {
  return <ProviderConversationsScreen basePath="/(tabs)" />;
}
