// Registration success screen (tablet card + mobile immersive). Extracted from app/register.tsx.
import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../../theme/tokens";
import { I } from "./shared";
import { S } from "./styles";

export function RegistrationSuccess({ landscape, isGoogleFlow, isWasher = false, onSetupNow, onSetupLater }: Readonly<{
  landscape: boolean;
  isGoogleFlow: boolean;
  /** Washers have no branches, so none of the branch-setup copy applies to them. */
  isWasher?: boolean;
  onSetupNow: () => void;
  onSetupLater: () => void;
}>) {
  // Every string here used to be merchant-only, so a home washer was told they
  // had created a "Merchant Account" and offered to set up a branch.
  const accountLabel = isWasher ? "Washer" : "Merchant";
  const readySub = isWasher
    ? "Your account is ready. Set up your profile to start accepting orders in your area."
    : "Your account is ready. Set up your first branch to start accepting orders, managing services, and processing payments.";
  const verifySub =
    "One more step — verify your email address to activate your account and unlock full access.";
  const setupNowLabel = isWasher ? "Set Up My Profile" : "Set Up My First Branch";
  const footnote = isGoogleFlow
    ? "You can always complete setup from the dashboard at any time."
    : isWasher
      ? "You'll choose when to set up your profile after verifying."
      : "You'll choose when to set up your branch after verifying.";
  if (landscape) {
    return (
      <SafeAreaView style={S.successSafe} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={S.successScrollTablet}
          showsVerticalScrollIndicator={false}
        >
          <View style={S.successCard}>
            <View style={S.successCardIconRing}>
              <I.Success c={C.brand500} s={44} />
            </View>
            <Text style={S.successCardTitle}>{accountLabel} Account{"\n"}Created!</Text>
            <Text style={S.successCardSub}>
              {isGoogleFlow ? readySub : verifySub}
            </Text>
            <TouchableOpacity
              style={S.successCardCta}
              onPress={onSetupNow}
              activeOpacity={0.85}
            >
              <Text style={S.successCardCtaText}>
                {isGoogleFlow ? setupNowLabel : "Verify Email Address"}
              </Text>
            </TouchableOpacity>
            {isGoogleFlow && (
              <TouchableOpacity
                style={S.successSkip}
                onPress={onSetupLater}
                activeOpacity={0.7}
              >
                <Text style={S.successCardSkipText}>{"I'll set it up later"}</Text>
              </TouchableOpacity>
            )}
            <Text style={S.successCardNote}>{footnote}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Mobile / tablet portrait: full-blue immersive
  return (
    <SafeAreaView style={S.successSafe} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={S.successScroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={S.successIconRing}>
          <I.Success c={C.white} s={48} />
        </View>

        <Text style={S.successTitle}>{accountLabel} Account{"\n"}Created!</Text>
        <Text style={S.successSub}>
          {isGoogleFlow ? readySub : verifySub}
        </Text>

        <TouchableOpacity
          style={S.successCta}
          onPress={onSetupNow}
          activeOpacity={0.85}
        >
          <Text style={S.successCtaText}>
            {isGoogleFlow ? setupNowLabel : "Verify Email Address"}
          </Text>
        </TouchableOpacity>

        {isGoogleFlow && (
          <TouchableOpacity
            style={S.successSkip}
            onPress={onSetupLater}
            activeOpacity={0.7}
          >
            <Text style={S.successSkipText}>{"I'll set it up later"}</Text>
          </TouchableOpacity>
        )}

        <Text style={S.successNote}>{footnote}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
