// app/(tabs)/tasks.tsx
// Task Management — create & manage operational checklists (owner/manager).
// Tasks carry category, priority, schedule (one-time/daily/weekly/monthly/custom),
// assignment (everyone/owner/staff/specific people), and completion rules
// (photo proof, completion note, notify owner). Staff complete them on their side.

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Modal,
  Image,
  Switch,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { showAlert, showConfirm } from "../../src/lib/dialog";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  gqlMyTasks, gqlCreateTask, gqlUpdateTask, gqlDeleteTask, gqlCompleteTask,
  type GqlTask,
} from "../../src/services/graphql/tasks";
import { fetchMyStaff } from "../../src/services/graphql/staff";
import { useAuthStore } from "../../src/stores/authStore";
import { useMerchantStore } from "../../src/stores/merchantStore";
import { useNotificationStore } from "../../src/stores/notificationStore";
import { C, RADIUS, SP } from "../../src/theme/tokens";
import { HeroHeader, TopBar, Card } from "../../src/components/ui";
import { BranchPickerView } from "../../src/components/BranchPickerView";
import { TimeField } from "../../src/components/TimeField";
import {
  type Task,
  type Frequency,
  type Category,
  type Priority,
  type AssignMode,
  type BranchRole,
  FREQ_OPTIONS,
  CATEGORY_OPTIONS,
  CATEGORY_META,
  PRIORITY_OPTIONS,
  PRIORITY_META,
  ASSIGN_OPTIONS,
  ROLE_OPTIONS,
  WEEKDAYS,
  shouldReset,
  getResetCountdown,
  freqLabel,
  frequencyText,
  formatDueTime,
  previewLine,
  assignmentText,
} from "../../src/features/tasks/taskHelpers";
import { IconPlus, IconCheck, IconClose, IconDots, IconCheckCircle, IconCamera, IconNote } from "../../src/components/ui/icons";
import { styles } from "../../src/screens/tasks/styles";
import { toUserMessage } from "../../src/utils/userError";

interface StaffLite { id: string; name: string; branchAccessIds: string[]; }

function mapGqlTask(t: GqlTask): Task {
  const nonUrgentPriority: Priority = t.priority === "high" ? "IMPORTANT" : "NORMAL";
  const mappedPriority: Priority = t.priority === "urgent" ? "URGENT" : nonUrgentPriority;
  return {
    id:               t._id,
    title:            t.title,
    description:      t.description,
    category:         (t.category?.toUpperCase() as Category) ?? "OTHER",
    priority:         mappedPriority,
    frequency:        "ONCE",
    customDays:       [],
    dueTime:          null,
    assignMode:       "EVERYONE",
    assignedRole:     undefined,
    assignedStaffIds: [],
    requirePhoto:     false,
    requireNote:      false,
    notifyOwner:      false,
    isCompleted:      t.isCompleted,
    completedAt:      t.completedAt ? new Date(t.completedAt) : undefined,
    completedBy:      t.completedBy ?? null,
    completionNote:   t.noteText ?? null,
    proofPhotoUri:    t.photoUri ?? null,
    createdAt:        t.createdAt ? new Date(t.createdAt) : undefined,
    merchantId:       t.uid,
    branchId:         t.branchId ?? null,
    order:            0,
  };
}

// ─── Icons ────────────────────────────────────────────────────────────────────

// Icons moved to the shared set in src/components/ui/icons — see imports above.

// ─── Selectable chip (segmented option with check when active) ───────────────────

