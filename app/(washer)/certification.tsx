// app/(washer)/certification.tsx
// Certification screen — cert status, details, renewal steps, and proof upload.
// Cert is admin-issued. Washer uploads proof; admin reviews and issues the cert.

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { C, RADIUS, SP, SHADOW } from "../../src/theme/tokens";
import { useAuthStore } from "../../src/stores/authStore";
import { useWasherStore } from "../../src/stores/washerStore";
import type { CertStatus } from "../../src/types/washer.types";
import { showAlert } from "../../src/lib/dialog";
import {
  gqlSubmitCertProof,
  gqlCertificationProofUrls,
} from "../../src/services/graphql/washer";
import {
  pickKycImage,
  pickKycDocument,
  pickFailureMessage,
  decodedByteLength,
  type PickedKycFile,
} from "../../src/screens/kyc/pickKycFile";
import { useDialogStore } from "../../src/stores/dialogStore";
import { toUserMessage } from "../../src/utils/userError";

const TEAL   = C.accent500;
const TEAL_L = C.accent100;
const TEAL_D = C.accent700;

// ─── SVG Icons ────────────────────────────────────────────────────────────────

type IconProps = Readonly<{ size?: number; color?: string }>;

function IconValid({ size = 40 }: IconProps) {
  return <Ionicons name="checkmark-circle-outline" size={size} color={C.success500} />;
}

function IconPending({ size = 40 }: IconProps) {
  return <Ionicons name="alert-circle-outline" size={size} color={C.warning500} />;
}

function IconExpired({ size = 40 }: IconProps) {
  return <Ionicons name="time-outline" size={size} color={C.warning500} />;
}

function IconRevoked({ size = 40 }: IconProps) {
  return <Ionicons name="close-circle-outline" size={size} color={C.error500} />;
}

function IconNoCert({ size = 40 }: IconProps) {
  return <Ionicons name="document-text-outline" size={size} color={C.gray400} />;
}

function IconUpload({ color = TEAL, size = 24 }: IconProps) {
  return <MaterialCommunityIcons name="tray-arrow-up" size={size} color={color} />;
}

function IconFile({ color = C.gray500, size = 20 }: IconProps) {
  return <Ionicons name="document-outline" size={size} color={color} />;
}

function IconTrash({ color = C.error500, size = 16 }: IconProps) {
  return <Ionicons name="trash-outline" size={size} color={color} />;
}

function IconBack({ color = TEAL, size = 20 }: IconProps) {
  return <Ionicons name="chevron-back" size={size} color={color} />;
}

// ─── Status Config ────────────────────────────────────────────────────────────

type CertStatusConfig = {
  icon: React.ReactElement;
  label: string;
  color: string;
  bg: string;
  description: string;
};

const CERT_STATUS_CFG: Record<CertStatus, CertStatusConfig> = {
  ISSUED:  {
    icon: <IconPending size={40} />,
    label: "Issued — Pending Verification",
    color: C.warning700,
    bg: C.warning100,
    description: "Your certification has been issued and is pending final verification by the Lalaba admin team.",
  },
  VALID:   {
    icon: <IconValid size={40} />,
    label: "Valid & Active",
    color: C.success700,
    bg: C.success100,
    description: "Your Clean Certification is active. You are authorized to accept bookings on the LALABA platform.",
  },
  EXPIRED: {
    icon: <IconExpired size={40} />,
    label: "Expired",
    color: C.warning700,
    bg: C.warning100,
    description: "Your certification has expired. Complete a renewal cycle to continue accepting bookings.",
  },
  REVOKED: {
    icon: <IconRevoked size={40} />,
    label: "Revoked",
    color: C.error700,
    bg: C.error100,
    description: "Your certification has been revoked by an administrator. Contact Lalaba support for details.",
  },
};

