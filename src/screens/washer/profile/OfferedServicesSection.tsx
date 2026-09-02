// src/screens/washer/profile/OfferedServicesSection.tsx
// "Services" section — the washer picks which platform services she offers AND
// what she charges for each.
//
// Lalaba defines which services exist and which charging methods each allows;
// the washer sets the amount. A home washer with a 6.5 kg machine and one with
// a 12 kg machine do not have the same costs, so one platform-wide price
// mispriced both — see LALABA_BE_DEV/src/washer-service-offerings.
//
// A service Lalaba prices itself (pricingControl PLATFORM_FIXED) still shows
// its price read-only, exactly as this section behaved before.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { C, COMP } from "../../../theme/tokens";
import {
  gqlMyEffectiveCommission,
  type FeeChargedTo,
} from "../../../services/graphql/platformFee";
import {
  gqlAvailableWasherServiceTemplates,
  gqlMyWasherServiceOfferings,
  gqlRemoveWasherServiceOffering,
  gqlSetWasherServiceOffering,
} from "../../../services/graphql/washer";
import type {
  WasherPricingModel,
  WasherServiceOffering,
  WasherServiceTemplate,
} from "../../../types/washer.types";
import { profileStyles as styles } from "./profile.styles";
import {
  ALL_SERVICE_UNITS,
  draftFrom,
  draftToInput,
  describeOffering,
  describePlatformPricing,
  formatPeso,
  isCountedModel,
  PRICING_MODEL_LABELS,
  previewCentavos,
  SERVICE_UNIT_LABELS,
  validateDraft,
  type PricingDraft,
} from "./servicePricing";

// The basket the preview quotes. Roughly one full load for a typical home
// machine, so the number means something to the washer reading it.
const PREVIEW_KG = 8;

// Counted services have no weight to preview, so they quote a small order
// instead — two comforters, not two kilos of comforter.
const PREVIEW_QTY = 2;

interface Props {
  readonly selectedIds: readonly string[];
  readonly onToggle: (templateId: string, offered: boolean) => void;
  readonly editable: boolean;
}

