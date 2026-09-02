// src/components/verification/index.tsx
// Presentational pieces for the partner verification screens. Role-agnostic:
// the washer screen passes its teal accent and the merchant screen its blue,
// so one set of components serves both without a second design system.
//
// Everything here is dumb — status comes in already derived by
// src/features/verification/status.ts. Built on the existing primitives in
// src/components/ui rather than new ones; the status chip in particular is a
// thin mapping onto Chip's existing variants, so no new color tokens exist.

import React from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, RADIUS, SP } from "../../theme/tokens";
import { Btn, Card, Chip, Skeleton } from "../ui";
import {
  uploadLock,
  statusLabel,
  type UiStatus,
} from "../../features/verification/status";

export interface VerificationAccent {
  fg: string;
  /** Surface tint — sits BEHIND `fg` icons and text (card icons, chips, badges). */
  bg: string;
  /**
   * Fill for the submitted-but-unreviewed part of the progress bar. Distinct
   * from `bg` on purpose: `bg` is a surface tint chosen to disappear under
   * dark content, and washer100 (#E8F7F4) against the gray100 (#F1F5F9) track
   * differs by ~3% per channel — so a fully-submitted bar rendered in it read
   * as an empty track next to a "100%" label. This tone has to carry meaning
   * on its own, so it needs contrast against the track, not against text.
   */
  pending: string;
}

export const WASHER_ACCENT: VerificationAccent = {
  fg: C.washer700,
  bg: C.washer100,
  pending: C.washer300,
};
export const MERCHANT_ACCENT: VerificationAccent = {
  fg: C.brand700,
  bg: C.brand100,
  // brand100 (#AADFFA) already clears the track by ~71 in the red channel, so
  // the merchant bar keeps its current look.
  pending: C.brand100,
};

// ─── Status chip ───────────────────────────────────────────────────────────

type ChipVariant = React.ComponentProps<typeof Chip>["variant"];

const CHIP_VARIANT: Record<UiStatus, ChipVariant> = {
  NOT_STARTED: "gray",
  INCOMPLETE: "warning",
  SUBMITTED: "info",
  UNDER_REVIEW: "info",
  ACTION_REQUIRED: "warning",
  REJECTED: "error",
  VERIFIED: "success",
  EXPIRED: "warning",
};

// A dot draws the eye; reserve it for the statuses that need the partner to
// act, so a screen full of chips still reads at a glance.
const CHIP_DOT: readonly UiStatus[] = [
  "ACTION_REQUIRED",
  "EXPIRED",
  "REJECTED",
];

export function VerificationStatusChip({
  status,
  kind = "DOCUMENT",
  size = "md",
}: Readonly<{
  status: UiStatus;
  kind?: "DOCUMENT" | "PROFILE";
  size?: "sm" | "md";
}>) {
  return (
    <Chip
      variant={CHIP_VARIANT[status]}
      size={size}
      dot={CHIP_DOT.includes(status)}
    >
      {statusLabel(status, kind)}
    </Chip>
  );
}

// ─── Progress ──────────────────────────────────────────────────────────────

/**
 * Two-tone bar: the solid segment is what a reviewer has approved, the tinted
 * one what's been submitted and is waiting. Showing both keeps the headline
 * percentage honest without needing a second number.
 */
export function VerificationProgress({
  done,
  total,
  verified,
  percent,
  remaining,
  accent,
  compact,
}: Readonly<{
  done: number;
  total: number;
  verified: number;
  percent: number;
  remaining: number;
  accent: VerificationAccent;
  compact?: boolean;
}>) {
  const pct = (n: number) => (total === 0 ? 0 : (n / total) * 100);

  return (
    <View style={{ gap: SP._8 }}>
      {!compact && (
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>
            {done} of {total} completed
          </Text>
          <Text style={[styles.progressPercent, { color: accent.fg }]}>
            {percent}%
          </Text>
        </View>
      )}

      <View style={styles.track} accessibilityRole="progressbar">
        <View
          style={[
            styles.fill,
            { width: `${pct(verified)}%`, backgroundColor: accent.fg },
          ]}
        />
        <View
          style={[
            styles.fill,
            { width: `${pct(done - verified)}%`, backgroundColor: accent.pending },
          ]}
        />
      </View>

      <Text style={styles.progressHint}>
        {remaining === 0
          ? "Nothing left to submit."
          : `${remaining} requirement${remaining === 1 ? "" : "s"} remaining`}
      </Text>
    </View>
  );
}

