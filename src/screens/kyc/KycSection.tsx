// src/screens/kyc/KycSection.tsx
// Shared KYC verification surface (merchant branch + washer). Shows the
// provider's badge state, one row per required document type with its review
// status, and pick→upload→submit per document (resubmission after rejection).
// Canonical rule surfaced in copy: KYC drives the Verified badge ONLY — it
// does not gate marketplace visibility or wallet top-ups.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { View, Text, TouchableOpacity, ActivityIndicator, Linking } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { ShieldCheck } from "lucide-react-native";
import { C } from "../../theme/tokens";
import {
  gqlMyKycStatus,
  gqlSubmitKycDocument,
  gqlKycDocumentUrl,
  REQUIRED_KYC_DOCS,
  type KycProviderType,
  type KycDocumentType,
  type KycDocumentStatus,
  type MyKycStatus,
} from "../../services/graphql/kyc";
import { notify } from "../../stores/notificationStore";
import { useDialogStore } from "../../stores/dialogStore";
import {
  pickKycImage,
  pickKycDocument,
  pickFailureMessage,
  type PickedKycFile,
} from "./pickKycFile";
import { toUserMessage } from "../../utils/userError";
import { kycStyles as styles } from "./kyc.styles";

// Every KycDocumentType the BE can return needs an entry — the union grew with
// the Phase 2 KYC contract (DTI_CERTIFICATE, BIR_2303, the business photos,
// VALID_ID_BACK, PROOF_OF_ADDRESS) and a missing key renders a blank row.
const DOC_LABELS: Record<KycDocumentType, { label: string; hint: string; icon: string }> = {
  // Merchant branch
  BUSINESS_PERMIT:           { label: "Business Permit",     hint: "Current mayor's/business permit for this branch", icon: "business-outline" },
  OWNER_VALID_ID:            { label: "Owner's Valid ID",    hint: "Government-issued ID of the owner",               icon: "card-outline" },
  DTI_CERTIFICATE:           { label: "DTI Certificate",     hint: "DTI business name registration certificate",      icon: "ribbon-outline" },
  BIR_2303:                  { label: "BIR Form 2303",       hint: "Certificate of registration from the BIR",        icon: "receipt-outline" },
  BUSINESS_PHOTO_STOREFRONT: { label: "Storefront Photo",    hint: "Clear photo of your shop front and signage",      icon: "storefront-outline" },
  BUSINESS_PHOTO_INTERIOR:   { label: "Interior Photo",      hint: "Photo of the inside of your shop",                icon: "home-outline" },
  BUSINESS_PHOTO_MACHINES:   { label: "Machines Photo",      hint: "Photo of your washing machines and dryers",       icon: "cog-outline" },
  // Washer
  VALID_ID:                  { label: "Valid ID",            hint: "Government-issued ID (front)",                    icon: "card-outline" },
  VALID_ID_BACK:             { label: "Valid ID (Back)",     hint: "Back of the same government-issued ID",           icon: "card-outline" },
  BARANGAY_CLEARANCE:        { label: "Barangay Clearance",  hint: "Clearance from your barangay",                    icon: "document-text-outline" },
  PROOF_OF_ADDRESS:          { label: "Proof of Address",    hint: "Recent utility bill or similar in your name",     icon: "mail-outline" },
  SELFIE:                    { label: "Selfie",              hint: "A clear photo of yourself holding your ID",       icon: "person-circle-outline" },
};

const STATUS_META: Record<KycDocumentStatus, { label: string; color: string; bg: string }> = {
  SUBMITTED:    { label: "Submitted",    color: C.brand600,   bg: C.brand50 },
  UNDER_REVIEW: { label: "Under review", color: C.warning700, bg: C.warning100 },
  APPROVED:     { label: "Approved",     color: C.success700, bg: C.success100 },
  REJECTED:     { label: "Rejected",     color: C.error700,   bg: C.error100 },
  SUPERSEDED:   { label: "Superseded",   color: C.gray500,    bg: C.gray100 },
};

