import { useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "./themed";
import type { ThemeColors } from "../constants/theme";
import DatePickerModal, { DatePicker } from "./DatePickerModal";
import {
  canStepForward,
  formatSpan,
  fromIso,
  isCurrentRange,
  isoDate,
  rangeLabel,
  rangeSubLabel,
  resetToNow,
  stepRange,
  validateCycle,
  type BillingCycle,
  type RangePeriod,
  type RangeState,
} from "../lib/range-prefs";

/**
 * The timeline control that sits above every chart: which period is selected,
 * which slice of it is on screen, and the arrows for walking through history.
 *
 * Shared by the Dashboard and Analytics screens so the two can never present
 * time differently, and so a fix to the navigation rules lands in both at once.
 *
 * The forward arrow stops at the present. There is nothing in the future to
 * chart, and stepping into it would show an empty axis that looks like an
 * outage rather than an absence of time having passed.
 */

const PERIODS: { key: RangePeriod; label: string }[] = [
  { key: "Day", label: "Day" },
  { key: "Week", label: "Week" },
  { key: "Month", label: "Month" },
  { key: "Cycle", label: "Bill" },
];

export interface RangeNavigatorProps {
  state: RangeState;
  onChange: (next: RangeState) => void;
  /**
   * Called when the user saves an edited billing window, so the screen can
   * persist it. Omit and the edit applies for this session only.
   */
  onCycleSave?: (cycle: BillingCycle) => void;
}

export default function RangeNavigator({
  state,
  onChange,
  onCycleSave,
}: RangeNavigatorProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [anchorPickerOpen, setAnchorPickerOpen] = useState(false);
  const [cycleEditorOpen, setCycleEditorOpen] = useState(false);

  const now = new Date();
  const forwardEnabled = canStepForward(state, now);
  const atNow = isCurrentRange(state, now);
  const label = rangeLabel(state, now);
  const subLabel = rangeSubLabel(state, now);

  const openCentre = () => {
    if (state.period === "Cycle") setCycleEditorOpen(true);
    else setAnchorPickerOpen(true);
  };

  const handlePickAnchor = (iso: string) => {
    // A month is identified by its 1st: anchoring on the 31st and stepping back
    // would skip any month that has no 31st.
    const picked = fromIso(iso);
    const anchor =
      state.period === "Month"
        ? isoDate(new Date(picked.getFullYear(), picked.getMonth(), 1))
        : iso;
    onChange({ ...state, anchor });
    setAnchorPickerOpen(false);
  };

  const handleSaveCycle = (cycle: BillingCycle) => {
    onChange({ ...state, period: "Cycle", cycle });
    onCycleSave?.(cycle);
    setCycleEditorOpen(false);
  };

  return (
    <View style={styles.wrap}>
      {/* Period chips */}
      <View style={styles.periodSelector}>
        {PERIODS.map((period) => {
          const active = state.period === period.key;
          return (
            <TouchableOpacity
              key={period.key}
              style={[styles.periodBtn, active && styles.periodBtnActive]}
              onPress={() => onChange({ ...state, period: period.key })}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.periodLabel, active && styles.periodLabelActive]}>
                {period.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Timeline: back, the window itself, forward */}
      <View style={styles.timeline}>
        <TouchableOpacity
          style={styles.arrow}
          onPress={() => onChange(stepRange(state, -1))}
          accessibilityRole="button"
          accessibilityLabel="Previous period"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.centre}
          onPress={openCentre}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={
            state.period === "Cycle"
              ? `Billing cycle ${label}. Tap to edit the dates.`
              : `Showing ${label}. Tap to pick a date.`
          }
        >
          <View style={styles.centreRow}>
            <Ionicons
              name={state.period === "Cycle" ? "receipt-outline" : "calendar-outline"}
              size={14}
              color={colors.accent}
            />
            <Text style={styles.centreLabel} numberOfLines={1}>
              {label}
            </Text>
          </View>
          {subLabel && <Text style={styles.centreSub}>{subLabel}</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.arrow, !forwardEnabled && styles.arrowDisabled]}
          onPress={() => onChange(stepRange(state, 1))}
          disabled={!forwardEnabled}
          accessibilityRole="button"
          accessibilityLabel="Next period"
          accessibilityState={{ disabled: !forwardEnabled }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="chevron-forward"
            size={18}
            color={forwardEnabled ? colors.text : colors.inactive}
          />
        </TouchableOpacity>
      </View>

      {/* One tap back to the present, from however far back the user wandered. */}
      {!atNow && state.period !== "Cycle" && (
        <TouchableOpacity
          style={styles.jumpBtn}
          onPress={() => onChange(resetToNow(state, new Date()))}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Ionicons name="refresh" size={12} color={colors.accent} />
          <Text style={styles.jumpText}>Back to now</Text>
        </TouchableOpacity>
      )}

      <DatePickerModal
        visible={anchorPickerOpen}
        value={state.anchor}
        title={
          state.period === "Day"
            ? "Pick a day"
            : state.period === "Week"
              ? "Pick a week (by its last day)"
              : "Pick a month"
        }
        maxDate={isoDate(now)}
        onSelect={handlePickAnchor}
        onDismiss={() => setAnchorPickerOpen(false)}
      />

      <CycleEditor
        visible={cycleEditorOpen}
        cycle={state.cycle}
        onSave={handleSaveCycle}
        onDismiss={() => setCycleEditorOpen(false)}
      />
    </View>
  );
}

// ─── Billing cycle editor ────────────────────────────────────────────────────

interface CycleEditorProps {
  visible: boolean;
  cycle: BillingCycle;
  onSave: (cycle: BillingCycle) => void;
  onDismiss: () => void;
}

/**
 * Two dates, copied off the paper bill. Edits are held locally until Save so a
 * half-entered window — an end date still sitting before its new start — never
 * becomes the live range and never reaches the API.
 */
function CycleEditor({ visible, cycle, onSave, onDismiss }: CycleEditorProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [draft, setDraft] = useState<BillingCycle>(cycle);
  const [picking, setPicking] = useState<"from" | "to" | null>(null);

  const error = validateCycle(draft);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
      // Remount per open so the draft starts from whatever is currently saved
      // rather than from an abandoned edit.
      key={visible ? `${cycle.from}_${cycle.to}` : "closed"}
      onShow={() => setDraft(cycle)}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.editorWrap} onPress={() => {}}>
          {picking !== null ? (
            // Rendered in place of the editor rather than as a nested Modal —
            // a Modal inside a Modal can end up behind its parent on Android.
            <DatePicker
              value={picking === "to" ? draft.to : draft.from}
              title={picking === "to" ? "Cycle ends" : "Cycle starts"}
              // The end may sit in the future — a cycle in progress has not
              // finished yet, and the backend simply stops the chart at today.
              minDate={picking === "to" ? draft.from : undefined}
              onSelect={(date) => {
                setDraft((prev) =>
                  picking === "to" ? { ...prev, to: date } : { ...prev, from: date }
                );
                setPicking(null);
              }}
              onDismiss={() => setPicking(null)}
            />
          ) : (
            <View style={styles.editorCard}>
              <View style={styles.editorIconWrap}>
                <Ionicons name="receipt-outline" size={24} color={colors.accent} />
              </View>

              <Text style={styles.editorTitle}>Billing cycle</Text>
              <Text style={styles.editorMessage}>
                Enter the dates printed on your electricity bill. The arrows then
                step through earlier cycles of the same length.
              </Text>

              <TouchableOpacity
                style={styles.dateRow}
                onPress={() => setPicking("from")}
                activeOpacity={0.7}
              >
                <Text style={styles.dateRowLabel}>Starts</Text>
                <View style={styles.dateRowValueWrap}>
                  <Text style={styles.dateRowValue}>
                    {fromIso(draft.from).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.sub} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dateRow}
                onPress={() => setPicking("to")}
                activeOpacity={0.7}
              >
                <Text style={styles.dateRowLabel}>Ends</Text>
                <View style={styles.dateRowValueWrap}>
                  <Text style={styles.dateRowValue}>
                    {fromIso(draft.to).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.sub} />
                </View>
              </TouchableOpacity>

              {error ? (
                <Text style={styles.editorError}>{error}</Text>
              ) : (
                <Text style={styles.editorPreview}>
                  {formatSpan(fromIso(draft.from), fromIso(draft.to))}
                </Text>
              )}

              <View style={styles.editorActions}>
                <TouchableOpacity
                  style={[styles.editorBtn, styles.editorBtnCancel]}
                  onPress={onDismiss}
                  activeOpacity={0.8}
                >
                  <Text style={styles.editorBtnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.editorBtn,
                    styles.editorBtnSave,
                    error !== null && styles.editorBtnDisabled,
                  ]}
                  onPress={() => onSave(draft)}
                  disabled={error !== null}
                  activeOpacity={0.8}
                >
                  <Text style={styles.editorBtnSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    wrap: {
      gap: 8,
    },
    periodSelector: {
      flexDirection: "row",
      backgroundColor: colors.card,
      borderRadius: 10,
      padding: 3,
      gap: 2,
    },
    periodBtn: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: 8,
      alignItems: "center",
    },
    periodBtnActive: {
      backgroundColor: colors.accent,
    },
    periodLabel: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      fontWeight: "700",
    },
    periodLabelActive: {
      color: colors.bg,
    },
    timeline: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 4,
      paddingVertical: 4,
    },
    arrow: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    arrowDisabled: {
      opacity: 0.4,
    },
    centre: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6,
    },
    centreRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    centreLabel: {
      color: colors.text,
      fontSize: 13 * fontScale,
      fontWeight: "700",
      flexShrink: 1,
    },
    centreSub: {
      color: colors.sub,
      fontSize: 11 * fontScale,
      marginTop: 1,
    },
    jumpBtn: {
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    jumpText: {
      color: colors.accent,
      fontSize: 11 * fontScale,
      fontWeight: "700",
    },

    // ── Cycle editor ──
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 28,
    },
    editorWrap: {
      width: "100%",
      maxWidth: 360,
    },
    editorCard: {
      width: "100%",
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 22,
      alignItems: "center",
    },
    editorIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    editorTitle: {
      color: colors.text,
      fontSize: 18 * fontScale,
      fontWeight: "700",
      marginBottom: 6,
    },
    editorMessage: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      lineHeight: 19 * fontScale,
      textAlign: "center",
      marginBottom: 16,
    },
    dateRow: {
      alignSelf: "stretch",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 8,
    },
    dateRowLabel: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      fontWeight: "600",
    },
    dateRowValueWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    dateRowValue: {
      color: colors.text,
      fontSize: 14 * fontScale,
      fontWeight: "700",
    },
    editorPreview: {
      color: colors.accent,
      fontSize: 12 * fontScale,
      fontWeight: "700",
      marginTop: 4,
    },
    editorError: {
      color: colors.red,
      fontSize: 12 * fontScale,
      fontWeight: "600",
      textAlign: "center",
      marginTop: 4,
    },
    editorActions: {
      flexDirection: "row",
      gap: 12,
      marginTop: 18,
      alignSelf: "stretch",
    },
    editorBtn: {
      flex: 1,
      height: 46,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    editorBtnCancel: {
      borderWidth: 1,
      borderColor: colors.border,
    },
    editorBtnCancelText: {
      color: colors.sub,
      fontSize: 15 * fontScale,
      fontWeight: "700",
    },
    editorBtnSave: {
      backgroundColor: colors.accent,
    },
    editorBtnDisabled: {
      opacity: 0.5,
    },
    editorBtnSaveText: {
      color: colors.bg,
      fontSize: 15 * fontScale,
      fontWeight: "700",
    },
  });
}