// ─── Settings entry card ───────────────────────────────────────────────────

export function VerificationCard({
  title,
  description,
  status,
  percent,
  done,
  total,
  verified,
  remaining,
  accent,
  onPress,
  footnote,
}: Readonly<{
  title: string;
  description: string;
  status: UiStatus;
  percent: number;
  done: number;
  total: number;
  verified: number;
  remaining: number;
  accent: VerificationAccent;
  onPress: () => void;
  /**
   * Optional line under the card. Used by a multi-branch owner to say WHICH
   * branch the progress above belongs to and how many of their branches are
   * verified overall — without it, one branch's "0 of 7" reads as the whole
   * business's score.
   */
  footnote?: string | null;
}>) {
  const isDone = status === "VERIFIED";
  const cta = ctaLabel(status);

  return (
    <Card
      onPress={onPress}
      accentColor={accent.fg}
      style={{ marginBottom: SP._20 }}
    >
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, { backgroundColor: accent.bg }]}>
          <Ionicons
            name={isDone ? "shield-checkmark" : "shield-outline"}
            size={18}
            color={accent.fg}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDescription}>{description}</Text>
        </View>
        <VerificationStatusChip status={status} size="sm" />
      </View>

      {!isDone && (
        <View style={{ marginTop: SP._12, gap: SP._12 }}>
          <VerificationProgress
            done={done}
            total={total}
            verified={verified}
            percent={percent}
            remaining={remaining}
            accent={accent}
          />
          <Btn variant="primary" size="sm" onPress={onPress} full>
            {cta}
          </Btn>
        </View>
      )}

      {footnote ? <Text style={styles.cardFootnote}>{footnote}</Text> : null}
    </Card>
  );
}

/**
 * Placeholder for VerificationCard while the first status fetch is in flight.
 * Same outer geometry as the real card so the rows below it don't jump when
 * the data lands — that shift, not the fetch itself, is what read as "slow".
 */
export function VerificationCardSkeleton({
  accent,
}: Readonly<{ accent: VerificationAccent }>) {
  return (
    <Card accentColor={accent.fg} style={{ marginBottom: SP._20 }}>
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, { backgroundColor: accent.bg }]}>
          <Ionicons name="shield-outline" size={18} color={accent.fg} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width="55%" height={14} />
          <Skeleton width="80%" height={11} />
        </View>
      </View>
      <View style={{ marginTop: SP._12, gap: SP._12 }}>
        <View style={{ gap: SP._8 }}>
          <Skeleton width="40%" height={12} />
          <Skeleton width="100%" height={8} radius={RADIUS.full} />
          <Skeleton width="45%" height={11} />
        </View>
        <Skeleton width="100%" height={38} radius={RADIUS.full} />
      </View>
    </Card>
  );
}

/**
 * Shown in the card's place when the status fetch failed on a cold start —
 * i.e. there is no cached payload to paint. Without this the Settings screen
 * rendered neither card nor skeleton, so a partner mid-verification had no
 * evidence the feature existed at all and no way to retry.
 */
export function VerificationCardError({
  title,
  accent,
  onRetry,
}: Readonly<{
  title: string;
  accent: VerificationAccent;
  onRetry: () => void;
}>) {
  return (
    <Card accentColor={accent.fg} style={{ marginBottom: SP._20 }}>
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, { backgroundColor: accent.bg }]}>
          <Ionicons name="cloud-offline-outline" size={18} color={accent.fg} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDescription}>
            We couldn&apos;t load your verification status.
          </Text>
        </View>
      </View>
      <View style={{ marginTop: SP._12 }}>
        <Btn variant="secondary" size="sm" onPress={onRetry} full>
          Try again
        </Btn>
      </View>
    </Card>
  );
}

function ctaLabel(status: UiStatus): string {
  switch (status) {
    case "NOT_STARTED":
      return "Start verification";
    case "ACTION_REQUIRED":
    case "EXPIRED":
      return "Resolve now";
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return "View submission";
    default:
      return "Continue verification";
  }
}

