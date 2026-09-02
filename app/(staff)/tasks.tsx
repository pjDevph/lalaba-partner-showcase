// app/(staff)/tasks.tsx

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { showAlert } from "../../src/lib/dialog";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { gqlMyTasks, gqlUpdateTask, gqlCompleteTask, type GqlTask } from "../../src/services/graphql/tasks";
import { useAuthStore } from "../../src/stores/authStore";
import { useNotificationStore } from "../../src/stores/notificationStore";
import { useStaffTasksStore } from "../../src/stores/staffTasksStore";
import { C, RADIUS, SP } from "../../src/theme/tokens";
import { Card } from "../../src/components/ui";
import { Ionicons } from "@expo/vector-icons";
import {
  type Task,
  type Frequency,
  FREQ_OPTIONS,
  CATEGORY_META,
  PRIORITY_META,
  shouldReset,
  getResetCountdown,
  freqLabel,
  frequencyText,
  formatDueTime,
  taskVisibleToStaff,
} from "../../src/features/tasks/taskHelpers";
import { toUserMessage } from "../../src/utils/userError";

// ─── Constants ─────────────────────────────────────────────────────────────────

const MAX_W = 760;
const H_PAD = SP._24;

// ─── Name helpers ──────────────────────────────────────────────────────────────
// Never show raw email in the UI — use display name or "Staff" as fallback.

function cleanName(raw: string | null | undefined): string {
  if (!raw?.trim()) return "Staff";
  const trimmed = raw.trim();
  // If it has a space or no @ it's a display name — use it directly
  if (!trimmed.includes("@")) return trimmed;
  // It's an email address — extract the local part
  const local = trimmed.split("@")[0] ?? "";
  return local || "Staff";
}

