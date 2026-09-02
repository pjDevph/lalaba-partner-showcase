// src/components/CampaignPopup.tsx
// The promotional popup, rendered once at the root.
//
// Everything about WHETHER to show is decided by the backend — audience,
// schedule, and how often. This component asks once per authenticated session
// and renders whatever comes back, which is usually nothing.
//
// Deliberately no local "already shown" flag. A device-side record would reset
// on reinstall and bring a once-only campaign back, and would disagree with
// itself across two devices for the same account. The impression table on the
// server is the single answer.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";

import { C, RADIUS, SP } from "../theme/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../stores/authStore";
import {
  gqlMarkCampaignClicked,
  gqlMarkCampaignDismissed,
  gqlNextCampaign,
  type CampaignPopup as Campaign,
} from "../services/graphql/campaigns";

/**
 * Identifies this sign-in for "every login" campaigns.
 *
 * Module-level and regenerated whenever the app becomes authenticated again,
 * which is what "a login" means from the app's side. Not persisted — surviving
 * a restart would make it a device id, not a session.
 */
let sessionId: string | null = null;
function newSessionId(): string {
  sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return sessionId;
}

export function CampaignPopup() {
  // This app has no auth `status` enum — a resolved user IS the signal that
  // there is an identity to ask about. Same meaning, different vocabulary.
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const { width, height } = useWindowDimensions();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [imageReady, setImageReady] = useState(false);
  // One ask per authenticated session. Without this, any re-render that
  // re-runs the effect would ask again — harmless for the user (the server
  // refuses) but a request per render is still a request per render.
  const askedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!uid) {
      // Signed out: forget the session so the next sign-in is a new one.
      askedFor.current = null;
      sessionId = null;
      setCampaign(null);
      return;
    }

    const id = sessionId ?? newSessionId();
    if (askedFor.current === id) return;
    askedFor.current = id;

    let cancelled = false;
    void (async () => {
      try {
        const next = await gqlNextCampaign(id);
        if (!cancelled && next) {
          setImageReady(false);
          setCampaign(next);
        }
      } catch {
        // A popup is never worth an error in front of someone. If the request
        // fails there is simply no popup, and the next session asks again.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const close = useCallback(
    (target: Campaign) => {
      setCampaign(null);
      // Fire-and-forget: analytics must never delay dismissing something the
      // person has just asked to get rid of.
      void gqlMarkCampaignDismissed(target._id).catch(() => {});
    },
    [],
  );

  const act = useCallback((target: Campaign) => {
    setCampaign(null);
    void gqlMarkCampaignClicked(target._id).catch(() => {});
    if (target.actionType === "DEEP_LINK" && target.deepLink) {
      router.push(target.deepLink as never);
    }
    // PROMO deliberately does nothing yet beyond recording the tap — claiming
    // a voucher is a later phase, and a button that silently fails to grant
    // one would be worse than a button that just closes.
  }, []);

  if (!campaign) return null;

  // Portrait card, capped so a very tall image cannot push the close button
  // off-screen on a small handset.
  const cardWidth = Math.min(width - SP._24 * 2, 420);
  const maxCardHeight = height * 0.75;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => close(campaign)}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          alignItems: "center",
          justifyContent: "center",
          padding: SP._24,
        }}
      >
        <View style={{ width: cardWidth, maxHeight: maxCardHeight }}>
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={campaign.altText ?? campaign.name}
            onPress={() => act(campaign)}
            style={{
              borderRadius: RADIUS.lg,
              overflow: "hidden",
              backgroundColor: C.white,
            }}
          >
            <Image
              source={{ uri: campaign.imageUrl }}
              style={{ width: "100%", aspectRatio: 3 / 4 }}
              resizeMode="cover"
              onLoadEnd={() => setImageReady(true)}
            />
            {!imageReady && (
              <View
                style={{
                  ...StyleSheetAbsoluteFill,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ActivityIndicator color={C.brand500} />
              </View>
            )}
          </Pressable>

          {/* Below the card, not floating over the artwork — a close control
              on top of an unknown image can land on a dark patch and vanish. */}
          <Pressable
            onPress={() => close(campaign)}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            style={{
              marginTop: SP._16,
              alignSelf: "center",
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingVertical: SP._8,
              paddingHorizontal: SP._16,
            }}
          >
            <Ionicons name="close" size={16} color={C.white} />
            <Text style={{ color: C.white, fontSize: 14, fontWeight: "600" }}>
              Close
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const StyleSheetAbsoluteFill = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};