// ─── Banners ───────────────────────────────────────────────────────────────

export function VerificationInfoBanner({
  title,
  message,
  tone = "info",
}: Readonly<{
  title: string;
  message: string;
  tone?: "info" | "warning" | "success";
}>) {
  const palette = {
    info: { bg: C.info100, fg: C.info500, icon: "information-circle" },
    warning: { bg: C.warning100, fg: C.warning700, icon: "alert-circle" },
    success: { bg: C.success100, fg: C.success700, icon: "checkmark-circle" },
  }[tone];

  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }]}>
      <Ionicons
        name={palette.icon as keyof typeof Ionicons.glyphMap}
        size={18}
        color={palette.fg}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.bannerTitle, { color: palette.fg }]}>{title}</Text>
        <Text style={styles.bannerMessage}>{message}</Text>
      </View>
    </View>
  );
}

/**
 * The Action Required card. A rejection always shows the reviewer's own words
 * plus a way to fix it — the whole reason this feature exists is that a bare
 * "Rejected" leaves the partner with nowhere to go.
 */
export function RejectionReason({
  documentLabel,
  reason,
  reviewedAt,
  onUploadNew,
}: Readonly<{
  documentLabel: string;
  reason: string;
  reviewedAt: Date | null;
  onUploadNew: () => void;
}>) {
  return (
    <View style={styles.rejection}>
      <View style={styles.rejectionHead}>
        <Ionicons name="warning" size={18} color={C.error700} />
        <Text style={styles.rejectionTitle}>Action required</Text>
      </View>
      <Text style={styles.rejectionDoc}>{documentLabel}</Text>
      <Text style={styles.rejectionLabel}>Reason</Text>
      <Text style={styles.rejectionReason}>{reason}</Text>
      {reviewedAt && (
        <Text style={styles.rejectionMeta}>
          Reviewed {reviewedAt.toLocaleDateString()}
        </Text>
      )}
      <Btn
        variant="primary"
        size="sm"
        onPress={onUploadNew}
        style={{ marginTop: SP._12 }}
      >
        Upload new document
      </Btn>
    </View>
  );
}

export function VerificationSuccess({
  title,
  message,
  badgeLabel,
  accent,
}: Readonly<{
  title: string;
  message: string;
  badgeLabel: string;
  accent: VerificationAccent;
}>) {
  return (
    <View style={styles.success}>
      <View style={[styles.successIcon, { backgroundColor: C.success100 }]}>
        <Ionicons name="checkmark" size={28} color={C.success700} />
      </View>
      <Text style={styles.successTitle}>{title}</Text>
      <Text style={styles.successMessage}>{message}</Text>
      <View style={[styles.successBadge, { backgroundColor: accent.bg }]}>
        <Ionicons name="shield-checkmark" size={14} color={accent.fg} />
        <Text style={[styles.successBadgeText, { color: accent.fg }]}>
          {badgeLabel}
        </Text>
      </View>
    </View>
  );
}

// ─── Requirement row ───────────────────────────────────────────────────────

export function VerificationRequirementItem({
  title,
  description,
  status,
  kind = "DOCUMENT",
  accent,
  expanded,
  onPress,
}: Readonly<{
  title: string;
  description?: string;
  status: UiStatus;
  kind?: "DOCUMENT" | "PROFILE";
  accent: VerificationAccent;
  expanded?: boolean;
  onPress: () => void;
}>) {
  const done = status === "VERIFIED";
  return (
    <TouchableOpacity
      style={styles.requirement}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.requirementIcon,
          { backgroundColor: done ? C.success100 : accent.bg },
        ]}
      >
        <Ionicons
          name={done ? "checkmark" : "ellipse-outline"}
          size={15}
          color={done ? C.success700 : accent.fg}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.requirementTitle}>{title}</Text>
        {description ? (
          <Text style={styles.requirementDescription}>{description}</Text>
        ) : null}
      </View>
      <VerificationStatusChip status={status} kind={kind} size="sm" />
      <Ionicons
        name={expanded ? "chevron-up" : "chevron-down"}
        size={16}
        color={C.gray300}
      />
    </TouchableOpacity>
  );
}

// ─── Document upload slot ──────────────────────────────────────────────────