function formatCompletedAt(date: Date | undefined): string {
  if (!date) return "";
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return isToday ? `Today, ${time}` : `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

function mapGqlTask(t: GqlTask): Task {
  let priority: Task["priority"] = "NORMAL";
  if (t.priority === "high")        priority = "URGENT";
  else if (t.priority === "medium") priority = "IMPORTANT";

  const rawCat = t.category?.toUpperCase();
  const VALID_CATS = ["CLEANING", "INVENTORY", "MAINTENANCE", "OPENING", "CLOSING", "CUSTOMER_SERVICE", "OTHER"];
  const category = (VALID_CATS.includes(rawCat ?? "") ? rawCat : "OTHER") as Task["category"];

  const unassignedMode: Task["assignMode"] = t.isVisibleToStaff ? "EVERYONE" : "OWNER";
  const assignMode: Task["assignMode"] = t.assignedToId ? "SPECIFIC" : unassignedMode;

  return {
    id: t._id,
    title: t.title,
    description: t.description ?? "",
    category,
    priority,
    frequency: "ONCE",
    assignMode,
    assignedStaffIds: t.assignedToId ? [t.assignedToId] : undefined,
    isCompleted: t.isCompleted,
    completedBy: t.completedBy ? cleanName(t.completedBy) : null,
    completedAt: t.completedAt ? new Date(t.completedAt) : undefined,
    completionNote: t.noteText ?? null,
    proofPhotoUri: t.photoUri ?? null,
    merchantId: t.uid,
    branchId: t.branchId ?? null,
    order: 0,
    dueTime: t.dueDate ? new Date(t.dueDate).toISOString().slice(11, 16) : null,
    createdAt: t.createdAt ? new Date(t.createdAt) : undefined,
  };
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconChevronLeft({ color = C.gray700, size = 24 }: Readonly<{ color?: string; size?: number }>) {
  return <Ionicons name="chevron-back" size={size} color={color} />;
}
function IconCheck({ color = C.white, size = 12 }: Readonly<{ color?: string; size?: number }>) {
  return <Ionicons name="checkmark" size={size} color={color} />;
}
function IconCheckCircle({ color = C.success500 }: Readonly<{ color?: string }>) {
  return <Ionicons name="checkmark" size={13} color={color} />;
}
function IconCamera({ color = C.gray500, size = 14 }: Readonly<{ color?: string; size?: number }>) {
  return <Ionicons name="camera-outline" size={size} color={color} />;
}
function IconClock({ color = C.warning700, size = 11 }: Readonly<{ color?: string; size?: number }>) {
  return <Ionicons name="time-outline" size={size} color={color} />;
}
function IconUser({ color = C.gray400, size = 11 }: Readonly<{ color?: string; size?: number }>) {
  return <Ionicons name="person-outline" size={size} color={color} />;
}
function IconX({ color = C.gray600, size = 18 }: Readonly<{ color?: string; size?: number }>) {
  return <Ionicons name="close" size={size} color={color} />;
}

// ─── Photo proof picker ────────────────────────────────────────────────────────

async function pickProofPhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== "granted") {
    showAlert("Permission required", "Allow photo access to attach proof.");
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.6,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0].uri;
}

// ─── Assign label ─────────────────────────────────────────────────────────────

function assignLabel(task: Task): string {
  if (task.assignMode === "EVERYONE") return "All staff";
  if (task.assignMode === "SPECIFIC") return "Assigned to you";
  return "";
}

// ─── Badges ────────────────────────────────────────────────────────────────────

function TaskBadges({ task }: Readonly<{ task: Task }>) {
  const cat = CATEGORY_META[task.category];
  const pri = PRIORITY_META[task.priority];
  const assign = assignLabel(task);
  return (
    <View style={s.metaRow}>
      <View style={[s.badge, { backgroundColor: cat.bg }]}>
        <Text style={[s.badgeText, { color: cat.fg }]}>{cat.label}</Text>
      </View>
      {task.priority !== "NORMAL" && (
        <View style={[s.badge, { backgroundColor: pri.bg }]}>
          <Text style={[s.badgeText, { color: pri.fg }]}>{pri.label}</Text>
        </View>
      )}
      <View style={s.metaPill}>
        <Text style={s.metaPillText}>{frequencyText(task)}</Text>
      </View>
      {!!task.dueTime && (
        <View style={s.dueChip}>
          <IconClock />
          <Text style={s.dueChipText}>Due {formatDueTime(task.dueTime)}</Text>
        </View>
      )}
      {!!assign && (
        <View style={s.assignChip}>
          <IconUser />
          <Text style={s.assignChipText}>{assign}</Text>
        </View>
      )}
      {task.requirePhoto && (
        <View style={s.reqPill}>
          <IconCamera color={C.gray600} size={11} />
          <Text style={s.reqText}>Photo required</Text>
        </View>
      )}
    </View>
  );
}

// ─── Summary row ──────────────────────────────────────────────────────────────

function SummaryRow({ pending, done }: Readonly<{ pending: number; done: number }>) {
  if (pending === 0 && done === 0) return null;
  return (
    <View style={s.summaryRow}>
      <Text style={s.summaryLabel}>Today</Text>
      <View style={s.summaryDot} />
      {pending > 0 && <Text style={s.summaryPending}>{pending} pending</Text>}
      {pending > 0 && done > 0 && <Text style={s.summarySep}>·</Text>}
      {done > 0 && <Text style={s.summaryDone}>{done} done</Text>}
    </View>
  );
}

// ─── Proof Modal ──────────────────────────────────────────────────────────────

function ProofModal({
  task,
  onClose,
  onReset,
  resetting,
}: Readonly<{
  task: Task | null;
  onClose: () => void;
  onReset: (task: Task) => void;
  resetting: boolean;
}>) {
  const [confirmReset, setConfirmReset] = useState(false);
  const screenW = Dimensions.get("window").width;
  const modalW  = Math.min(screenW - 48, 520);

  useEffect(() => {
    if (!task) setConfirmReset(false);
  }, [task]);

  if (!task) return null;

  const cat = CATEGORY_META[task.category];
  const completedTimeStr = formatCompletedAt(task.completedAt);

  return (
    <Modal supportedOrientations={["portrait", "landscape"]} visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={pm.backdrop}>
        <View style={[pm.card, { width: modalW }]}>
          {/* Header */}
          <View style={pm.header}>
            <View style={{ flex: 1 }}>
              <Text style={pm.title}>Task Proof</Text>
              <View style={pm.headerMeta}>
                <View style={[pm.catBadge, { backgroundColor: cat.bg }]}>
                  <Text style={[pm.catText, { color: cat.fg }]}>{cat.label}</Text>
                </View>
                <Text style={pm.freqText}>{frequencyText(task)}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={pm.closeBtn} activeOpacity={0.7}>
              <IconX />
            </TouchableOpacity>
          </View>

          {/* Proof photo */}
          {task.proofPhotoUri ? (
            <Image source={{ uri: task.proofPhotoUri }} style={pm.photo} resizeMode="cover" />
          ) : (
            <View style={pm.noPhoto}>
              <IconCamera color={C.gray300} size={32} />
              <Text style={pm.noPhotoText}>No proof photo attached</Text>
            </View>
          )}

          {/* Details */}
          <View style={pm.details}>
            <View style={pm.detailRow}>
              <Text style={pm.detailLabel}>Task</Text>
              <Text style={pm.detailValue} numberOfLines={2}>{task.title}</Text>
            </View>
            {!!task.completedBy && (
              <View style={pm.detailRow}>
                <Text style={pm.detailLabel}>Completed by</Text>
                <Text style={pm.detailValue}>{task.completedBy}</Text>
              </View>
            )}
            {!!completedTimeStr && (
              <View style={pm.detailRow}>
                <Text style={pm.detailLabel}>Completed at</Text>
                <Text style={pm.detailValue}>{completedTimeStr}</Text>
              </View>
            )}
            {!!task.completionNote && (
              <View style={pm.detailRow}>
                <Text style={pm.detailLabel}>Note</Text>
                <Text style={[pm.detailValue, { fontStyle: "italic" }]} numberOfLines={4}>
                  &quot;{task.completionNote}&quot;
                </Text>
              </View>
            )}
          </View>

          {/* Actions */}
          {confirmReset ? (
            <View style={pm.confirmBox}>
              <Text style={pm.confirmTitle}>Reset this task?</Text>
              <Text style={pm.confirmSub}>The staff will need to complete it again.</Text>
              <View style={pm.confirmActions}>
                <TouchableOpacity style={pm.cancelBtn} onPress={() => setConfirmReset(false)} activeOpacity={0.8}>
                  <Text style={pm.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={pm.resetConfirmBtn}
                  onPress={() => { setConfirmReset(false); onReset(task); }}
                  disabled={resetting}
                  activeOpacity={0.85}
                >
                  {resetting
                    ? <ActivityIndicator size="small" color={C.white} />
                    : <Text style={pm.resetConfirmText}>Reset task</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={pm.actions}>
              <TouchableOpacity style={pm.closeActionBtn} onPress={onClose} activeOpacity={0.8}>
                <Text style={pm.closeActionText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity style={pm.resetBtn} onPress={() => setConfirmReset(true)} activeOpacity={0.85}>
                <Text style={pm.resetText}>Reset task</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TASK_PAGE = 20;

export default function StaffTasksScreen() {
  const { user, activeBranchId, activeBranchRole } = useAuthStore((s2) => ({
    user: s2.user, activeBranchId: s2.activeBranchId, activeBranchRole: s2.activeBranchRole,
  }));

  const [activeFilter, setActiveFilter] = useState<"ALL" | Frequency>("ALL");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [noteTask, setNoteTask] = useState<Task | null>(null);
  const [notePhotoUri, setNotePhotoUri] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const [proofTask, setProofTask] = useState<Task | null>(null);
  const [resetting, setResetting] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const raw = await gqlMyTasks({ limit: 200 });
      const mapped = raw.map(mapGqlTask);
      const toReset = mapped.filter((t) => t.isCompleted && shouldReset(t));
      if (toReset.length > 0) {
        await Promise.all(toReset.map((t) => gqlUpdateTask(t.id, { isCompleted: false })));
        const updated = await gqlMyTasks({ limit: 200 });
        setTasks(updated.map(mapGqlTask));
      } else {
        setTasks(mapped);
      }
    } catch (err) {
      console.warn("Staff tasks fetch:", err);
      setTasks([]);
      useNotificationStore.getState().push({ type: "error", title: "Failed to load", message: "Could not load tasks." });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void fetchTasks(); }, [fetchTasks]);
  const onRefresh = useCallback(() => { setRefreshing(true); void fetchTasks(); }, [fetchTasks]);

  const patchTask = async (task: Task, patch: Record<string, unknown>) => {
    setBusyId(task.id);
    try {
      let updated: GqlTask;
      if (patch.isCompleted === true) {
        updated = await gqlCompleteTask(
          task.id,
          (patch.completionNote as string) ?? undefined,
          (patch.proofPhotoUri as string) ?? undefined,
        );
      } else {
        updated = await gqlUpdateTask(task.id, { isCompleted: false });
      }
      setTasks((prev) => prev.map((t) => (t.id === task.id ? mapGqlTask(updated) : t)));
      useNotificationStore.getState().push({
        type: "success",
        title: patch.isCompleted === true ? "Task completed" : "Task reopened",
        message: task.title,
      });
    } catch (err: unknown) {
      useNotificationStore.getState().push({
        type: "error", title: "Could not update task", message: toUserMessage(err, "Try again."),
      });
    } finally {
      setBusyId(null);
    }
  };

  // Always use displayName; fall back to "Staff" — never expose raw email.
  const by = () => user?.displayName?.trim() || "Staff"; // NOSONAR — intentional: catches empty string from .trim()

  const finishComplete = (task: Task, photoUri: string | null, note: string | null) =>
    patchTask(task, {
      isCompleted: true,
      completedBy: by(),
      ...(photoUri ? { proofPhotoUri: photoUri } : {}),
      ...(note ? { completionNote: note } : {}),
    });

  const startComplete = async (task: Task, forcePhoto = false) => {
    let photoUri = task.proofPhotoUri ?? null;
    if ((task.requirePhoto || forcePhoto) && !photoUri) {
      photoUri = await pickProofPhoto();
      if (!photoUri) return;
    }
    if (task.requireNote) {
      setNoteTask(task); setNotePhotoUri(photoUri); setNoteText("");
      return;
    }
    await finishComplete(task, photoUri, null);
  };

  const submitNote = async () => {
    if (!noteTask) return;
    if (!noteText.trim()) { showAlert("Note required", "Add a short note to complete this task."); return; }
    const t = noteTask;
    const uri = notePhotoUri;
    setNoteTask(null);
    await finishComplete(t, uri, noteText.trim());
  };

  const undoTask = async (task: Task) => {
    setResetting(true);
    await patchTask(task, { isCompleted: false, completedBy: null, proofPhotoUri: null, completionNote: null });
    setResetting(false);
    setProofTask(null);
  };

  const [visiblePending, setVisiblePending] = useState(TASK_PAGE);
  const [visibleDone,    setVisibleDone]    = useState(TASK_PAGE);

  useEffect(() => { setVisiblePending(TASK_PAGE); setVisibleDone(TASK_PAGE); }, [activeFilter]);

  const myTasks = tasks.filter((t) => taskVisibleToStaff(t, { uid: user?.uid, branchId: activeBranchId, branchRole: activeBranchRole }));
  const visible = activeFilter === "ALL" ? myTasks : myTasks.filter((t) => t.frequency === activeFilter);
  const pending = visible.filter((t) => !t.isCompleted);
  const done    = visible.filter((t) => t.isCompleted);
  const pendingTotal = myTasks.filter((t) => !t.isCompleted).length;

  useEffect(() => { useStaffTasksStore.setState({ pendingCount: pendingTotal }); }, [pendingTotal]);

  const FILTERS: { key: "ALL" | Frequency; label: string }[] = [
    { key: "ALL", label: "All" }, ...FREQ_OPTIONS.map((f) => ({ key: f.value, label: f.label })),
  ];
  const countdown = activeFilter !== "ALL" && activeFilter !== "ONCE" ? getResetCountdown(activeFilter) : "";

  let body: React.ReactNode;
  if (loading) {
    body = <View style={s.loadingBox}><ActivityIndicator color={C.brand500} size="large" /></View>;
  } else if (visible.length === 0) {
    body = (
      <View style={s.emptyBox}>
        <Text style={s.emptyTitle}>No tasks here</Text>
        <Text style={s.emptyDesc}>Tasks your manager assigns will appear here.</Text>
      </View>
    );
  } else {
    body = (
      <>
        <SummaryRow pending={pending.length} done={done.length} />
        {pending.length > 0 && (
          <View style={{ marginBottom: SP._16 }}>
            <Text style={s.sectionPending}>To do ({pending.length})</Text>
            <View style={{ gap: SP._8 }}>
              {pending.slice(0, visiblePending).map((task) => (
                <PendingCard key={task.id} task={task} busy={busyId === task.id}
                  onComplete={() => startComplete(task)} onAttachPhoto={() => startComplete(task, true)} />
              ))}
            </View>
            {visiblePending < pending.length && (
              <TouchableOpacity style={s.loadMoreBtn} onPress={() => setVisiblePending(v => v + TASK_PAGE)} activeOpacity={0.75}>
                <Text style={s.loadMoreText}>Show {Math.min(TASK_PAGE, pending.length - visiblePending)} more</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        {done.length > 0 && (
          <View>
            <View style={s.sectionDoneRow}>
              <Text style={s.sectionDone}>Done ({done.length})</Text>
              <IconCheckCircle color={C.success700} />
            </View>
            <View style={{ gap: SP._8 }}>
              {done.slice(0, visibleDone).map((task) => (
                <DoneCard key={task.id} task={task} busy={busyId === task.id}
                  onViewProof={() => setProofTask(task)} />
              ))}
            </View>
            {visibleDone < done.length && (
              <TouchableOpacity style={s.loadMoreBtn} onPress={() => setVisibleDone(v => v + TASK_PAGE)} activeOpacity={0.75}>
                <Text style={s.loadMoreText}>Show {Math.min(TASK_PAGE, done.length - visibleDone)} more</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      {/* ── Header ── */}
      <View style={s.header}>
        <View style={[s.centered, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
          <View style={s.headerLeft}>
            <TouchableOpacity
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/(staff)/profile"))}
              hitSlop={10} style={s.backBtn} activeOpacity={0.7}>
              <IconChevronLeft />
            </TouchableOpacity>
            <Text style={s.title}>Tasks</Text>
          </View>
          {pendingTotal > 0 && (
            <View style={s.headerChip}>
              <Text style={s.headerChipText}>{pendingTotal} pending</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Filter chips ── */}
      <View style={s.filterBar}>
        <View style={s.centered}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterContent}>
            {FILTERS.map((f) => {
              const active = activeFilter === f.key;
              return (
                <TouchableOpacity key={f.key} style={[s.filterChip, active && s.filterChipActive]}
                  onPress={() => setActiveFilter(f.key)} activeOpacity={0.8}>
                  <Text style={[s.filterChipText, active && s.filterChipTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {!!countdown && <Text style={s.countdown}>{freqLabel(activeFilter as Frequency)} tasks reset in {countdown}</Text>}
        </View>
      </View>

      {/* ── Task list ── */}
      <ScrollView
        style={[s.scrollArea, s.centered]}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brand500} />}
      >
        {body}
      </ScrollView>

      {/* ── Proof modal ── */}
      <ProofModal
        task={proofTask}
        onClose={() => setProofTask(null)}
        onReset={undoTask}
        resetting={resetting}
      />

      {/* ── Completion-note modal ── */}
      <Modal supportedOrientations={["portrait", "landscape"]} visible={!!noteTask} transparent animationType="fade" onRequestClose={() => setNoteTask(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={s.noteBackdrop}>
          <View style={s.noteCard}>
            <Text style={s.noteTitle}>Add a completion note</Text>
            <Text style={s.noteSub} numberOfLines={2}>{noteTask?.title}</Text>
            <TextInput
              style={s.noteInput}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="What did you do? Any issues?"
              placeholderTextColor={C.gray400}
              multiline
              autoFocus
              maxLength={500}
            />
            <View style={s.noteActions}>
              <TouchableOpacity style={s.noteCancel} onPress={() => setNoteTask(null)} activeOpacity={0.8}>
                <Text style={s.noteCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.noteSubmit} onPress={submitNote} activeOpacity={0.85}>
                <Text style={s.noteSubmitText}>Complete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Pending card ──────────────────────────────────────────────────────────────

function PendingCard({
  task, busy, onComplete, onAttachPhoto,
}: Readonly<{ task: Task; busy: boolean; onComplete: () => void; onAttachPhoto: () => void }>) {
  return (
    <Card padding={SP._14} elevation="xs">
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: SP._12 }}>
        <TouchableOpacity style={s.circle} onPress={onComplete} disabled={busy} activeOpacity={0.7}>
          {busy && <ActivityIndicator size="small" color={C.brand500} />}
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.taskTitle} numberOfLines={2}>{task.title}</Text>
          {!!task.description && <Text style={s.taskDesc} numberOfLines={2}>{task.description}</Text>}
          <TaskBadges task={task} />
        </View>
        <TouchableOpacity style={s.cameraBtn} onPress={onAttachPhoto} disabled={busy} hitSlop={8} activeOpacity={0.7}>
          <IconCamera />
        </TouchableOpacity>
      </View>
    </Card>
  );
}

// ─── Done card ─────────────────────────────────────────────────────────────────

function DoneCard({
  task, busy, onViewProof,
}: Readonly<{ task: Task; busy: boolean; onViewProof: () => void }>) {
  const completedTimeStr = formatCompletedAt(task.completedAt);
  return (
    <Card padding={SP._14} elevation="xs" style={s.doneCard}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: SP._12 }}>
        <View style={[s.circleDone, { marginTop: 1 }]}>
          <IconCheck color={C.white} size={12} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.taskTitleDone} numberOfLines={2}>{task.title}</Text>
          {!!task.completedBy && (
            <Text style={s.completedBy}>Completed by {task.completedBy}</Text>
          )}
          {!!completedTimeStr && (
            <Text style={s.completedTime}>{completedTimeStr}</Text>
          )}
          <View style={s.doneActions}>
            <TouchableOpacity onPress={onViewProof} disabled={busy} activeOpacity={0.8} style={s.proofBtn}>
              <IconCamera color={task.proofPhotoUri ? C.brand500 : C.gray400} size={12} />
              <Text style={task.proofPhotoUri ? s.proofBtnText : s.proofBtnTextMuted}>
                {task.proofPhotoUri ? "View proof" : "Add photo"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {task.proofPhotoUri && (
          <TouchableOpacity onPress={onViewProof} disabled={busy} activeOpacity={0.8}>
            <Image source={{ uri: task.proofPhotoUri }} style={s.proofThumb} />
          </TouchableOpacity>
        )}
      </View>
    </Card>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.white },
  centered: { maxWidth: MAX_W, width: "100%", alignSelf: "center", paddingHorizontal: H_PAD },

  // ── Header ──
  header: { backgroundColor: C.white, paddingVertical: SP._16, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: SP._8 },
  backBtn:    { marginLeft: -SP._4, padding: SP._2 },
  title:      { fontSize: 20, fontWeight: "800", color: C.gray900 },
  headerChip: { backgroundColor: C.warning500, borderRadius: RADIUS.full, paddingHorizontal: SP._12, paddingVertical: SP._6 },
  headerChipText: { fontSize: 12, fontWeight: "700", color: C.white },

  // ── Filters ──
  filterBar: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100, paddingTop: SP._10, paddingBottom: SP._10 },
  filterContent: { gap: SP._6 },
  filterChip:           { paddingHorizontal: SP._14, paddingVertical: SP._6, borderRadius: RADIUS.full, backgroundColor: C.gray50, borderWidth: 1, borderColor: C.gray200 },
  filterChipActive:     { backgroundColor: C.brand500, borderColor: C.brand500 },
  filterChipText:       { fontSize: 12, fontWeight: "500", color: C.gray500 },
  filterChipTextActive: { color: C.white, fontWeight: "700" },
  countdown: { fontSize: 10, color: C.gray500, textAlign: "center", marginTop: SP._6 },

  // ── Scroll / content ──
  scrollArea: { flex: 1 },
  content: { paddingTop: SP._14, paddingBottom: SP._32 },

  // ── Summary row ──
  summaryRow: { flexDirection: "row", alignItems: "center", gap: SP._6, marginBottom: SP._14, paddingVertical: SP._8, paddingHorizontal: SP._12, backgroundColor: C.gray50, borderRadius: RADIUS.md },
  summaryLabel:   { fontSize: 11, fontWeight: "700", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.5 },
  summaryDot:     { width: 3, height: 3, borderRadius: 2, backgroundColor: C.gray300 },
  summaryPending: { fontSize: 12, fontWeight: "700", color: C.warning600 },
  summarySep:     { fontSize: 12, color: C.gray400 },
  summaryDone:    { fontSize: 12, fontWeight: "700", color: C.success700 },

  // ── Loading / empty ──
  loadingBox: { height: 220, alignItems: "center", justifyContent: "center" },
  emptyBox:   { alignItems: "center", paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: C.gray900, marginBottom: SP._8 },
  emptyDesc:  { fontSize: 13, color: C.gray500, textAlign: "center", maxWidth: 280 },

  // ── Load more ──
  loadMoreBtn:  { alignItems: "center", paddingVertical: SP._12, marginTop: SP._4 },
  loadMoreText: { fontSize: 13, fontWeight: "600", color: C.brand500 },

  // ── Section headers ──
  sectionPending: { fontSize: 10, fontWeight: "700", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: SP._8 },
  sectionDoneRow: { flexDirection: "row", alignItems: "center", gap: SP._6, marginBottom: SP._8 },
  sectionDone:    { fontSize: 10, fontWeight: "700", color: C.success700, textTransform: "uppercase", letterSpacing: 0.4 },

  // ── Circles ──
  circle:     { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: C.gray300, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  circleDone: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.success500, flexShrink: 0, alignItems: "center", justifyContent: "center" },

  // ── Cards ──
  doneCard: { backgroundColor: C.gray50 },

  // ── Task text ──
  taskTitle:     { fontSize: 14, fontWeight: "600", color: C.gray900, lineHeight: 19 },
  taskDesc:      { fontSize: 12, color: C.gray500, marginTop: 2, lineHeight: 17 },
  taskTitleDone: { fontSize: 14, color: C.gray500, textDecorationLine: "line-through", lineHeight: 19 },
  completedBy:   { fontSize: 12, color: C.gray600, marginTop: 3, fontWeight: "500" },
  completedTime: { fontSize: 11, color: C.gray400, marginTop: 1 },

  // ── Done card actions ──
  doneActions:       { flexDirection: "row", alignItems: "center", marginTop: SP._8 },
  proofBtn:          { flexDirection: "row", alignItems: "center", gap: 4 },
  proofBtnText:      { fontSize: 12, fontWeight: "600", color: C.brand500 },
  proofBtnTextMuted: { fontSize: 12, fontWeight: "500", color: C.gray400 },

  // ── Meta badges ──
  metaRow:        { flexDirection: "row", gap: SP._6, marginTop: SP._8, flexWrap: "wrap", alignItems: "center" },
  badge:          { borderRadius: RADIUS.full, paddingHorizontal: SP._8, paddingVertical: 2 },
  badgeText:      { fontSize: 11, fontWeight: "700" },
  metaPill:       { backgroundColor: C.gray100, borderRadius: RADIUS.full, paddingHorizontal: SP._8, paddingVertical: 2 },
  metaPillText:   { fontSize: 11, fontWeight: "600", color: C.gray600 },
  dueChip:        { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.warning100, borderRadius: RADIUS.full, paddingHorizontal: SP._8, paddingVertical: 3 },
  dueChipText:    { fontSize: 11, fontWeight: "700", color: C.warning700 },
  assignChip:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.gray100, borderRadius: RADIUS.full, paddingHorizontal: SP._8, paddingVertical: 3 },
  assignChipText: { fontSize: 11, fontWeight: "600", color: C.gray600 },
  reqPill:        { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.brand50, borderRadius: RADIUS.full, paddingHorizontal: SP._8, paddingVertical: 2 },
  reqText:        { fontSize: 11, fontWeight: "600", color: C.brand700 },

  // ── Camera / proof ──
  cameraBtn:  { width: 34, height: 34, borderRadius: 17, backgroundColor: C.gray100, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  proofThumb: { width: 48, height: 48, borderRadius: RADIUS.md, backgroundColor: C.gray200, flexShrink: 0 },

  // ── Note modal ──
  noteBackdrop:   { flex: 1, backgroundColor: "rgba(15,40,60,0.45)", alignItems: "center", justifyContent: "center", padding: SP._24 },
  noteCard:       { width: "100%", maxWidth: 380, backgroundColor: C.white, borderRadius: RADIUS.lg, padding: SP._20 },
  noteTitle:      { fontSize: 16, fontWeight: "800", color: C.gray900 },
  noteSub:        { fontSize: 13, color: C.gray500, marginTop: 2 },
  noteInput:      { marginTop: SP._12, height: 90, backgroundColor: C.gray50, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.gray200, padding: SP._12, fontSize: 14, color: C.gray900, textAlignVertical: "top" },
  noteActions:    { flexDirection: "row", gap: SP._12, marginTop: SP._16 },
  noteCancel:     { flex: 1, height: 46, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: C.gray100 },
  noteCancelText: { fontSize: 14, fontWeight: "700", color: C.gray600 },
  noteSubmit:     { flex: 2, height: 46, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: C.success500 },
  noteSubmitText: { fontSize: 14, fontWeight: "800", color: C.white },
});

// ─── Proof modal styles ────────────────────────────────────────────────────────

const pm = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,40,60,0.45)", alignItems: "center", justifyContent: "center", padding: SP._24 },
  card:     { backgroundColor: C.white, borderRadius: 20, overflow: "hidden" },

  // Header
  header:     { flexDirection: "row", alignItems: "flex-start", padding: SP._20, paddingBottom: SP._14, gap: SP._12 },
  title:      { fontSize: 16, fontWeight: "800", color: C.gray900 },
  headerMeta: { flexDirection: "row", alignItems: "center", gap: SP._6, marginTop: 4 },
  catBadge:   { borderRadius: RADIUS.full, paddingHorizontal: SP._8, paddingVertical: 2 },
  catText:    { fontSize: 11, fontWeight: "700" },
  freqText:   { fontSize: 11, color: C.gray500 },
  closeBtn:   { width: 32, height: 32, borderRadius: 16, backgroundColor: C.gray100, alignItems: "center", justifyContent: "center", flexShrink: 0 },

  // Photo
  photo:       { width: "100%", height: 220 },
  noPhoto:     { height: 140, backgroundColor: C.gray50, alignItems: "center", justifyContent: "center", gap: SP._8 },
  noPhotoText: { fontSize: 13, color: C.gray400 },

  // Details
  details:      { padding: SP._20, paddingTop: SP._16, gap: SP._12 },
  detailRow:    { flexDirection: "row", alignItems: "flex-start", gap: SP._12 },
  detailLabel:  { fontSize: 12, fontWeight: "700", color: C.gray500, width: 100, flexShrink: 0 },
  detailValue:  { flex: 1, fontSize: 13, fontWeight: "600", color: C.gray900 },

  // Normal actions
  actions:        { flexDirection: "row", gap: SP._12, padding: SP._20, paddingTop: 0 },
  closeActionBtn: { flex: 1, height: 46, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: C.gray100 },
  closeActionText:{ fontSize: 14, fontWeight: "700", color: C.gray600 },
  resetBtn:       { flex: 1, height: 46, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: C.error100, borderWidth: 1, borderColor: C.error100 },
  resetText:      { fontSize: 14, fontWeight: "700", color: C.error700 },

  // Confirm reset
  confirmBox:        { margin: SP._20, marginTop: 0, padding: SP._16, backgroundColor: C.error100, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.error100 },
  confirmTitle:      { fontSize: 14, fontWeight: "800", color: C.error700 },
  confirmSub:        { fontSize: 12, color: C.error700, marginTop: 3 },
  confirmActions:    { flexDirection: "row", gap: SP._10, marginTop: SP._14 },
  cancelBtn:         { flex: 1, height: 40, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200 },
  cancelText:        { fontSize: 13, fontWeight: "700", color: C.gray600 },
  resetConfirmBtn:   { flex: 1, height: 40, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: C.error700 },
  resetConfirmText:  { fontSize: 13, fontWeight: "800", color: C.white },
});