function OptionChip({
  label, active, onPress, flex,
}: Readonly<{ label: string; active: boolean; onPress: () => void; flex?: boolean }>) {
  return (
    <TouchableOpacity
      style={[styles.optionChip, flex && { flex: 1 }, active && styles.optionChipActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {active && <IconCheck color={C.brand600} size={12} />}
      <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TASK_PAGE = 25;

export default function TasksScreen({ onBack: onBackProp, initialBranchId }: { onBack?: () => void; initialBranchId?: string } = {}) {
  const { fromSettings } = useLocalSearchParams<{ fromSettings?: string }>();
  const goBack = onBackProp ?? (() => fromSettings === "1" ? router.replace("/(tabs)/settings") : router.back());
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;

  const { merchantId, role, activeBranchId: authBranchId } = useAuthStore((s) => ({
    merchantId: s.merchantId, role: s.role, activeBranchId: s.activeBranchId,
  }));
  const isMerchant = role === "MERCHANT";
  const branches = useMerchantStore((s) => s.branches);

  const defaultBranchView: "picker" | "tasks" = isMerchant ? "picker" : "tasks";
  const [branchView, setBranchView] = useState<"picker" | "tasks">(
    initialBranchId ? "tasks" : defaultBranchView
  );
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(
    initialBranchId ?? (isMerchant ? null : (authBranchId ?? null))
  );

  useFocusEffect(
    useCallback(() => {
      if (isMerchant && !initialBranchId) { setBranchView("picker"); setSelectedBranchId(null); }
    }, [isMerchant, initialBranchId])
  );

  const [activeFilter, setActiveFilter] = useState<"ALL" | Frequency>("ALL");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Form state ──
  const [fTitle, setFTitle] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fCategory, setFCategory] = useState<Category>("CLEANING");
  const [fPriority, setFPriority] = useState<Priority>("NORMAL");
  const [fFreq, setFFreq] = useState<Frequency>("DAILY");
  const [fDays, setFDays] = useState<number[]>([]);
  const [fDueTime, setFDueTime] = useState<string | null>(null);
  const [fAssign, setFAssign] = useState<AssignMode>("EVERYONE");
  const [fRole, setFRole] = useState<BranchRole>("STAFF");
  const [fStaffIds, setFStaffIds] = useState<string[]>([]);
  const [fPhoto, setFPhoto] = useState(false);
  const [fNote, setFNote] = useState(false);
  const [fNotify, setFNotify] = useState(false);

  const fetchTasks = useCallback(async (opts?: { silent?: boolean }) => {
    if (!merchantId) { if (!opts?.silent) setLoading(false); return; }
    if (!opts?.silent) setLoading(true);
    try {
      const gqlTasks = await gqlMyTasks({ limit: 200 });
      const raw = gqlTasks.map(mapGqlTask);
      const toReset = raw.filter((t) => t.isCompleted && shouldReset(t));
      if (toReset.length > 0) {
        await Promise.all(toReset.map((t) => gqlUpdateTask(t.id, { isCompleted: false })));
        const refreshed = await gqlMyTasks({ limit: 200 });
        setTasks(refreshed.map(mapGqlTask));
      } else {
        setTasks(raw);
      }
    } catch (err) {
      console.warn("Tasks fetch:", err);
      setTasks([]);
      useNotificationStore.getState().push({ type: "error", title: "Failed to load", message: "Could not load tasks." });
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [merchantId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTasks({ silent: true });
    setRefreshing(false);
  }, [fetchTasks]);

  useEffect(() => {
    fetchMyStaff()
      .then((members) => setStaff(members.map((m) => ({
        id: m.id, name: m.name,
        branchAccessIds: Array.isArray((m as any).branchIds) ? (m as any).branchIds : [],
      }))))
      .catch(() => setStaff([]));
  }, [merchantId]);

  const staffNameById: Record<string, string> = {};
  staff.forEach((s) => { staffNameById[s.id] = s.name; });

  const branchStaff = selectedBranchId
    ? staff.filter((s) => s.branchAccessIds.length === 0 || s.branchAccessIds.includes(selectedBranchId))
    : staff;

  const toggleComplete = async (task: Task) => {
    const newVal = !task.isCompleted;
    try {
      if (newVal) {
        await gqlCompleteTask(task.id);
      } else {
        await gqlUpdateTask(task.id, { isCompleted: false });
      }
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, isCompleted: newVal } : t)));
      useNotificationStore.getState().push({
        type: "success", title: newVal ? "Task completed" : "Task reopened", message: task.title,
      });
    } catch (err: unknown) {
      useNotificationStore.getState().push({
        type: "error", title: "Could not update task", message: toUserMessage(err, "Try again."),
      });
    }
  };

  const resetForm = (freq: Frequency = "DAILY") => {
    setFTitle(""); setFDesc(""); setFCategory("CLEANING"); setFPriority("NORMAL");
    setFFreq(freq); setFDays([]); setFDueTime(null);
    setFAssign("EVERYONE"); setFRole("STAFF"); setFStaffIds([]);
    setFPhoto(false); setFNote(false); setFNotify(false);
  };

  const openAdd = () => { setEditingId(null); resetForm(); setModalVisible(true); };

  const openEdit = (task: Task) => {
    setEditingId(task.id);
    setFTitle(task.title); setFDesc(task.description ?? "");
    setFCategory(task.category); setFPriority(task.priority);
    setFFreq(task.frequency); setFDays(task.customDays ?? []); setFDueTime(task.dueTime ?? null);
    setFAssign(task.assignMode); setFRole(task.assignedRole ?? "STAFF"); setFStaffIds(task.assignedStaffIds ?? []);
    setFPhoto(!!task.requirePhoto); setFNote(!!task.requireNote); setFNotify(!!task.notifyOwner);
    setModalVisible(true);
  };

  const save = async () => {
    if (!merchantId || !fTitle.trim()) { showAlert("Validation", "Task title is required."); return; }
    setSaving(true);
    try {
      const nonUrgentTaskPriority: import("../../src/services/graphql/tasks").TaskPriority =
        fPriority === "IMPORTANT" ? "high" : "low";
      const priority: import("../../src/services/graphql/tasks").TaskPriority =
        fPriority === "URGENT" ? "urgent" : nonUrgentTaskPriority;
      const basePayload = {
        title:            fTitle.trim(),
        description:      fDesc.trim() || undefined,
        category:         fCategory.toLowerCase(),
        priority,
        isVisibleToStaff: true,
        branchId:         selectedBranchId ?? undefined,
        assignedToId:     fAssign === "SPECIFIC" && fStaffIds[0] ? fStaffIds[0] : undefined,
        assignedToName:   fAssign === "SPECIFIC" && fStaffIds[0] ? (staff.find((s) => s.id === fStaffIds[0])?.name) : undefined,
      };
      if (editingId) {
        await gqlUpdateTask(editingId, basePayload);
      } else {
        await gqlCreateTask(basePayload);
      }
      await fetchTasks();
      setModalVisible(false);
      useNotificationStore.getState().push({
        type: "success", title: editingId ? "Task updated" : "Task created", message: fTitle.trim(),
      });
    } catch (err: unknown) {
      useNotificationStore.getState().push({
        type: "error", title: "Save failed", message: toUserMessage(err, "Please try again."),
      });
    } finally {
      setSaving(false);
    }
  };

  const doDeleteTask = async (task: Task) => {
    try {
      await gqlDeleteTask(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      useNotificationStore.getState().push({ type: "success", title: "Task deleted", message: task.title });
    } catch (err: unknown) {
      useNotificationStore.getState().push({
        type: "error", title: "Could not delete task", message: toUserMessage(err, "Try again."),
      });
    }
  };
  const deleteTask = (task: Task) => {
    showConfirm("Delete Task", `Delete "${task.title}"?`, () => { void doDeleteTask(task); }, { confirmLabel: "Delete", destructive: true });
  };

  // ── List scoping & filtering ──
  const [visiblePending, setVisiblePending] = useState(TASK_PAGE);
  const [visibleDone, setVisibleDone] = useState(TASK_PAGE);

  const branchTasks = selectedBranchId
    ? tasks.filter((t) => !t.branchId || t.branchId === selectedBranchId)
    : tasks;
  const visibleTasks = activeFilter === "ALL" ? branchTasks : branchTasks.filter((t) => t.frequency === activeFilter);
  const pending = visibleTasks.filter((t) => !t.isCompleted);
  const done = visibleTasks.filter((t) => t.isCompleted);

  // Reset page counts when filter changes
  useEffect(() => { setVisiblePending(TASK_PAGE); setVisibleDone(TASK_PAGE); }, [activeFilter, selectedBranchId]);

  const FILTERS: { key: "ALL" | Frequency; label: string }[] = [
    { key: "ALL", label: "All" }, ...FREQ_OPTIONS.map((f) => ({ key: f.value, label: f.label })),
  ];

  const toggleStaffId = (id: string) =>
    setFStaffIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleDay = (d: number) =>
    setFDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);

  // ── Body ──
  let body: React.ReactNode;
  if (loading) {
    body = <View style={styles.loadingBox}><ActivityIndicator color={C.brand500} size="large" /></View>;
  } else if (visibleTasks.length === 0) {
    body = (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyTitle}>No tasks here yet</Text>
        {isMerchant && <Text style={styles.emptyDesc}>Tap “New Task” to add an operational checklist item for your team.</Text>}
      </View>
    );
  } else {
    body = (
      <>
        {pending.length > 0 && (
          <View style={{ marginBottom: SP._16 }}>
            <Text style={styles.sectionLabelPending}>To do ({pending.length})</Text>
            <View style={{ gap: SP._8 }}>
              {pending.slice(0, visiblePending).map((task) => (
                <PendingCard key={task.id} task={task} staffNames={staffNameById}
                  onToggle={() => { void toggleComplete(task); }}
                  onEdit={isMerchant ? () => openEdit(task) : undefined}
                  onDelete={isMerchant ? () => deleteTask(task) : undefined} />
              ))}
            </View>
            {visiblePending < pending.length && (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={() => setVisiblePending(v => v + TASK_PAGE)} activeOpacity={0.75}>
                <Text style={styles.loadMoreText}>Show {Math.min(TASK_PAGE, pending.length - visiblePending)} more pending</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {done.length > 0 && (
          <View>
            <View style={styles.sectionLabelDoneRow}>
              <Text style={styles.sectionLabelDone}>Done ({done.length})</Text>
              <IconCheckCircle color={C.success700} />
            </View>
            <View style={{ gap: SP._8 }}>
              {done.slice(0, visibleDone).map((task) => (
                <DoneCard key={task.id} task={task} onUndo={() => { void toggleComplete(task); }} />
              ))}
            </View>
            {visibleDone < done.length && (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={() => setVisibleDone(v => v + TASK_PAGE)} activeOpacity={0.75}>
                <Text style={styles.loadMoreText}>Show {Math.min(TASK_PAGE, done.length - visibleDone)} more done</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {visiblePending >= pending.length && visibleDone >= done.length && (
          <Text style={styles.endOfList}>— End of results —</Text>
        )}
      </>
    );
  }

  // ── Level 1: Branch picker (MERCHANT only) ──
  if (isMerchant && branchView === "picker") {
    return (
      <BranchPickerView
        title="Tasks"
        subtitle="Select a branch to manage"
        branches={branches}
        onBack={goBack}
        onSelect={(branchId) => { setSelectedBranchId(branchId); setBranchView("tasks"); }}
        getMetaText={(b) => {
          const count = tasks.filter((t) => !t.branchId || t.branchId === b.id).length;
          return `${count} task${count !== 1 ? "s" : ""}`;
        }}
      />
    );
  }

  const selectedBranch = branches.find((b) => b.id === selectedBranchId);
  const countdown = activeFilter !== "ALL" && activeFilter !== "ONCE" ? getResetCountdown(activeFilter) : "";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={{ flex: 1, backgroundColor: C.gray100 }}>
        {isMerchant ? (
          <TopBar
            title={selectedBranch?.name ?? "Tasks"}
            onBack={() => { setSelectedBranchId(null); setBranchView("picker"); }}
            right={pending.length > 0 ? <View style={styles.heroChip}><Text style={styles.heroChipText}>{pending.length} pending</Text></View> : undefined}
          />
        ) : (
          <HeroHeader title="Tasks" subtitle="Stay on top of daily ops"
            right={pending.length > 0 ? <View style={styles.heroChip}><Text style={styles.heroChipText}>{pending.length} pending</Text></View> : undefined} />
        )}

        {/* Frequency filter (scrollable) */}
        <View style={styles.filterBar}>
          <View style={{ maxWidth: 880, width: "100%", alignSelf: "center" }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
              {FILTERS.map((f) => {
                const active = activeFilter === f.key;
                return (
                  <TouchableOpacity key={f.key} style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setActiveFilter(f.key)} activeOpacity={0.8}>
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {!!countdown && <Text style={styles.countdownText}>{freqLabel(activeFilter as Frequency)} tasks reset in {countdown}</Text>}
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand500} colors={[C.brand500]} />}
        >
          {body}
        </ScrollView>

        {isMerchant && (
          <View style={styles.footerContainer}>
            <View style={{ maxWidth: 880, width: "100%", alignSelf: "center" }}>
              <TouchableOpacity style={styles.addTaskBtn} onPress={openAdd} activeOpacity={0.85}>
                <IconPlus color={C.white} />
                <Text style={styles.addTaskBtnText}>New Task</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* ── Create / Edit Task Modal ── */}
      <Modal supportedOrientations={["portrait", "landscape"]} visible={modalVisible} animationType={isTablet ? (Platform.OS === "android" ? "none" : "fade") : "slide"} transparent={isTablet} presentationStyle={isTablet ? "overFullScreen" : "pageSheet"} onRequestClose={() => setModalVisible(false)}>
        <View style={isTablet ? styles.tabletOverlay : { flex: 1 }}>
          <KeyboardAvoidingView style={isTablet ? styles.tabletCard : { flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <SafeAreaView style={[styles.modalSafe, isTablet && { borderRadius: RADIUS.xl, overflow: "hidden" }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.modalClose}><IconClose /></TouchableOpacity>
              <Text style={styles.modalTitle}>{editingId ? "Edit Task" : "Create Task"}</Text>
              <View style={{ width: 26 }} />
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              {/* ── BASIC DETAILS ── */}
              <Text style={styles.sectionHeader}>Basic Details</Text>

              <Text style={styles.fieldLabel}>Task Title<Text style={{ color: C.error500, fontWeight: "700" }}> *</Text></Text>
              <TextInput style={styles.fieldInput} value={fTitle} onChangeText={setFTitle}
                placeholder="e.g. Clean espresso machine" placeholderTextColor={C.gray400} maxLength={100} />

              <Text style={styles.fieldLabel}>Description (optional)</Text>
              <TextInput style={[styles.fieldInput, styles.fieldInputMulti]} value={fDesc} onChangeText={setFDesc}
                placeholder="Add instructions or details" placeholderTextColor={C.gray400} multiline maxLength={500} />

              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.wrapRow}>
                {CATEGORY_OPTIONS.map((c) => (
                  <OptionChip key={c} label={CATEGORY_META[c].label} active={fCategory === c} onPress={() => setFCategory(c)} />
                ))}
              </View>

              <Text style={styles.fieldLabel}>Priority</Text>
              <View style={styles.chipRow}>
                {PRIORITY_OPTIONS.map((p) => (
                  <OptionChip key={p} flex label={PRIORITY_META[p].label} active={fPriority === p} onPress={() => setFPriority(p)} />
                ))}
              </View>

              {/* ── SCHEDULE ── */}
              <Text style={styles.sectionHeader}>Schedule</Text>

              <Text style={styles.fieldLabel}>Repeat<Text style={{ color: C.error500, fontWeight: "700" }}> *</Text></Text>
              <View style={styles.wrapRow}>
                {FREQ_OPTIONS.map((f) => (
                  <OptionChip key={f.value} label={f.label} active={fFreq === f.value} onPress={() => setFFreq(f.value)} />
                ))}
              </View>

              {fFreq === "CUSTOM" && (
                <>
                  <Text style={styles.fieldLabel}>On these days<Text style={{ color: C.error500, fontWeight: "700" }}> *</Text></Text>
                  <View style={styles.daysRow}>
                    {WEEKDAYS.map((wd, i) => {
                      const active = fDays.includes(i);
                      return (
                        <TouchableOpacity key={wd} style={[styles.dayCircle, active && styles.dayCircleActive]}
                          onPress={() => toggleDay(i)} activeOpacity={0.8}>
                          <Text style={[styles.dayText, active && styles.dayTextActive]}>{wd[0]}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              <Text style={styles.fieldLabel}>Due Time</Text>
              <TimeField value={fDueTime} onChange={setFDueTime} />
              <Text style={styles.fieldHelp}>
                {fFreq === "ONCE"
                  ? "Staff will see this as the target completion time."
                  : `Staff will see this as the target time. This task resets ${frequencyText({ frequency: fFreq, customDays: fDays }).toLowerCase()}.`}
              </Text>

              {/* ── ASSIGNMENT ── */}
              <Text style={styles.sectionHeader}>Assignment</Text>
              <Text style={styles.fieldLabel}>Assign To</Text>
              <View style={styles.wrapRow}>
                {ASSIGN_OPTIONS.map((a) => (
                  <OptionChip key={a.value} label={a.label} active={fAssign === a.value} onPress={() => setFAssign(a.value)} />
                ))}
              </View>

              {fAssign === "ROLE" && (
                <View style={styles.wrapRow}>
                  {ROLE_OPTIONS.map((r) => (
                    <OptionChip key={r.value} label={r.label} active={fRole === r.value} onPress={() => setFRole(r.value)} />
                  ))}
                </View>
              )}

              {fAssign === "SPECIFIC" && (
                branchStaff.length === 0 ? (
                  <Text style={styles.fieldHelp}>No staff in this branch yet. Add staff in Settings → Staff Management.</Text>
                ) : (
                  <View style={styles.wrapRow}>
                    {branchStaff.map((s) => {
                      const active = fStaffIds.includes(s.id);
                      return <OptionChip key={s.id} label={s.name} active={active} onPress={() => toggleStaffId(s.id)} />;
                    })}
                  </View>
                )
              )}

              {/* ── COMPLETION RULES ── */}
              <Text style={styles.sectionHeader}>Completion Rules</Text>
              <View style={styles.rulesCard}>
                <RuleRow first label="Require photo proof" hint="Staff must attach a photo to complete" value={fPhoto} onChange={setFPhoto} />
                <RuleRow label="Require completion note" hint="Staff must add a note before completing" value={fNote} onChange={setFNote} />
                <RuleRow label="Notify owner on completion" hint="Log a note when this task is done" value={fNotify} onChange={setFNotify} />
              </View>

              {/* ── PREVIEW ── */}
              {!!fTitle.trim() && (
                <>
                  <Text style={styles.sectionHeader}>Preview</Text>
                  <View style={styles.previewCard}>
                    <View style={styles.previewBadges}>
                      <View style={[styles.badge, { backgroundColor: CATEGORY_META[fCategory].bg }]}>
                        <Text style={[styles.badgeText, { color: CATEGORY_META[fCategory].fg }]}>{CATEGORY_META[fCategory].label}</Text>
                      </View>
                      {fPriority !== "NORMAL" && (
                        <View style={[styles.badge, { backgroundColor: PRIORITY_META[fPriority].bg }]}>
                          <Text style={[styles.badgeText, { color: PRIORITY_META[fPriority].fg }]}>{PRIORITY_META[fPriority].label}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.previewTitle} numberOfLines={2}>{fTitle.trim()}</Text>
                    <Text style={styles.previewMeta}>
                      {previewLine({ frequency: fFreq, customDays: fDays, dueTime: fDueTime, assignMode: fAssign, assignedRole: fRole, assignedStaffIds: fStaffIds })}
                    </Text>
                    {(fPhoto || fNote || fNotify) && (
                      <View style={styles.previewRules}>
                        {fPhoto && <View style={styles.previewRulePill}><IconCamera color={C.gray600} /><Text style={styles.previewRuleText}>Photo</Text></View>}
                        {fNote && <View style={styles.previewRulePill}><IconNote color={C.gray600} /><Text style={styles.previewRuleText}>Note</Text></View>}
                        {fNotify && <View style={styles.previewRulePill}><Text style={styles.previewRuleText}>Notify owner</Text></View>}
                      </View>
                    )}
                  </View>
                </>
              )}
            </ScrollView>

            {/* Footer: Cancel · Create Task */}
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)} activeOpacity={0.8}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.createBtn, saving && { opacity: 0.6 }]} onPress={() => void save()} disabled={saving} activeOpacity={0.85}>
                {saving ? <ActivityIndicator color={C.white} /> : <Text style={styles.createBtnText}>{editingId ? "Save Changes" : "Create Task"}</Text>}
              </TouchableOpacity>
            </View>
          </SafeAreaView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Completion-rule toggle row ──────────────────────────────────────────────────

function RuleRow({
  label, hint, value, onChange, first,
}: Readonly<{ label: string; hint: string; value: boolean; onChange: (v: boolean) => void; first?: boolean }>) {
  return (
    <View style={[styles.ruleRow, !first && styles.ruleRowBorder]}>
      <View style={{ flex: 1, paddingRight: SP._12 }}>
        <Text style={styles.ruleLabel}>{label}</Text>
        <Text style={styles.ruleHint}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange}
        trackColor={{ false: C.gray200, true: C.brand400 }} thumbColor={value ? C.brand500 : C.gray400} />
    </View>
  );
}

// ─── Pending Card ─────────────────────────────────────────────────────────────

function TaskBadges({ task }: Readonly<{ task: Task }>) {
  const cat = CATEGORY_META[task.category];
  const pri = PRIORITY_META[task.priority];
  return (
    <View style={styles.cardBadges}>
      <View style={[styles.badge, { backgroundColor: cat.bg }]}><Text style={[styles.badgeText, { color: cat.fg }]}>{cat.label}</Text></View>
      {task.priority !== "NORMAL" && (
        <View style={[styles.badge, { backgroundColor: pri.bg }]}><Text style={[styles.badgeText, { color: pri.fg }]}>{pri.label}</Text></View>
      )}
      <View style={styles.metaPill}><Text style={styles.metaPillText}>{frequencyText(task)}</Text></View>
      {!!task.dueTime && <View style={styles.duePill}><Text style={styles.duePillText}>Due {formatDueTime(task.dueTime)}</Text></View>}
      {task.requirePhoto && <View style={styles.metaPill}><IconCamera color={C.gray600} /></View>}
    </View>
  );
}

function PendingCard({
  task, staffNames, onToggle, onEdit, onDelete,
}: Readonly<{ task: Task; staffNames: Record<string, string>; onToggle: () => void; onEdit?: () => void; onDelete?: () => void }>) {
  return (
    <Card padding={SP._14} elevation="xs">
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: SP._12 }}>
        <TouchableOpacity style={styles.circle} onPress={onToggle} activeOpacity={0.7} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.taskTitle} numberOfLines={2}>{task.title}</Text>
          {task.assignMode !== "EVERYONE" && (
            <Text style={styles.assignText} numberOfLines={1}>{assignmentText(task, staffNames)}</Text>
          )}
          <TaskBadges task={task} />
        </View>
        {(onEdit || onDelete) && (
          <TouchableOpacity onPress={onEdit} onLongPress={onDelete} hitSlop={8} activeOpacity={0.7}>
            <IconDots color={C.gray400} />
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );
}

// ─── Done Card ───────────────────────────────────────────────────────────────

function DoneCard({ task, onUndo }: Readonly<{ task: Task; onUndo: () => void }>) {
  return (
    <Card padding={SP._14} elevation="xs" style={styles.doneCard}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SP._12 }}>
        <View style={styles.circleDone}><IconCheck color={C.white} size={12} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.taskTitleDone} numberOfLines={2}>{task.title}</Text>
          {!!task.completedBy && <Text style={styles.completedByText} numberOfLines={1}>by {task.completedBy}</Text>}
          {!!task.completionNote && <Text style={styles.completionNote} numberOfLines={2}>“{task.completionNote}”</Text>}
        </View>
        {!!task.proofPhotoUri && <Image source={{ uri: task.proofPhotoUri }} style={styles.proofThumb} />}
        <TouchableOpacity onPress={onUndo} hitSlop={8}><Text style={styles.undoText}>undo</Text></TouchableOpacity>
      </View>
    </Card>
  );
}