export function UploadProgress({ label }: Readonly<{ label?: string }>) {
  return (
    <View style={styles.uploadProgress}>
      <ActivityIndicator size="small" color={C.brand500} />
      {/* Indeterminate on purpose: the upload is one base64 GraphQL request
          with no progress events, and a fake percentage would be a lie. */}
      <Text style={styles.uploadProgressText}>{label ?? "Uploading…"}</Text>
    </View>
  );
}

export function DocumentPreview({
  uri,
  mimeType,
  loading,
}: Readonly<{
  uri: string | null;
  mimeType: string | null;
  loading: boolean;
}>) {
  if (loading) {
    return (
      <View style={styles.preview}>
        <ActivityIndicator size="small" color={C.gray400} />
      </View>
    );
  }
  if (!uri) return null;

  if (mimeType?.startsWith("image/")) {
    return <Image source={{ uri }} style={styles.previewImage} />;
  }
  return (
    <TouchableOpacity
      style={styles.preview}
      onPress={() => void Linking.openURL(uri)}
    >
      <Ionicons name="document-text-outline" size={20} color={C.gray500} />
      <Text style={styles.previewText}>Open document</Text>
    </TouchableOpacity>
  );
}

export function DocumentStatus({
  status,
  submittedAt,
  expiresAt,
}: Readonly<{
  status: UiStatus;
  submittedAt: Date | null;
  expiresAt: Date | null;
}>) {
  const parts: string[] = [];
  if (submittedAt) parts.push(`Submitted ${submittedAt.toLocaleDateString()}`);
  if (expiresAt) {
    parts.push(
      status === "EXPIRED"
        ? `Expired ${expiresAt.toLocaleDateString()}`
        : `Valid until ${expiresAt.toLocaleDateString()}`,
    );
  }
  if (parts.length === 0) return null;
  return <Text style={styles.documentMeta}>{parts.join(" · ")}</Text>;
}

/**
 * One uploadable slot. Locked outright while a reviewer holds the document —
 * letting a partner replace it mid-review would silently supersede what the
 * reviewer is looking at.
 */
