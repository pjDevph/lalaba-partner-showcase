// src/screens/verification/VerificationScreenBody.tsx
// The verification checklist itself, shared by both roles. The washer route
// (app/(washer)/verification.tsx) and the merchant settings hub
// (src/screens/settings/VerificationScreen.tsx) both render this with
// role-specific copy, accent, requirement groups and profile rows — the flow,
// the statuses and the upload behaviour are identical, and duplicating them
// would guarantee the two drift apart.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { C, SP, SHADOW } from "../../theme/tokens";
import { EmptyState } from "../../components/ui";
import { DateField } from "../../components/DateField";
import { OptionField } from "../../components/OptionField";
import { showAlert } from "../../lib/dialog";
import {
  DocumentPreview,
  DocumentUploadCard,
  RejectionReason,
  VerificationHeader,
  VerificationInfoBanner,
  VerificationProgress,
  VerificationRequirementItem,
  VerificationSuccess,
  type VerificationAccent,
} from "../../components/verification";
import {
  computeProgress,
  deriveAggregateStatus,
  type UiStatus,
} from "../../features/verification/status";
import {
  buildGroupViews,
  buildRetiredSlots,
  toProgressRows,
  GOVERNMENT_ID_TYPE_OPTIONS,
  type RequirementGroup,
  type RequirementGroupView,
} from "../../features/verification/requirements";
import {
  pickFile,
  pickFromCamera,
  readForUpload,
  type PickedDocument,
} from "../../features/verification/pickDocument";
import {
  LivenessCapture,
  type LivenessCapturePhoto,
} from "../../features/liveness/LivenessCapture";
import {
  IdCardCapture,
  type IdCardCapturePhoto,
} from "../../features/verification/IdCardCapture";
import {
  gqlKycDocumentUrl,
  gqlMyKycStatus,
  gqlSubmitKycDocument,
  type GovernmentIdType,
  type KycDocumentType,
  type KycProviderType,
  type MyKycStatus,
} from "../../services/graphql/kyc";

/** A checklist row backed by profile data rather than an upload. */
export interface ProfileRequirement {
  key: string;
  title: string;
  description: string;
  status: UiStatus;
  onPress: () => void;
}

export interface VerificationScreenBodyProps {
  providerType: KycProviderType;
  /** Required for MERCHANT_BRANCH; omitted for WASHER (derived server-side). */
  providerId?: string;
  title: string;
  subtitle: string;
  successTitle: string;
  successMessage: string;
  badgeLabel: string;
  groups: readonly RequirementGroup[];
  profileRequirements: readonly ProfileRequirement[];
  accent: VerificationAccent;
  onBack: () => void;
  /**
   * Called after a document uploads and the checklist refreshes.
   *
   * Exists because a washer's SELFIE has a side effect the backend applies
   * immediately — it becomes her avatar and store logo, with no review — and
   * the local stores need to catch up. Kept generic so this shared body does
   * not have to know which provider types care about which document types.
   */
  onDocumentSubmitted?: (documentType: KycDocumentType) => void | Promise<void>;
  /**
   * Extra work to do on pull-to-refresh, beyond re-fetching the checklist.
   *
   * The checklist refreshes itself; this is for whatever backs the caller's
   * profileRequirements — a washer's profile, a merchant's branch — which this
   * component receives already-derived and cannot reload on its own. Without
   * it, pulling would refresh every row on screen except those.
   */
  onRefresh?: () => void | Promise<void>;
}

