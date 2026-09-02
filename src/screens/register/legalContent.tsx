// Terms/Privacy legal modal for the Register screen. The scrollable body text
// now lives in the shared <LegalBody> (src/components/LegalBody.tsx) so the
// Settings viewer and this agreement flow always show the same wording.
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "../../theme/tokens";
import { LegalBody } from "../../components/LegalBody";
import { I } from "./shared";
import { S } from "./styles";

export type LegalModal = "terms" | "privacy" | null;

export function legalModalContent(
  legalModal: LegalModal,
  setLegalModal: (v: LegalModal) => void,
  termsScrolled: boolean,
  setTermsScrolled: (v: boolean) => void,
  privacyScrolled: boolean,
  setPrivacyScrolled: (v: boolean) => void,
  agreeTerms: boolean,
  setAgreeTerms: (v: boolean) => void,
  agreePrivacy: boolean,
  setAgreePrivacy: (v: boolean) => void,
) {
  const isTerms = legalModal === "terms";
  // Button is enabled if the user has scrolled to the bottom, or already accepted
  const canAgree = isTerms
    ? (termsScrolled || agreeTerms)
    : (privacyScrolled || agreePrivacy);

  const handleAgree = () => {
    if (isTerms) setAgreeTerms(true);
    else setAgreePrivacy(true);
    setLegalModal(null);
  };

  const agreeButtonLabel = isTerms ? "I have read and agree" : "I have read and acknowledge";

  return (
    <Modal
      supportedOrientations={["portrait", "landscape"]}
      visible={legalModal !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setLegalModal(null)}
    >
      <SafeAreaView style={S.legalSafe} edges={["top", "bottom"]}>
        <View style={S.legalCard}>
          <View style={S.legalHeader}>
            <Text style={S.legalTitle}>
              {isTerms ? "Terms and Conditions" : "Privacy Policy"}
            </Text>

            {/* Close (dismiss without accepting) */}
            <TouchableOpacity
              onPress={() => setLegalModal(null)}
              hitSlop={12}
              style={S.legalClose}
            >
              <I.X c={C.gray500} s={18} />
            </TouchableOpacity>
          </View>

        <ScrollView
          style={S.legalScroll}
          contentContainerStyle={S.legalContent}
          showsVerticalScrollIndicator={true}
          scrollEventThrottle={16}
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            const atBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 32;
            if (atBottom) {
              if (legalModal === "terms") setTermsScrolled(true);
              if (legalModal === "privacy") setPrivacyScrolled(true);
            }
          }}
        >
          {isTerms ? <LegalBody kind="terms" /> : <LegalBody kind="privacy" />}
        </ScrollView>

        {/* Sticky agree footer — enabled only after reaching the bottom */}
        <View style={S.legalFooter}>
          <TouchableOpacity
            style={[S.legalAgreeBtn, !canAgree && S.legalAgreeBtnDisabled]}
            onPress={handleAgree}
            disabled={!canAgree}
            activeOpacity={0.85}
          >
            <Text style={[S.legalAgreeBtnText, !canAgree && S.legalAgreeBtnTextDisabled]}>
              {canAgree ? agreeButtonLabel : "Scroll to read all"}
            </Text>
          </TouchableOpacity>
        </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