export function DocumentUploadCard({
  label,
  hint,
  status,
  submittedAt,
  expiresAt,
  accent,
  uploading,
  onTakePhoto,
  takePhotoLabel,
  onPickFile,
  onPreview,
  expiryField,
}: Readonly<{
  label: string;
  hint?: string;
  status: UiStatus;
  submittedAt: Date | null;
  expiresAt: Date | null;
  accent: VerificationAccent;
  uploading: boolean;
  // No "choose from library" action: it duplicated "Upload file", which already
  // reaches the photo library and also handles PDFs/DOCX.
  onTakePhoto?: () => void;
  /** Overrides "Take photo" — a guided capture isn't a photo the user takes. */
  takePhotoLabel?: string;
  onPickFile?: () => void;
  onPreview?: () => void;
  expiryField?: React.ReactNode;
}>) {
  const lock = uploadLock(status);

  return (
    <View style={styles.slot}>
      <View style={styles.slotHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.slotLabel}>{label}</Text>
          {hint ? <Text style={styles.slotHint}>{hint}</Text> : null}
        </View>
        <VerificationStatusChip status={status} size="sm" />
      </View>

      <DocumentStatus
        status={status}
        submittedAt={submittedAt}
        expiresAt={expiresAt}
      />

      {expiryField}

      {uploading ? (
        <UploadProgress />
      ) : lock ? (
        <Text style={styles.slotLocked}>{lock.message}</Text>
      ) : (
        <View style={styles.slotActions}>
          {onTakePhoto && (
            <Btn variant="soft" size="sm" onPress={onTakePhoto}>
              {takePhotoLabel ?? "Take photo"}
            </Btn>
          )}
          {onPickFile && (
            <Btn variant="soft" size="sm" onPress={onPickFile}>
              Upload file
            </Btn>
          )}
        </View>
      )}

      {onPreview && status !== "NOT_STARTED" && !uploading && (
        <TouchableOpacity onPress={onPreview} style={{ marginTop: SP._8 }}>
          <Text style={[styles.slotPreviewLink, { color: accent.fg }]}>
            View uploaded document
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Header ────────────────────────────────────────────────────────────────

export function VerificationHeader({
  title,
  subtitle,
  onBack,
  accent,
}: Readonly<{
  title: string;
  subtitle: string;
  onBack: () => void;
  accent: VerificationAccent;
}>) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.headerBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="chevron-back" size={22} color={accent.fg} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  progressHeader: { flexDirection: "row", alignItems: "center" },
  progressLabel: { flex: 1, fontSize: 13, fontWeight: "600", color: C.gray700 },
  progressPercent: { fontSize: 15, fontWeight: "800" },
  track: {
    flexDirection: "row",
    height: 8,
    borderRadius: RADIUS.full,
    backgroundColor: C.gray100,
    overflow: "hidden",
  },
  fill: { height: "100%" },
  progressHint: { fontSize: 12, color: C.gray500 },

  cardHead: { flexDirection: "row", alignItems: "center", gap: SP._12 },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: C.gray900 },
  cardDescription: { fontSize: 12.5, color: C.gray500, marginTop: 2 },
  cardFootnote: { fontSize: 11.5, color: C.gray500, marginTop: SP._12, lineHeight: 16 },

  banner: {
    flexDirection: "row",
    gap: SP._12,
    padding: SP._12,
    borderRadius: RADIUS.md,
    marginBottom: SP._16,
  },
  bannerTitle: { fontSize: 13.5, fontWeight: "700" },
  bannerMessage: { fontSize: 12.5, color: C.gray700, marginTop: 2 },

  rejection: {
    backgroundColor: C.error100,
    borderRadius: RADIUS.md,
    padding: SP._14,
    marginTop: SP._12,
  },
  rejectionHead: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  rejectionTitle: { fontSize: 14, fontWeight: "800", color: C.error700 },
  rejectionDoc: {
    fontSize: 13.5,
    fontWeight: "700",
    color: C.gray900,
    marginTop: SP._8,
  },
  rejectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: C.gray500,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: SP._8,
  },
  rejectionReason: { fontSize: 13.5, color: C.gray900, marginTop: 2 },
  rejectionMeta: { fontSize: 11.5, color: C.gray500, marginTop: SP._8 },

  success: { alignItems: "center", paddingVertical: SP._24, gap: SP._8 },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: { fontSize: 18, fontWeight: "800", color: C.gray900 },
  successMessage: {
    fontSize: 13.5,
    color: C.gray600,
    textAlign: "center",
    paddingHorizontal: SP._24,
  },
  successBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SP._12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    marginTop: SP._8,
  },
  successBadgeText: { fontSize: 13, fontWeight: "700" },

  requirement: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP._12,
    paddingVertical: SP._14,
  },
  requirementIcon: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
  },
  requirementTitle: { fontSize: 14.5, fontWeight: "700", color: C.gray900 },
  requirementDescription: { fontSize: 12, color: C.gray500, marginTop: 2 },

  slot: {
    backgroundColor: C.gray50,
    borderRadius: RADIUS.md,
    padding: SP._12,
    marginTop: SP._8,
    gap: SP._8,
  },
  slotHead: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  slotLabel: { fontSize: 13.5, fontWeight: "700", color: C.gray900 },
  slotHint: { fontSize: 12, color: C.gray500, marginTop: 2 },
  slotActions: { flexDirection: "row", flexWrap: "wrap", gap: SP._8 },
  slotLocked: { fontSize: 12.5, color: C.gray600, fontStyle: "italic" },
  slotPreviewLink: { fontSize: 12.5, fontWeight: "700" },
  documentMeta: { fontSize: 11.5, color: C.gray500 },

  uploadProgress: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  uploadProgressText: { fontSize: 12.5, color: C.gray600 },

  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP._8,
    padding: SP._12,
    backgroundColor: C.white,
    borderRadius: RADIUS.md,
  },
  previewText: { fontSize: 13, color: C.gray700, fontWeight: "600" },
  previewImage: {
    width: "100%",
    height: 180,
    borderRadius: RADIUS.md,
    resizeMode: "contain",
    backgroundColor: C.white,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP._8,
    paddingBottom: SP._16,
  },
  headerBack: { padding: SP._4 },
  headerTitle: { fontSize: 19, fontWeight: "800", color: C.gray900 },
  headerSubtitle: { fontSize: 12.5, color: C.gray500, marginTop: 2 },
});