interface Props {
  readonly providerType: KycProviderType;
  /** Branch._id — required for MERCHANT_BRANCH, omitted for WASHER. */
  readonly providerId?: string;
  /** Brand accent (merchant brand vs washer teal). */
  readonly accentColor: string;
}

export function KycSection({ providerType, providerId, accentColor }: Props) {
  const [status, setStatus] = useState<MyKycStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submittingType, setSubmittingType] = useState<KycDocumentType | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  // `background` refreshes leave the current rows on screen: no spinner, and a
  // failure keeps the good data rather than replacing it with an error state.
  const load = useCallback(async (background = false) => {
    if (!background) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      setStatus(await gqlMyKycStatus(providerType, providerId));
      setLoadError(null);
    } catch (err) {
      if (!background) {
        setLoadError(toUserMessage(err, "Couldn't load your verification status. Check your connection and try again."));
      }
    } finally {
      if (!background) setLoading(false);
    }
  }, [providerType, providerId]);

  useEffect(() => { void load(); }, [load]);

  // A reviewer's decision lands while the app is open, so fetching only on mount
  // left this reading "Verification under review" with every row "Submitted"
  // after the badge had already been granted — the dashboard card updated and
  // this screen did not, and only a relaunch reconciled them.
  const didInitialLoad = useRef(false);
  useFocusEffect(
    useCallback(() => {
      // The mount effect above already covers the first focus.
      if (!didInitialLoad.current) {
        didInitialLoad.current = true;
        return;
      }
      void load(true);
    }, [load]),
  );

  const upload = async (documentType: KycDocumentType, file: PickedKycFile) => {
    setSubmittingType(documentType);
    try {
      await gqlSubmitKycDocument({
        providerType,
        ...(providerType === "MERCHANT_BRANCH" ? { providerId } : {}),
        documentType,
        base64: file.base64,
        mimeType: file.mimeType,
      });
      notify.success("Document submitted", `${DOC_LABELS[documentType].label} is now awaiting review.`);
      await load();
    } catch (err) {
      notify.error("Couldn't submit document", toUserMessage(err, "Please try again."));
    } finally {
      setSubmittingType(null);
    }
  };

  const runPick = async (
    documentType: KycDocumentType,
    pick: () => Promise<Awaited<ReturnType<typeof pickKycImage>>>,
  ) => {
    const result = await pick();
    if (!result.ok) {
      const copy = pickFailureMessage(result.reason);
      if (copy) notify.error(copy.title, copy.message);
      return;
    }
    await upload(documentType, result.file);
  };

  // The BE accepts images, PDF and DOCX — a permit is often a scan/PDF, an ID
  // usually a photo. Ask which source rather than forcing the camera roll.
  const submitDoc = (documentType: KycDocumentType) => {
    if (submittingType) return;
    useDialogStore.getState().show({
      title: `Upload ${DOC_LABELS[documentType].label}`,
      message: "Choose a photo from your library, or a PDF / Word document.",
      variant: "confirm",
      confirmLabel: "Photo",
      cancelLabel: "PDF / Document",
      onConfirm: () => { void runPick(documentType, pickKycImage); },
      onCancel: () => { void runPick(documentType, pickKycDocument); },
    });
  };

  const viewDoc = async (documentId: string) => {
    if (viewingId) return;
    setViewingId(documentId);
    try {
      const url = await gqlKycDocumentUrl(documentId);
      await Linking.openURL(url);
    } catch (err) {
      notify.error("Couldn't open document", toUserMessage(err, "Please try again."));
    } finally {
      setViewingId(null);
    }
  };

  if (loading && !status) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  if (loadError && !status) {
    return (
      <View style={styles.centerBox}>
        <Ionicons name="cloud-offline-outline" size={34} color={C.gray300} />
        <Text style={styles.errorText}>{loadError}</Text>
        <TouchableOpacity style={[styles.retryBtn, { borderColor: accentColor }]} onPress={() => void load()}>
          <Text style={[styles.retryText, { color: accentColor }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const verified = status?.verificationStatus === "APPROVED";
  const rejected = status?.verificationStatus === "REJECTED";
  const docTypes = REQUIRED_KYC_DOCS[providerType];
  const rows = docTypes.map((t) =>
    status?.documents.find((d) => d.documentType === t) ??
    { documentType: t, status: null, documentId: null, submittedAt: null, reviewedAt: null, rejectionReason: null });

  return (
    <View style={styles.container}>
      {/* Badge state */}
      <View style={styles.badgeCard}>
        <View style={[styles.badgeIconWrap, { backgroundColor: verified ? C.success100 : C.gray100 }]}>
          {verified ? <ShieldCheck size={24} color={C.success700} /> : <MaterialCommunityIcons name="shield-alert-outline" size={16} color={C.gray400} />}
        </View>
        <View style={styles.badgeBody}>
          <Text style={styles.badgeTitle}>{verified ? "Verified" : "Unverified"}</Text>
          <Text style={styles.badgeSub}>
            {verified
              ? "Customers see a Verified badge on your profile."
              : "Submit the documents below to earn the Verified badge. Verification affects the badge only — you stay visible in the marketplace and can top up your wallet either way."}
          </Text>
        </View>
      </View>

      {rejected ? (
        <View style={styles.rejectBanner}>
          <Ionicons name="alert-circle" size={18} color={C.error700} />
          <Text style={styles.rejectText}>
            A document was rejected — see the reason below and resubmit a new copy.
          </Text>
        </View>
      ) : null}

      {/* Required documents */}
      <View style={styles.docCard}>
        {rows.map((row, i) => {
          const meta = DOC_LABELS[row.documentType];
          const st = row.status ? STATUS_META[row.status] : null;
          const canSubmit = row.status == null || row.status === "REJECTED";
          const busy = submittingType === row.documentType;
          return (
            <React.Fragment key={row.documentType}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.docRow}>
                <View style={[styles.docIconWrap, { backgroundColor: C.gray50 }]}>
                  <Ionicons name={meta.icon as never} size={18} color={accentColor} />
                </View>
                <View style={styles.docBody}>
                  <Text style={styles.docTitle}>{meta.label}</Text>
                  <Text style={styles.docMeta} numberOfLines={2}>
                    {row.status ? (st?.label ?? row.status) : meta.hint}
                  </Text>
                  {row.status === "REJECTED" && row.rejectionReason ? (
                    <Text style={styles.docReject}>Reason: {row.rejectionReason}</Text>
                  ) : null}
                </View>
                {st ? (
                  <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
                    <Text style={[styles.statusPillText, { color: st.color }]}>{st.label}</Text>
                  </View>
                ) : null}
                {canSubmit ? (
                  <TouchableOpacity
                    style={[styles.docActionBtn, { borderColor: accentColor }]}
                    onPress={() => submitDoc(row.documentType)}
                    disabled={busy}
                  >
                    {busy
                      ? <ActivityIndicator size="small" color={accentColor} />
                      : <Text style={[styles.docActionText, { color: accentColor }]}>
                          {row.status === "REJECTED" ? "Resubmit" : "Upload"}
                        </Text>}
                  </TouchableOpacity>
                ) : row.documentId ? (
                  <TouchableOpacity
                    style={[styles.docActionBtn, { borderColor: C.gray200 }]}
                    onPress={() => void viewDoc(row.documentId!)}
                    disabled={viewingId === row.documentId}
                  >
                    {viewingId === row.documentId
                      ? <ActivityIndicator size="small" color={C.gray500} />
                      : <Text style={[styles.docActionText, { color: C.gray600 }]}>View</Text>}
                  </TouchableOpacity>
                ) : null}
              </View>
            </React.Fragment>
          );
        })}
      </View>

      <Text style={styles.footnote}>
        Accepted files: photos (JPG, PNG, WebP, HEIC), PDF, or Word (.docx) — up to 5 MB.
        Documents are stored privately and reviewed by the Lalaba team. Resubmitting replaces
        the previous copy.
      </Text>
    </View>
  );
}