const NO_CERT_CFG: CertStatusConfig = {
  icon: <IconNoCert size={40} />,
  label: "No Certification",
  color: C.gray600,
  bg: C.gray100,
  description: "Complete the Clean Masterclass certification to start accepting bookings.",
};

// ─── StepCard ─────────────────────────────────────────────────────────────────

function StepCard({ num, title, desc, done }: Readonly<{ num: number; title: string; desc: string; done: boolean }>) {
  return (
    <View style={[styles.stepCard, done && styles.stepCardDone]}>
      <View style={[styles.stepNum, done && styles.stepNumDone]}>
        {done ? (
          <Ionicons name="checkmark" size={16} color={C.white} />
        ) : (
          <Text style={[styles.stepNumText, { color: TEAL }]}>{num}</Text>
        )}
      </View>
      <View style={styles.stepBody}>
        <Text style={[styles.stepTitle, done && { color: C.success700 }]}>{title}</Text>
        <Text style={styles.stepDesc}>{desc}</Text>
      </View>
    </View>
  );
}

// ─── DetailRow ────────────────────────────────────────────────────────────────

function DetailRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

// ─── Upload Section ───────────────────────────────────────────────────────────

/** A picked-but-not-yet-submitted proof: bytes held in memory until submit. */
interface StagedProof extends PickedKycFile {
  /** Stable key for the list; the picker may not supply a filename. */
  key: string;
}