export function VerificationScreenBody({
  providerType,
  providerId,
  title,
  subtitle,
  successTitle,
  successMessage,
  badgeLabel,
  groups,
  profileRequirements,
  accent,
  onBack,
  onDocumentSubmitted,
  onRefresh,
}: Readonly<VerificationScreenBodyProps>) {
  const [status, setStatus] = useState<MyKycStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [uploading, setUploading] = useState<KycDocumentType | null>(null);

  // The document type whose liveness capture is open, or null. Rendered as a
  // full-screen overlay over this checklist rather than a route of its own: the
  // capture belongs to one row, and the submit path, the refresh and the
  // expiry drafts are all already here.
  const [livenessFor, setLivenessFor] = useState<KycDocumentType | null>(null);

  // Same idea for the guided ID camera: the document type whose capture is
  // open, or null. A separate piece of state rather than a shared "capture
  // target" — the two overlays take different props and only one can ever be
  // open, and collapsing them would buy nothing but a discriminated union.
  const [idCaptureFor, setIdCaptureFor] = useState<KycDocumentType | null>(
    null,
  );

  // Expiry the partner typed, held per document type until that document is
  // actually submitted. Not persisted: an abandoned upload shouldn't leave a
  // date behind.
  const [expiryDrafts, setExpiryDrafts] = useState<
    Partial<Record<KycDocumentType, Date>>
  >({});

  // Which government ID the partner says they're uploading. Seeded from the
  // server once the checklist loads (see the effect below) so a return visit
  // opens on the choice already on file, then owned locally — the picker has to
  // respond before the upload it gates has happened.
  const [idType, setIdType] = useState<GovernmentIdType | null>(null);

  // Signed preview URLs live 300s, so they're fetched on demand and dropped
  // when the sheet closes — never cached across opens.
  const [preview, setPreview] = useState<{
    documentType: KycDocumentType;
    uri: string | null;
    loading: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const next = await gqlMyKycStatus(providerType, providerId);
      setStatus(next);
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : "Could not load your verification status.",
      );
    } finally {
      setLoading(false);
    }
  }, [providerType, providerId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Pull-to-refresh. A reviewer's decision lands server-side with nothing to
  // push it here, so a washer waiting on one has no way to see it arrive short
  // of leaving the screen and coming back.
  //
  // Deliberately separate state from `loading`: reusing that would replace the
  // whole checklist with a centred spinner on every pull, and `load` never
  // raises it again after the first pass anyway.
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Together, not in sequence — they are independent fetches and the
      // spinner should last as long as the slower one, not their sum.
      await Promise.all([load(), onRefresh?.()]);
    } finally {
      setRefreshing(false);
    }
  }, [load, onRefresh]);

  // Shared by the checklist and the load-error screen: a failed load is exactly
  // where a user is most likely to pull, and "Try again" should not be the only
  // way to recover from it.
  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      tintColor={accent.fg}
      colors={[accent.fg]}
    />
  );

  // Adopt the server's answer whenever it has one. Guarded on the server value
  // rather than on the local one: a refresh after an upload re-runs this, and
  // clobbering a fresh local pick with a stale null would silently undo it.
  useEffect(() => {
    if (status?.governmentIdType) setIdType(status.governmentIdType);
  }, [status?.governmentIdType]);

  const views = useMemo(
    () => (status ? buildGroupViews(groups, status, new Date(), idType) : []),
    [groups, status, idType],
  );
  const retired = useMemo(
    () => (status ? buildRetiredSlots(groups, status) : []),
    [groups, status],
  );

  const progressRows = useMemo(
    () =>
      toProgressRows(
        views,
        profileRequirements.map((r) => ({ key: r.key, status: r.status })),
      ),
    [views, profileRequirements],
  );

  const progress = useMemo(
    () => computeProgress(progressRows),
    [progressRows],
  );

  const aggregate = useMemo(
    () =>
      status
        ? deriveAggregateStatus(status.verificationStatus, progressRows)
        : "NOT_STARTED",
    [status, progressRows],
  );

  // The badge is already granted but requirements were added since — see the
  // grandfathering note in kyc-document.schema.ts. Say so plainly rather than
  // letting an INCOMPLETE checklist imply the badge is at risk.
  const grandfathered =
    status?.verificationStatus === "APPROVED" && aggregate !== "VERIFIED";

  /**
   * The front of a government ID — the first document type of any card flagged
   * `governmentId`. Derived from the groups prop rather than hardcoding
   * VALID_ID/OWNER_VALID_ID, so this shared body keeps knowing nothing about
   * which role it is rendering.
   */
  const governmentIdFrontTypes = useMemo(
    () =>
      new Set(
        groups
          .filter((g) => g.governmentId)
          .map((g) => g.documentTypes[0])
          .filter((t): t is KycDocumentType => !!t),
      ),
    [groups],
  );

  const isGovernmentIdFront = useCallback(
    (documentType: KycDocumentType) =>
      governmentIdFrontTypes.has(documentType),
    [governmentIdFrontTypes],
  );

  /**
   * Upload one document's bytes and refresh the checklist.
   *
   * Throws on failure rather than alerting: the liveness overlay renders the
   * error itself (with a Try again that keeps the camera open), and the picker
   * path below turns it into the alert it always showed.
   */
  const submitBytes = useCallback(
    async (
      documentType: KycDocumentType,
      payload: {
        base64: string;
        mimeType: string;
        livenessChallenge?: LivenessCapturePhoto["challenge"];
        livenessMetadata?: LivenessCapturePhoto["metadata"];
      },
    ) => {
      setUploading(documentType);
      try {
        await gqlSubmitKycDocument({
          providerType,
          providerId,
          documentType,
          expiresAt: expiryDrafts[documentType] ?? null,
          // Only the front carries the claim — the BE rejects it elsewhere as
          // noise, and rejects its absence here. hasRequiredIdType has already
          // guaranteed it is set by the time we get this far.
          ...(isGovernmentIdFront(documentType) &&
            idType != null && { governmentIdType: idType }),
          ...payload,
        });
        setExpiryDrafts((prev) => {
          const next = { ...prev };
          delete next[documentType];
          return next;
        });
        await load();
        // Some documents have effects beyond the checklist — a washer's selfie
        // also becomes her avatar and store logo. The owning screen decides
        // what that means; this one just reports what landed.
        await onDocumentSubmitted?.(documentType);
      } finally {
        setUploading(null);
      }
    },
    [
      expiryDrafts,
      idType,
      isGovernmentIdFront,
      providerType,
      providerId,
      load,
      onDocumentSubmitted,
    ],
  );

  /** False (with the reason on screen) when the type needs an expiry and has none. */
  const hasRequiredExpiry = useCallback(
    (documentType: KycDocumentType) => {
      const slot = status?.documents.find(
        (d) => d.documentType === documentType,
      );
      if (slot?.expiryPolicy === "REQUIRED" && !expiryDrafts[documentType]) {
        showAlert(
          "Expiry date needed",
          "Enter the expiry date printed on this document before uploading it.",
        );
        return false;
      }
      return true;
    },
    [status, expiryDrafts],
  );

  /**
   * False (with the reason on screen) when a government ID is about to be
   * uploaded and nothing says which ID it is.
   *
   * Both sides are gated, not just the front: the back is only meaningful once
   * the front's claim exists, and letting it through first would leave the
   * partner staring at a card whose other half still refuses to upload.
   */
  const hasRequiredIdType = useCallback(
    (documentType: KycDocumentType) => {
      const inGovernmentIdGroup = groups.some(
        (g) => g.governmentId && g.documentTypes.includes(documentType),
      );
      if (inGovernmentIdGroup && !idType) {
        showAlert(
          "Select your ID type",
          "Choose which government-issued ID you're uploading before you add a photo.",
        );
        return false;
      }
      return true;
    },
    [groups, idType],
  );

  const pickAnd = useCallback(
    async (
      documentType: KycDocumentType,
      picker: () => Promise<PickedDocument | null>,
    ) => {
      if (!hasRequiredIdType(documentType)) return;
      if (!hasRequiredExpiry(documentType)) return;
      const picked = await picker();
      if (!picked) return;
      try {
        const { base64, mimeType } = await readForUpload(picked);
        await submitBytes(documentType, { base64, mimeType });
      } catch (err) {
        showAlert(
          "Upload failed",
          err instanceof Error
            ? err.message
            : "Something went wrong uploading that document.",
        );
      }
    },
    [hasRequiredIdType, hasRequiredExpiry, submitBytes],
  );

  // The liveness path never reaches readForUpload: the capture component has
  // already re-encoded the frame to a bounded, EXIF-stripped JPEG, which is
  // exactly what the backend wants. Errors propagate on purpose — see
  // submitBytes.
  const onLivenessCaptured = useCallback(
    async (photo: LivenessCapturePhoto) => {
      if (!livenessFor) return;
      await submitBytes(livenessFor, {
        base64: photo.base64,
        mimeType: photo.mimeType,
        livenessChallenge: photo.challenge,
        livenessMetadata: photo.metadata,
      });
      setLivenessFor(null);
    },
    [livenessFor, submitBytes],
  );

  /**
   * Open the guided ID camera — but only once the same gates that guard a
   * picker upload have passed.
   *
   * The liveness path skips these deliberately: SELFIE is in neither a
   * government-ID group nor an expiring type, so neither gate can fire. An ID
   * card is in both. Letting the camera open, letting the washer line up and
   * shoot, and only then refusing the upload would be a worse version of the
   * alert they get today.
   */
  const startIdCapture = useCallback(
    (documentType: KycDocumentType) => {
      if (!hasRequiredIdType(documentType)) return;
      if (!hasRequiredExpiry(documentType)) return;
      setIdCaptureFor(documentType);
    },
    [hasRequiredIdType, hasRequiredExpiry],
  );

  // Like the liveness path, this never reaches readForUpload: the capture
  // component has already re-encoded the frame to a bounded, EXIF-stripped
  // JPEG, which is exactly what the backend wants. Errors propagate on purpose
  // — the overlay renders them itself with a Try again that keeps the camera
  // open.
  const onIdCardCaptured = useCallback(
    async (photo: IdCardCapturePhoto) => {
      if (!idCaptureFor) return;
      await submitBytes(idCaptureFor, {
        base64: photo.base64,
        mimeType: photo.mimeType,
      });
      setIdCaptureFor(null);
    },
    [idCaptureFor, submitBytes],
  );

  const openPreview = useCallback(
    async (documentType: KycDocumentType, documentId: string) => {
      setPreview({ documentType, uri: null, loading: true });
      try {
        const uri = await gqlKycDocumentUrl(documentId);
        setPreview({ documentType, uri, loading: false });
      } catch {
        setPreview(null);
        showAlert(
          "Could not open document",
          "The secure link could not be created. Try again in a moment.",
        );
      }
    },
    [],
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={accent.fg} />
      </View>
    );
  }

  if (loadError || !status) {
    return (
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={refreshControl}
      >
        <VerificationHeader
          title={title}
          subtitle={subtitle}
          onBack={onBack}
          accent={accent}
        />
        <EmptyState
          title="Couldn't load verification"
          description={loadError ?? "Please try again."}
          action="Try again"
          onAction={() => void load()}
        />
      </ScrollView>
    );
  }

  return (
    <>
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      <VerificationHeader
        title={title}
        subtitle={subtitle}
        onBack={onBack}
        accent={accent}
      />

      {aggregate === "VERIFIED" ? (
        <View style={styles.group}>
          <VerificationSuccess
            title={successTitle}
            message={successMessage}
            badgeLabel={badgeLabel}
            accent={accent}
          />
        </View>
      ) : (
        <View style={styles.group}>
          <VerificationProgress
            done={progress.done}
            total={progress.total}
            verified={progress.verified}
            percent={progress.percent}
            remaining={progress.remaining}
            accent={accent}
          />
        </View>
      )}

      {grandfathered && (
        <VerificationInfoBanner
          tone="success"
          title="You're verified"
          message="New documents are now required for verification. Your badge isn't affected — we'll ask for these at your next review."
        />
      )}

      {aggregate === "ACTION_REQUIRED" && status.providerRejectionReason && (
        <VerificationInfoBanner
          tone="warning"
          title="One of your documents needs attention"
          message={status.providerRejectionReason}
        />
      )}

      {aggregate === "UNDER_REVIEW" && (
        <VerificationInfoBanner
          tone="info"
          title="Verification under review"
          message="We'll update your status once the review is complete. You can't change a document while it's being checked."
        />
      )}

      {/* Profile-backed rows. Self-attested, so their chips read
          Complete/Incomplete rather than Verified. */}
      {profileRequirements.length > 0 && (
        <View style={styles.group}>
          {profileRequirements.map((req) => (
            <VerificationRequirementItem
              key={req.key}
              title={req.title}
              description={req.description}
              status={req.status}
              kind="PROFILE"
              accent={accent}
              onPress={req.onPress}
            />
          ))}
        </View>
      )}

      {views.map((view) => (
        <GroupCard
          key={view.group.key}
          view={view}
          accent={accent}
          expanded={expanded === view.group.key}
          uploading={uploading}
          expiryDrafts={expiryDrafts}
          idType={idType}
          onIdTypeChange={setIdType}
          preview={preview}
          onToggle={() =>
            setExpanded((cur) => (cur === view.group.key ? null : view.group.key))
          }
          onExpiryChange={(documentType, date) =>
            setExpiryDrafts((prev) => ({ ...prev, [documentType]: date }))
          }
          onPick={pickAnd}
          onStartLiveness={setLivenessFor}
          onStartIdCapture={startIdCapture}
          onPreview={openPreview}
          onClosePreview={() => setPreview(null)}
        />
      ))}

      {retired.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Additional documents</Text>
          <View style={styles.group}>
            {retired.map((slot) => (
              <VerificationRequirementItem
                key={slot.documentType}
                title={slot.label}
                description={slot.hint}
                status={slot.status}
                accent={accent}
                onPress={() =>
                  slot.detail.documentId &&
                  void openPreview(slot.documentType, slot.detail.documentId)
                }
              />
            ))}
          </View>
        </>
      )}

      <View style={{ height: SP._40 }} />
    </ScrollView>

    {/* Covers the checklist while the camera is up. Nothing behind it is
        reachable — the capture has exactly two outcomes, a passing photo or
        Cancel — so it doubles as the modal it would otherwise need to be. */}
    {livenessFor && (
      <LivenessCapture
        style={styles.captureOverlay}
        // The screens hosting this checklist already pad for the status bar,
        // and an absolute child is positioned inside that padding — insetting
        // the top again here would push the camera a status bar too low.
        safeAreaEdges={["bottom"]}
        title="Selfie Verification"
        subtitle="Position your face in the circle and follow the prompt. We'll take the photo for you."
        onCaptured={onLivenessCaptured}
        escapeLabel="Cancel"
        onEscape={() => setLivenessFor(null)}
      />
    )}

    {/* Absolute, not a Modal, for the same reason as the liveness overlay
        above — same camera library, same lifecycle bug. Only one of the two can
        be open at a time: a document type belongs to exactly one group, and a
        group has exactly one capture mode. */}
    {idCaptureFor && (
      <IdCardCapture
        style={styles.captureOverlay}
        safeAreaEdges={["bottom"]}
        title={
          idCaptureFor === "VALID_ID_BACK" ? "Back of ID" : "Front of ID"
        }
        subtitle="Place your ID on a flat, dark surface and line it up with the frame."
        onCaptured={onIdCardCaptured}
        escapeLabel="Cancel"
        onEscape={() => setIdCaptureFor(null)}
      />
    )}
    </>
  );
}