export function OfferedServicesSection({
  selectedIds,
  onToggle,
  editable,
}: Props) {
  const [templates, setTemplates] = useState<WasherServiceTemplate[]>([]);
  const [offerings, setOfferings] = useState<WasherServiceOffering[]>([]);
  const [feePercent, setFeePercent] = useState(10);
  // Who actually bears the fee. Not assumed: it is admin-editable, and the
  // copy below used to state customer-paid as fact.
  const [chargedTo, setChargedTo] = useState<FeeChargedTo>("CUSTOMER");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Which service's pricing editor is open, and its in-progress draft.
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PricingDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  // `silent` refreshes in place, without swapping the whole section for a
  // spinner — a background refresh that blanks the list the washer is reading
  // is worse than the stale row it replaces.
  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setLoadError(false);
    }
    try {
      const [t, o, fee] = await Promise.all([
        gqlAvailableWasherServiceTemplates(),
        gqlMyWasherServiceOfferings(),
        // A wrong fee only skews the preview, so a failure here falls back to
        // the platform's historical terms rather than blocking the section.
        gqlMyEffectiveCommission("WASHER").catch(() => ({
          percent: 10,
          chargedTo: "CUSTOMER" as const,
          calculationType: "PERCENTAGE" as const,
          isConfigured: false,
        })),
      ]);
      setTemplates(t);
      setOfferings(o);
      setFeePercent(fee.percent);
      setChargedTo(fee.chargedTo);
      setLoadError(false);
    } catch {
      // A failed background refresh keeps whatever was already on screen; only
      // a failed foreground load has nothing to fall back to.
      if (!silent) setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Admin hides or publishes a service while the app is open, and Expo Router
  // keeps this screen mounted — fetching only on mount left the washer editing
  // a price for a service the platform no longer offers, which the BE then
  // rejected with "Service not found or no longer offered."
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

  const offeringByTemplate = useMemo(
    () => new Map(offerings.map((o) => [String(o.serviceTemplateId), o])),
    [offerings],
  );

  const openEditor = (template: WasherServiceTemplate) => {
    setOpenId(template._id);
    setDraft(draftFrom(template, offeringByTemplate.get(template._id)));
    setDraftError(null);
  };

  const closeEditor = () => {
    setOpenId(null);
    setDraft(null);
    setDraftError(null);
  };

  const savePricing = async (template: WasherServiceTemplate) => {
    if (!draft) return;
    const problem = validateDraft(template, draft);
    setDraftError(problem);
    if (problem) return;

    setSavingId(template._id);
    try {
      const saved = await gqlSetWasherServiceOffering(
        draftToInput(template._id, draft),
      );
      setOfferings((prev) => [
        ...prev.filter((o) => String(o.serviceTemplateId) !== template._id),
        saved,
      ]);
      closeEditor();
    } catch (err) {
      // The BE re-validates against the same policy; surface its wording
      // rather than a generic failure, since it names the actual limit.
      setDraftError(
        err instanceof Error ? err.message : "Couldn't save your price.",
      );
    } finally {
      setSavingId(null);
    }
  };

  const resetToPlatformPrice = async (template: WasherServiceTemplate) => {
    setSavingId(template._id);
    try {
      await gqlRemoveWasherServiceOffering(template._id);
      setOfferings((prev) =>
        prev.filter((o) => String(o.serviceTemplateId) !== template._id),
      );
      closeEditor();
    } catch (err) {
      setDraftError(
        err instanceof Error ? err.message : "Couldn't reset your price.",
      );
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Services</Text>
        <View style={styles.sectionCard}>
          <View style={styles.templateEmpty}>
            <ActivityIndicator color={C.accent500} />
          </View>
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Services</Text>
        <View style={styles.sectionCard}>
          <View style={styles.templateEmpty}>
            <Text style={styles.templateEmptyText}>
              Couldn&apos;t load the service catalog.
            </Text>
            <TouchableOpacity
              style={styles.templateRetryBtn}
              onPress={() => void load()}
            >
              <Text style={styles.templateRetryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Services</Text>
      <View style={styles.sectionCard}>
        {templates.length === 0 ? (
          <View style={styles.templateEmpty}>
            <Text style={styles.templateEmptyText}>
              No services are available in the platform catalog yet.
            </Text>
          </View>
        ) : (
          templates.map((t, idx) => (
            <View key={t._id}>
              {idx > 0 && <View style={styles.divider} />}
              <ServiceRow
                template={t}
                offering={offeringByTemplate.get(t._id)}
                offered={selectedIds.includes(t._id)}
                editable={editable}
                expanded={openId === t._id}
                draft={openId === t._id ? draft : null}
                draftError={openId === t._id ? draftError : null}
                saving={savingId === t._id}
                feePercent={feePercent}
                chargedTo={chargedTo}
                onToggle={onToggle}
                onOpenEditor={() => openEditor(t)}
                onCloseEditor={closeEditor}
                onDraftChange={setDraft}
                onSave={() => void savePricing(t)}
                onReset={() => void resetToPlatformPrice(t)}
              />
            </View>
          ))
        )}
      </View>
      <View style={styles.platformNote}>
        <Ionicons
          name="information-circle-outline"
          size={14}
          color={C.accent700}
        />
        <Text style={styles.platformNoteText}>
          {/* Stated from the RULE, not assumed. Saying "deducted from your
              payout" when the customer pays made washers price as if they were
              losing it; saying the customer pays when they don't would be the
              same error pointing the other way. */}
          {chargedTo === "CUSTOMER"
            ? `Customers pay a ${feePercent}% Lalaba fee on top of your price. You keep what you charge.`
            : chargedTo === "PROVIDER"
              ? `A ${feePercent}% Lalaba fee is deducted from your price. Customers pay the price you set.`
              : `A ${feePercent}% Lalaba fee is shared between you and the customer.`}
        </Text>
      </View>
    </View>
  );
}

// ─── One service row ──────────────────────────────────────────────────────────

function ServiceRow({
  template,
  offering,
  offered,
  editable,
  expanded,
  draft,
  draftError,
  saving,
  feePercent,
  chargedTo,
  onToggle,
  onOpenEditor,
  onCloseEditor,
  onDraftChange,
  onSave,
  onReset,
}: Readonly<{
  template: WasherServiceTemplate;
  offering: WasherServiceOffering | undefined;
  offered: boolean;
  editable: boolean;
  expanded: boolean;
  draft: PricingDraft | null;
  draftError: string | null;
  saving: boolean;
  feePercent: number;
  chargedTo: FeeChargedTo;
  onToggle: (templateId: string, offered: boolean) => void;
  onOpenEditor: () => void;
  onCloseEditor: () => void;
  onDraftChange: (draft: PricingDraft) => void;
  onSave: () => void;
  onReset: () => void;
}>) {
  const platformPriced = template.pricingControl === "PLATFORM_FIXED";
  const canPrice = offered && !platformPriced;

  return (
    <View>
      <View style={styles.templateRow}>
        <View style={styles.templateInfo}>
          <Text style={styles.templateName}>{template.name}</Text>
          <Text style={styles.templatePrice}>
            {describeOffering(template, offering)}
          </Text>
          {template.description ? (
            <Text style={styles.templateDesc} numberOfLines={2}>
              {template.description}
            </Text>
          ) : null}
        </View>
        <Switch
          value={offered}
          disabled={!editable}
          onValueChange={(v) => onToggle(template._id, v)}
          trackColor={{ false: C.gray200, true: C.accent100 }}
          thumbColor={offered ? C.accent500 : C.gray400}
        />
      </View>

      {canPrice && (
        <TouchableOpacity
          onPress={expanded ? onCloseEditor : onOpenEditor}
          style={styles.pricingToggle}
        >
          <Text style={styles.pricingToggleText}>
            {expanded
              ? "Close"
              : offering
                ? "Edit your price"
                : "Set your own price"}
          </Text>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={15}
            color={C.accent700}
          />
        </TouchableOpacity>
      )}

      {/* Names the method too — "Lalaba sets the price" alone left a washer
          unable to tell whether a big basket would be one charge or three. */}
      {platformPriced && offered && (
        <Text style={styles.pricingLocked}>
          Lalaba sets the price for this service:{" "}
          {describePlatformPricing(template)}.
        </Text>
      )}

      {expanded && draft && (
        <PricingEditor
          template={template}
          offering={offering}
          chargedTo={chargedTo}
          draft={draft}
          error={draftError}
          saving={saving}
          feePercent={feePercent}
          onChange={onDraftChange}
          onSave={onSave}
          onReset={onReset}
        />
      )}
    </View>
  );
}

// ─── Pricing editor ───────────────────────────────────────────────────────────

function PricingEditor({
  template,
  offering,
  draft,
  error,
  saving,
  feePercent,
  chargedTo,
  onChange,
  onSave,
  onReset,
}: Readonly<{
  template: WasherServiceTemplate;
  offering: WasherServiceOffering | undefined;
  draft: PricingDraft;
  error: string | null;
  saving: boolean;
  feePercent: number;
  chargedTo: FeeChargedTo;
  onChange: (draft: PricingDraft) => void;
  onSave: () => void;
  onReset: () => void;
}>) {
  const set = (patch: Partial<PricingDraft>) => onChange({ ...draft, ...patch });
  const allowed = template.allowedPricingModels ?? [];
  const counted = isCountedModel(draft.model);
  // A per-item service has no weight to preview against, so the basket is a
  // count instead. Passing kilos into a per-piece price would read "7" as
  // seven comforters and quote her ₱1,750.
  const preview = previewCentavos(
    draft,
    counted
      ? { kind: "quantity", count: PREVIEW_QTY }
      : { kind: "weight", kg: PREVIEW_KG },
    feePercent,
    chargedTo,
  );
  const unitLabel = SERVICE_UNIT_LABELS[draft.unit];

  const priceLabel =
    draft.model === "PER_KG"
      ? "Price per kilo (₱)"
      : draft.model === "PER_LOAD"
        ? "Price per load (₱)"
        : draft.model === "PER_ITEM"
          ? `Price per ${unitLabel} (₱)`
          : "Base price (₱)";

  return (
    <View style={styles.pricingEditor}>
      {allowed.length > 1 && (
        <>
          <Text style={COMP.fieldLabel}>How do you want to charge?</Text>
          <View style={styles.segRow}>
            {allowed.map((m: WasherPricingModel) => {
              const active = draft.model === m;
              return (
                <TouchableOpacity
                  key={m}
                  style={[styles.segOpt, active && styles.segOptActive]}
                  onPress={() => set({ model: m })}
                >
                  <Text
                    style={[styles.segLabel, active && styles.segLabelActive]}
                  >
                    {PRICING_MODEL_LABELS[m]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      <Text style={COMP.fieldLabel}>{priceLabel}</Text>
      <TextInput
        style={COMP.field}
        value={draft.pricePeso}
        onChangeText={(v) => set({ pricePeso: v })}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />

      {draft.model === "PER_LOAD" && (
        <>
          <Text style={COMP.fieldLabel}>Kilos per load</Text>
          <TextInput
            style={COMP.field}
            value={draft.loadCapacityKg}
            onChangeText={(v) => set({ loadCapacityKg: v })}
            keyboardType="decimal-pad"
            placeholder="e.g. 7"
          />
          <Text style={styles.pricingHint}>
            Your machine&apos;s capacity. Bigger baskets are charged for the
            extra loads they need.
          </Text>
        </>
      )}

      {draft.model === "BASE_EXCESS" && (
        <>
          <Text style={COMP.fieldLabel}>Kilos the base price covers</Text>
          <TextInput
            style={COMP.field}
            value={draft.baseWeightKg}
            onChangeText={(v) => set({ baseWeightKg: v })}
            keyboardType="decimal-pad"
            placeholder="e.g. 7"
          />
          <Text style={COMP.fieldLabel}>Rate per extra kilo (₱)</Text>
          <TextInput
            style={COMP.field}
            value={draft.excessRatePeso}
            onChangeText={(v) => set({ excessRatePeso: v })}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
        </>
      )}

      {draft.model === "PER_ITEM" && (
        <>
          <Text style={COMP.fieldLabel}>What are you counting?</Text>
          <View style={styles.segRow}>
            {ALL_SERVICE_UNITS.map((u) => {
              const active = draft.unit === u;
              return (
                <TouchableOpacity
                  key={u}
                  style={[styles.segOpt, active && styles.segOptActive]}
                  onPress={() => set({ unit: u })}
                >
                  <Text
                    style={[styles.segLabel, active && styles.segLabelActive]}
                  >
                    {SERVICE_UNIT_LABELS[u]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={COMP.fieldLabel}>Smallest order (optional)</Text>
          <TextInput
            style={COMP.field}
            value={draft.minQuantity}
            onChangeText={(v) => set({ minQuantity: v })}
            keyboardType="number-pad"
            placeholder="No minimum"
          />
          <Text style={styles.pricingHint}>
            One {unitLabel} may not be worth the trip — set a minimum if you
            only take larger orders.
          </Text>

          <Text style={COMP.fieldLabel}>Largest order (optional)</Text>
          <TextInput
            style={COMP.field}
            value={draft.maxQuantity}
            onChangeText={(v) => set({ maxQuantity: v })}
            keyboardType="number-pad"
            placeholder="No maximum"
          />
          <Text style={styles.pricingHint}>
            The most you can handle in one booking.
          </Text>
        </>
      )}

      {draft.model !== "PER_LOAD" && draft.model !== "PER_ITEM" && (
        <>
          <Text style={COMP.fieldLabel}>Minimum kilos (optional)</Text>
          <TextInput
            style={COMP.field}
            value={draft.minBillableKg}
            onChangeText={(v) => set({ minBillableKg: v })}
            keyboardType="decimal-pad"
            placeholder="No minimum"
          />
          <Text style={styles.pricingHint}>
            Smaller baskets are still charged for this many kilos.
          </Text>
        </>
      )}

      {(template.minPriceCentavos != null ||
        template.maxPriceCentavos != null) && (
        <Text style={styles.pricingHint}>
          Lalaba allows{" "}
          {template.minPriceCentavos != null
            ? formatPeso(template.minPriceCentavos)
            : "any"}{" "}
          to{" "}
          {template.maxPriceCentavos != null
            ? formatPeso(template.maxPriceCentavos)
            : "any"}{" "}
          for this service.
        </Text>
      )}

      {/* The preview is the whole point of this editor: a washer sets ₱180 and
          the customer is quoted ₱198, because the fee rides on top. Hiding that
          would have her price against a number nobody is charged. */}
      {preview && (
        <View style={styles.pricingPreview}>
          <Text style={styles.pricingPreviewTitle}>
            {counted
              ? `${PREVIEW_QTY} ${unitLabel}s`
              : `A ${PREVIEW_KG} kg basket`}
          </Text>
          {preview.loads != null && (
            <Text style={styles.pricingPreviewLine}>
              {preview.loads} {preview.loads === 1 ? "load" : "loads"} ×{" "}
              {formatPeso(Math.round(preview.washerTakes / preview.loads))}
            </Text>
          )}
          <Text style={styles.pricingPreviewLine}>
            Customer pays {formatPeso(preview.customerPays)}
          </Text>
          <Text style={styles.pricingPreviewStrong}>
            You keep {formatPeso(preview.washerTakes)}
          </Text>
        </View>
      )}

      {error ? <Text style={styles.fieldError}>{error}</Text> : null}

      <View style={styles.pricingActions}>
        {offering && (
          <TouchableOpacity
            style={styles.pricingResetBtn}
            onPress={onReset}
            disabled={saving}
          >
            <Text style={styles.pricingResetText}>Use Lalaba&apos;s price</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.pricingSaveBtn, saving && { opacity: 0.6 }]}
          onPress={onSave}
          disabled={saving}
        >
          <Text style={styles.pricingSaveText}>
            {saving ? "Saving…" : "Save price"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