function UploadSection() {
  const [files,       setFiles]       = useState<StagedProof[]>([]);
  const [uploading,   setUploading]   = useState(false);
  const [proofUrls,   setProofUrls]   = useState<string[]>([]);
  const [loadingUrls, setLoadingUrls] = useState(true);
  const [openingIdx,  setOpeningIdx]  = useState<number | null>(null);

  // Previews come from the guarded `certificationProofUrls` query — the
  // `WasherProfile.certProofUrls` field no longer exists. Those URLs are signed
  // and expire after 300 s, so they are fetched on demand and never cached.
  const loadProofUrls = useCallback(async () => {
    setLoadingUrls(true);
    try {
      setProofUrls(await gqlCertificationProofUrls());
    } catch {
      // A washer with nothing submitted yet is the common case — show nothing
      // rather than an error banner on an otherwise healthy screen.
      setProofUrls([]);
    } finally {
      setLoadingUrls(false);
    }
  }, []);

  useEffect(() => { void loadProofUrls(); }, [loadProofUrls]);

  const runPick = async (pick: () => Promise<Awaited<ReturnType<typeof pickKycImage>>>) => {
    const result = await pick();
    if (!result.ok) {
      const copy = pickFailureMessage(result.reason);
      if (copy) showAlert(copy.title, copy.message);
      return;
    }
    setFiles((prev) => [...prev, { ...result.file, key: `${Date.now()}-${prev.length}` }]);
  };

  // Certificates arrive as scans (PDF) as often as photos — ask for the source
  // rather than forcing the camera roll. Same two-way choice as KYC.
  const pickFile = () => {
    if (uploading) return;
    useDialogStore.getState().show({
      title: "Attach completion proof",
      message: "Choose a photo from your library, or a PDF / Word document.",
      variant: "confirm",
      confirmLabel: "Photo",
      cancelLabel: "PDF / Document",
      onConfirm: () => { void runPick(pickKycImage); },
      onCancel:  () => { void runPick(pickKycDocument); },
    });
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (files.length === 0) {
      showAlert("No files", "Please attach at least one file before submitting.");
      return;
    }
    setUploading(true);
    try {
      // Bytes go straight to the mutation: the server derives the storage key
      // and writes to the PRIVATE evidence store. No public media upload, and
      // no caller-supplied URLs — the old `proofUrls` argument now throws.
      await gqlSubmitCertProof(files.map((f) => ({ base64: f.base64, mimeType: f.mimeType })));
      showAlert(
        "Submitted",
        "Your proof has been submitted for review. The Lalaba admin team will verify and issue your certification shortly."
      );
      setFiles([]);
      await loadProofUrls();
    } catch (err) {
      showAlert(
        "Upload failed",
        toUserMessage(err, "Could not submit your files. Please check your connection and try again.")
      );
    } finally {
      setUploading(false);
    }
  };

  const openProof = async (url: string, idx: number) => {
    if (openingIdx !== null) return;
    setOpeningIdx(idx);
    try {
      await Linking.openURL(url);
    } catch {
      showAlert("Couldn't open file", "That secure link may have expired. Reopen this screen to refresh it.");
    } finally {
      setOpeningIdx(null);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <View style={styles.uploadSection}>
      <Text style={styles.uploadTitle}>Submit Completion Proof</Text>
      <Text style={styles.uploadSub}>
        Attach your Clean Masterclass certificate. Accepted: JPG, PNG, WebP, HEIC, PDF, DOCX — max 5 MB each.
      </Text>

      {/* Already-submitted evidence — signed, short-lived links */}
      {loadingUrls && <ActivityIndicator color={TEAL} size="small" style={styles.proofLoader} />}
      {!loadingUrls && proofUrls.length > 0 && (
        <View style={styles.submittedBlock}>
          <Text style={styles.submittedTitle}>Submitted proof</Text>
          {proofUrls.map((url, idx) => (
            <TouchableOpacity
              key={url}
              style={styles.fileRow}
              onPress={() => { void openProof(url, idx); }}
              disabled={openingIdx !== null}
            >
              <IconFile size={18} color={TEAL} />
              <View style={styles.fileMeta}>
                <Text style={styles.fileName} numberOfLines={1}>Proof {idx + 1}</Text>
                <Text style={styles.fileSize}>Tap to view — secure link</Text>
              </View>
              {openingIdx === idx
                ? <ActivityIndicator color={TEAL} size="small" />
                : <Ionicons name="open-outline" size={16} color={TEAL} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Staged (not yet submitted) files */}
      {files.map((f, idx) => (
        <View key={f.key} style={styles.fileRow}>
          <IconFile size={18} color={TEAL} />
          <View style={styles.fileMeta}>
            <Text style={styles.fileName} numberOfLines={1}>{f.fileName ?? `Attachment ${idx + 1}`}</Text>
            <Text style={styles.fileSize}>{formatSize(decodedByteLength(f.base64))}</Text>
          </View>
          <TouchableOpacity onPress={() => removeFile(idx)} style={styles.fileRemove}>
            <IconTrash size={16} />
          </TouchableOpacity>
        </View>
      ))}

      {/* Attach button */}
      <TouchableOpacity style={styles.attachBtn} onPress={pickFile}>
        <IconUpload color={TEAL} size={18} />
        <Text style={styles.attachBtnText}>Attach File</Text>
      </TouchableOpacity>

      {/* Submit button */}
      {files.length > 0 && (
        <TouchableOpacity
          style={[styles.submitBtn, uploading && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color={C.white} size="small" />
          ) : (
            <Text style={styles.submitBtnText}>Submit for Review</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WasherCertification() {
  const insets   = useSafeAreaInsets();
  const user     = useAuthStore((s) => s.user);
  const washerId = user?.uid ?? "";

  const { cert, profile, isLoading, loadWasher } = useWasherStore();

  useEffect(() => {
    if (!profile) loadWasher(washerId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [washerId]);

  const cfg        = cert ? (CERT_STATUS_CFG[cert.status] ?? NO_CERT_CFG) : NO_CERT_CFG;
  const isValid    = cert?.status === "VALID" || cert?.status === "ISSUED";
  const needsAction = !isValid;

  if (isLoading && !cert && !profile) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={TEAL} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + SP._8 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Back */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <IconBack size={20} />
        <Text style={styles.backText}>Profile</Text>
      </TouchableOpacity>

      <Text style={styles.pageTitle}>Clean Certification</Text>
      <Text style={styles.pageSub}>Required to accept bookings on the LALABA platform</Text>

      {/* Status card */}
      <View style={[styles.statusCard, { borderColor: cfg.color, backgroundColor: cfg.bg }]}>
        {cfg.icon}
        <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
        <Text style={[styles.statusDesc, { color: cfg.color }]}>{cfg.description}</Text>
      </View>

      {/* Cert details */}
      {cert && (
        <View style={styles.detailsCard}>
          <Text style={styles.cardTitle}>Certification Details</Text>
          <DetailRow label="Cert Number"  value={cert.certNumber} />
          <DetailRow label="Issued By"    value={cert.issuedBy} />
          <DetailRow label="Issued At"    value={cert.issuedAt ? formatDate(cert.issuedAt as unknown as string) : "—"} />
          <DetailRow label="Expires At"   value={cert.expiresAt ? formatDate(cert.expiresAt as unknown as string) : "—"} />
          {cert.revokedAt && (
            <DetailRow label="Revoked At" value={formatDate(cert.revokedAt as unknown as string)} />
          )}
          {cert.revocationReason && (
            <DetailRow label="Reason" value={cert.revocationReason} />
          )}
          {cert.notes && (
            <DetailRow label="Notes" value={cert.notes} />
          )}
        </View>
      )}

      {/* Steps */}
      <Text style={styles.sectionTitle}>How to Get Certified</Text>
      <StepCard num={1} title="Register as a Washer" desc="Create your LALABA Partner account and complete your machine profile." done={!!profile} />
      <StepCard num={2} title="Complete the Clean Masterclass" desc="Take the Lalaba-accredited online course. Covers hygiene, detergent use, and fabric care." done={isValid} />
      <StepCard num={3} title="Submit Completion Proof" desc="Upload your masterclass certificate below. Lalaba admin reviews and issues your Clean Cert." done={isValid} />
      <StepCard num={4} title="Start Accepting Bookings" desc="Once your cert is VALID, toggle availability and your profile goes live to customers." done={isValid} />

      {/* Masterclass CTA */}
      {needsAction && (
        <TouchableOpacity
          style={styles.masterclassBtn}
          onPress={() => Linking.openURL("https://masterclass.lalaba.ph")}
        >
          <Text style={styles.masterclassBtnText}>
            {cert?.status === "EXPIRED" || cert?.status === "REVOKED"
              ? "Start Renewal — Clean Masterclass"
              : "Start Clean Masterclass"}
          </Text>
        </TouchableOpacity>
      )}

      {/* Upload proof section */}
      <UploadSection />

      {/* Help */}
      <View style={styles.helpBox}>
        <Text style={styles.helpTitle}>Need help?</Text>
        <Text style={styles.helpText}>
          Contact Lalaba support at{" "}
          <Text
            style={styles.helpLink}
            onPress={() => Linking.openURL("mailto:support@lalaba.ph")}
          >
            support@lalaba.ph
          </Text>
          {" "}if your certification isn&apos;t reflecting correctly.
        </Text>
      </View>

      <View style={{ height: SP._40 }} />
    </ScrollView>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.gray50 },
  scroll: { paddingHorizontal: SP._16, paddingBottom: SP._40 },
  loader: { flex: 1, alignItems: "center", justifyContent: "center" },

  backBtn:  { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: SP._8 },
  backText: { fontSize: 15, color: TEAL, fontWeight: "600" },

  pageTitle: { fontSize: 24, fontWeight: "700", color: C.gray900, marginBottom: 6 },
  pageSub:   { fontSize: 14, color: C.gray500, marginBottom: SP._20 },

  // Status card
  statusCard:  { borderRadius: RADIUS.lg, borderWidth: 2, padding: SP._20, alignItems: "center", marginBottom: SP._16, gap: SP._8 },
  statusLabel: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  statusDesc:  { fontSize: 13, textAlign: "center", lineHeight: 19, opacity: 0.85 },

  // Details
  detailsCard: { backgroundColor: C.white, borderRadius: RADIUS.lg, padding: SP._16, ...SHADOW.sm, marginBottom: SP._20 },
  cardTitle:   { fontSize: 15, fontWeight: "700", color: C.gray900, marginBottom: SP._12 },
  detailRow:   { flexDirection: "row", justifyContent: "space-between", paddingVertical: SP._8, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  detailLabel: { fontSize: 13, color: C.gray500, fontWeight: "600" },
  detailValue: { fontSize: 13, color: C.gray900, flex: 1, textAlign: "right" },

  // Steps
  sectionTitle: { fontSize: 16, fontWeight: "700", color: C.gray900, marginBottom: SP._12 },
  stepCard:     { flexDirection: "row", backgroundColor: C.white, borderRadius: RADIUS.md, padding: SP._14, gap: SP._12, marginBottom: SP._8, ...SHADOW.xs },
  stepCardDone: { borderWidth: 1, borderColor: C.success500 },
  stepNum:      { width: 32, height: 32, borderRadius: RADIUS.full, borderWidth: 2, borderColor: TEAL, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  stepNumDone:  { backgroundColor: C.success500, borderColor: C.success500 },
  stepNumText:  { fontSize: 14, fontWeight: "700" },
  stepBody:     { flex: 1 },
  stepTitle:    { fontSize: 14, fontWeight: "700", color: C.gray900, marginBottom: 3 },
  stepDesc:     { fontSize: 12, color: C.gray500, lineHeight: 17 },

  // Masterclass CTA
  masterclassBtn:     { backgroundColor: TEAL, borderRadius: RADIUS.lg, height: 52, alignItems: "center", justifyContent: "center", marginTop: SP._20, marginBottom: SP._16, ...SHADOW.brand },
  masterclassBtnText: { color: C.white, fontSize: 16, fontWeight: "700" },

  // Upload section
  uploadSection: { backgroundColor: C.white, borderRadius: RADIUS.lg, padding: SP._16, ...SHADOW.sm, marginBottom: SP._16 },
  uploadTitle:   { fontSize: 15, fontWeight: "700", color: C.gray900, marginBottom: 4 },
  uploadSub:     { fontSize: 13, color: C.gray500, lineHeight: 18, marginBottom: SP._14 },

  proofLoader:    { marginBottom: SP._12, alignSelf: "flex-start" },
  submittedBlock: { marginBottom: SP._12 },
  submittedTitle: { fontSize: 12, fontWeight: "700", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: SP._8 },

  fileRow:    { flexDirection: "row", alignItems: "center", gap: SP._10, backgroundColor: C.gray50, borderRadius: RADIUS.sm, padding: SP._10, marginBottom: SP._8 },
  fileMeta:   { flex: 1 },
  fileName:   { fontSize: 13, fontWeight: "600", color: C.gray800 },
  fileSize:   { fontSize: 11, color: C.gray400, marginTop: 2 },
  fileRemove: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },

  attachBtn:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SP._8, borderWidth: 1.5, borderColor: TEAL, borderRadius: RADIUS.md, paddingVertical: SP._12, borderStyle: "dashed" },
  attachBtnText: { fontSize: 14, fontWeight: "700", color: TEAL },

  submitBtn:     { backgroundColor: TEAL, borderRadius: RADIUS.md, height: 48, alignItems: "center", justifyContent: "center", marginTop: SP._12 },
  submitBtnText: { color: C.white, fontSize: 15, fontWeight: "700" },

  // Help
  helpBox:  { backgroundColor: TEAL_L, borderRadius: RADIUS.md, padding: SP._14, marginBottom: SP._8 },
  helpTitle:{ fontSize: 14, fontWeight: "700", color: TEAL_D, marginBottom: 4 },
  helpText: { fontSize: 13, color: TEAL_D, lineHeight: 18 },
  helpLink: { fontWeight: "700", textDecorationLine: "underline" },
});