function GroupCard({
  view,
  accent,
  expanded,
  uploading,
  expiryDrafts,
  idType,
  onIdTypeChange,
  preview,
  onToggle,
  onExpiryChange,
  onPick,
  onStartLiveness,
  onStartIdCapture,
  onPreview,
  onClosePreview,
}: Readonly<{
  view: RequirementGroupView;
  accent: VerificationAccent;
  expanded: boolean;
  uploading: KycDocumentType | null;
  expiryDrafts: Partial<Record<KycDocumentType, Date>>;
  idType: GovernmentIdType | null;
  onIdTypeChange: (idType: GovernmentIdType) => void;
  preview: { documentType: KycDocumentType; uri: string | null; loading: boolean } | null;
  onToggle: () => void;
  onExpiryChange: (documentType: KycDocumentType, date: Date) => void;
  onPick: (
    documentType: KycDocumentType,
    picker: () => Promise<PickedDocument | null>,
  ) => Promise<void>;
  onStartLiveness: (documentType: KycDocumentType) => void;
  onStartIdCapture: (documentType: KycDocumentType) => void;
  onPreview: (documentType: KycDocumentType, documentId: string) => Promise<void>;
  onClosePreview: () => void;
}>) {
  const { group } = view;
  // Expiry can only ever be in the future — the backend rejects a past date.
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  }, []);

  return (
    <View style={styles.group}>
      <VerificationRequirementItem
        title={group.title}
        description={group.description}
        status={view.status}
        accent={accent}
        expanded={expanded}
        onPress={onToggle}
      />

      {view.rejectionReason && (
        <RejectionReason
          documentLabel={group.title}
          reason={view.rejectionReason}
          reviewedAt={
            view.slots.find((s) => s.detail.rejectionReason)?.detail.reviewedAt ??
            null
          }
          onUploadNew={onToggle}
        />
      )}

      {/* Above the slots, not inside one: the choice governs the whole card, and
          on a passport it makes the Back of ID card below it disappear — which
          only reads as cause and effect from up here. Locked once a document is
          under review, matching the upload buttons: the reviewer is looking at
          the ID this claim describes. */}
      {expanded && view.group.governmentId && (
        <View style={styles.idTypeField}>
          <Text style={styles.expiryLabel}>ID type (required)</Text>
          <OptionField
            value={idType}
            options={GOVERNMENT_ID_TYPE_OPTIONS}
            onChange={onIdTypeChange}
            placeholder="Select your ID type"
            sheetTitle="Which ID is this?"
            confirmLabel="Use this ID"
            disabled={view.status === "UNDER_REVIEW"}
          />
        </View>
      )}

      {expanded &&
        view.slots.map((slot) => {
          const showExpiry = slot.detail.expiryPolicy !== "NONE";
          const previewing = preview?.documentType === slot.documentType;
          return (
            <View key={slot.documentType}>
              <DocumentUploadCard
                label={slot.label}
                hint={slot.hint}
                status={slot.status}
                submittedAt={slot.detail.submittedAt}
                expiresAt={slot.detail.expiresAt}
                accent={accent}
                uploading={uploading === slot.documentType}
                // A liveness slot opens the guided capture instead of the
                // system camera: same button, but the user never holds the
                // shutter and the photo can only come from this device's front
                // lens, right now.
                // Three capture modes now. The system camera stays the
                // default: it is right for anything without a fixed shape, and
                // an in-app preview would only take away the OS camera's own
                // controls without offering guidance in return.
                onTakePhoto={() => {
                  if (group.capture === "LIVENESS") {
                    onStartLiveness(slot.documentType);
                  } else if (group.capture === "ID_CARD") {
                    onStartIdCapture(slot.documentType);
                  } else {
                    void onPick(slot.documentType, pickFromCamera);
                  }
                }}
                takePhotoLabel={
                  {
                    LIVENESS: "Start selfie check",
                    ID_CARD: "Open camera guide",
                    CAMERA: undefined,
                  }[group.capture ?? "CAMERA"]
                }
                onPickFile={
                  group.allowFiles
                    ? () => void onPick(slot.documentType, pickFile)
                    : undefined
                }
                onPreview={
                  slot.detail.documentId
                    ? () =>
                        previewing
                          ? onClosePreview()
                          : void onPreview(
                              slot.documentType,
                              slot.detail.documentId!,
                            )
                    : undefined
                }
                expiryField={
                  showExpiry ? (
                    <View style={{ gap: 4 }}>
                      <Text style={styles.expiryLabel}>
                        Expiry date
                        {slot.detail.expiryPolicy === "REQUIRED"
                          ? " (required)"
                          : " (optional)"}
                      </Text>
                      <DateField
                        value={
                          expiryDrafts[slot.documentType] ??
                          slot.detail.expiresAt ??
                          null
                        }
                        onChange={(d) => onExpiryChange(slot.documentType, d)}
                        minDate={tomorrow}
                        placeholder="Select expiry date"
                      />
                    </View>
                  ) : undefined
                }
              />
              {previewing && (
                <DocumentPreview
                  uri={preview?.uri ?? null}
                  mimeType={null}
                  loading={preview?.loading ?? false}
                />
              )}
            </View>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.gray50 },
  scroll: { paddingHorizontal: SP._16, paddingTop: SP._16, paddingBottom: SP._40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.gray50 },
  group: {
    backgroundColor: C.white,
    borderRadius: 16,
    ...SHADOW.sm,
    padding: SP._14,
    marginBottom: SP._16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: C.gray400,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: SP._8,
    marginLeft: SP._4,
  },
  expiryLabel: { fontSize: 12, fontWeight: "600", color: C.gray600 },
  idTypeField: { gap: 4, marginTop: SP._12, marginBottom: SP._4 },
  // Shared by both camera overlays (selfie liveness and the guided ID capture).
  // Absolute rather than a Modal: vision-camera in a Modal is its own class of
  // lifecycle bug, and this sits inside the same view tree the checklist
  // already fills.
  captureOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
});
