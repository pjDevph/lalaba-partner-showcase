// Step 3 — review entered info + Terms/Privacy agreement. Extracted from app/register.tsx.
import React from "react";
import { View, Text, TouchableOpacity, Linking } from "react-native";
import { I } from "./shared";
import { S } from "./styles";

export function ReviewStep({
  firstName, lastName, email, mobile, roleName, isGoogleFlow,
  agreeTerms, agreePrivacy, onEditAccount, onEditRole, onOpenTerms, onOpenPrivacy,
}: Readonly<{
  firstName: string; lastName: string; email: string; mobile: string; roleName: string;
  isGoogleFlow: boolean; agreeTerms: boolean; agreePrivacy: boolean;
  onEditAccount: () => void; onEditRole: () => void; onOpenTerms: () => void; onOpenPrivacy: () => void;
}>) {
  return (
        <View>
          <Text style={S.stepTitle}>Review your application</Text>
          <Text style={S.stepSub}>
            Make sure your information is correct before submitting.
          </Text>

          {/* Account summary */}
          <View style={S.reviewSection}>
            <View style={S.reviewSectionHeader}>
              <Text style={S.reviewSectionTitle}>Account</Text>
              {!isGoogleFlow && (
                <TouchableOpacity onPress={onEditAccount} hitSlop={8}>
                  <Text style={S.reviewEditLink}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={S.reviewItem}>{[firstName, lastName].filter(Boolean).join(" ") || "—"}</Text>
            <Text style={S.reviewItem}>{email || "—"}</Text>
            <Text style={S.reviewItem}>{mobile || "—"}</Text>
          </View>

          {/* Role summary */}
          <View style={S.reviewSection}>
            <View style={S.reviewSectionHeader}>
              <Text style={S.reviewSectionTitle}>Role</Text>
              <TouchableOpacity onPress={onEditRole} hitSlop={8}>
                <Text style={S.reviewEditLink}>Edit</Text>
              </TouchableOpacity>
            </View>
            <Text style={S.reviewItem}>
              {roleName}
            </Text>
          </View>

          {/* Agreement */}
          <View style={S.reviewSection}>
            <Text style={S.reviewSectionTitle}>Agreement</Text>

            {/* Terms row — tapping opens the modal; checkbox is display-only */}
            <TouchableOpacity
              style={S.agreeRow}
              onPress={onOpenTerms}
              activeOpacity={0.8}
            >
              <I.CheckSquare checked={agreeTerms} />
              <Text style={S.agreeText}>
                {"I have read and agree to the "}
                <Text style={S.agreeLink}>Terms and Conditions</Text>
              </Text>
            </TouchableOpacity>

            {/* Privacy row — locked until Terms accepted */}
            <TouchableOpacity
              style={[S.agreeRow, !agreeTerms && S.agreeRowDisabled]}
              onPress={() => {
                if (!agreeTerms) return;
                onOpenPrivacy();
              }}
              activeOpacity={agreeTerms ? 0.8 : 1}
            >
              <I.CheckSquare checked={agreePrivacy} />
              <View style={{ flex: 1 }}>
                <Text style={[S.agreeText, !agreeTerms && S.agreeTextDimmed]}>
                  {"I have read and acknowledge the "}
                  <Text style={S.agreeLink}>Privacy Policy</Text>
                  {" and consent to the processing of my personal data as described."}
                </Text>
                {!agreeTerms && (
                  <Text style={S.agreeHint}>
                    Accept the Terms first to enable this.
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          </View>

          <Text style={S.agreeCaveat}>
            {"By registering, I understand that any personal data I provide will be processed in accordance with the "}
            <Text
              style={S.agreeLink}
              onPress={() => Linking.openURL("https://www.privacy.gov.ph/data-privacy-act/")}
            >
              Data Privacy Act of 2012
            </Text>
            {" and Lalaba's "}
            <Text style={S.agreeLink} onPress={onOpenPrivacy}>
              Privacy Policy
            </Text>
            {"."}
          </Text>
        </View>
  );
}
