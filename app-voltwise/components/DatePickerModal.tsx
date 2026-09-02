import { useMemo, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "./themed";
import type { ThemeColors } from "../constants/theme";
import { fromIso, isoDate } from "../lib/range-prefs";

/**
 * A month-grid date picker.
 *
 * Written rather than pulled in: the app has no date-picker dependency, and the
 * platform pickers look and behave differently on Android, iOS and web — which
 * this app ships to all three. A grid built from the same theme tokens as
 * everything else is one appearance everywhere, and it lets days outside the
 * allowed window be greyed out rather than merely rejected after the fact.
 */

export interface DatePickerProps {
  /** Currently selected date, YYYY-MM-DD. */
  value: string;
  title: string;
  /** Earliest selectable date, YYYY-MM-DD. Optional. */
  minDate?: string;
  /** Latest selectable date, YYYY-MM-DD. Usually today — there is no data ahead. */
  maxDate?: string;
  onSelect: (date: string) => void;
  onDismiss: () => void;
}

export interface DatePickerModalProps extends DatePickerProps {
  visible: boolean;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** Every cell of the month grid: leading blanks, then each day. */
function buildMonthGrid(month: Date): (Date | null)[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();

  return [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: dayCount }, (_, i) => new Date(year, monthIndex, i + 1)),
  ];
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * The calendar itself, without a Modal around it.
 *
 * Exported separately because the billing-cycle editor is already inside a
 * Modal, and a Modal nested in a Modal is unreliable on Android — it can render
 * behind its parent. That screen swaps this in place of its own body instead.
 */
export function DatePicker({
  value,
  title,
  minDate,
  maxDate,
  onSelect,
  onDismiss,
}: DatePickerProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const selected = useMemo(() => fromIso(value), [value]);
  // The month on display, which the user pages through independently of what is
  // selected. Re-keyed on `value` below so reopening starts at the selection.
  const [viewMonth, setViewMonth] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1)
  );

  const min = minDate ? fromIso(minDate) : null;
  const max = maxDate ? fromIso(maxDate) : null;
  const today = new Date();

  const cells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  const outOfRange = (date: Date): boolean =>
    (min !== null && date < min) || (max !== null && date > max);

  // Paging is blocked once every day of the neighbouring month would be
  // unselectable — an empty grid is a dead end, not a destination.
  const prevMonthEnd = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 0);
  const nextMonthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
  const canGoPrev = min === null || prevMonthEnd >= min;
  const canGoNext = max === null || nextMonthStart <= max;

  const stepMonth = (direction: -1 | 1) => {
    setViewMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + direction, 1)
    );
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.monthBar}>
        <TouchableOpacity
          style={[styles.monthBtn, !canGoPrev && styles.monthBtnDisabled]}
          onPress={() => stepMonth(-1)}
          disabled={!canGoPrev}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="chevron-back"
            size={20}
            color={canGoPrev ? colors.text : colors.inactive}
          />
        </TouchableOpacity>

        <Text style={styles.monthLabel}>
          {viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </Text>

        <TouchableOpacity
          style={[styles.monthBtn, !canGoNext && styles.monthBtnDisabled]}
          onPress={() => stepMonth(1)}
          disabled={!canGoNext}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={canGoNext ? colors.text : colors.inactive}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((day, index) => (
          <Text key={`${day}-${index}`} style={styles.weekday}>
            {day}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((date, index) => {
          if (date === null) {
            return <View key={`blank-${index}`} style={styles.cell} />;
          }

          const disabled = outOfRange(date);
          const isSelected = sameDay(date, selected);
          const isToday = sameDay(date, today);

          return (
            <TouchableOpacity
              key={isoDate(date)}
              style={styles.cell}
              onPress={() => onSelect(isoDate(date))}
              disabled={disabled}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={date.toDateString()}
              accessibilityState={{ selected: isSelected, disabled }}
            >
              <View
                style={[
                  styles.dayWrap,
                  isSelected && styles.dayWrapSelected,
                  !isSelected && isToday && styles.dayWrapToday,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    disabled && styles.dayTextDisabled,
                    isSelected && styles.dayTextSelected,
                  ]}
                >
                  {date.getDate()}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.footerBtn}
          onPress={onDismiss}
          activeOpacity={0.8}
        >
          <Text style={styles.footerBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.footerBtn, styles.footerBtnPrimary]}
          onPress={() => onSelect(isoDate(today))}
          disabled={outOfRange(today)}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.footerBtnText,
              styles.footerBtnTextPrimary,
              outOfRange(today) && styles.dayTextDisabled,
            ]}
          >
            Today
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * The same calendar presented as a dialog, for callers that are not already
 * inside one.
 */
export default function DatePickerModal({
  visible,
  ...pickerProps
}: DatePickerModalProps) {
  const styles = useThemedStyles(createStyles);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={pickerProps.onDismiss}
      // Remount on each open so the grid always lands on the selected month
      // rather than wherever the user browsed to last time.
      key={visible ? pickerProps.value : "closed"}
    >
      <Pressable style={styles.backdrop} onPress={pickerProps.onDismiss}>
        {/* Absorbs taps so they don't fall through to the dismissing backdrop. */}
        <Pressable onPress={() => {}} style={styles.modalCardWrap}>
          <DatePicker {...pickerProps} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    modalCardWrap: {
      width: "100%",
      maxWidth: 340,
    },
    card: {
      width: "100%",
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
    },
    title: {
      color: colors.text,
      fontSize: 16 * fontScale,
      fontWeight: "700",
      textAlign: "center",
      marginBottom: 12,
    },
    monthBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    monthBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    monthBtnDisabled: {
      opacity: 0.4,
    },
    monthLabel: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "700",
    },
    weekRow: {
      flexDirection: "row",
      marginBottom: 4,
    },
    weekday: {
      width: `${100 / 7}%`,
      textAlign: "center",
      color: colors.sub,
      fontSize: 11 * fontScale,
      fontWeight: "700",
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    cell: {
      width: `${100 / 7}%`,
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    dayWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
    },
    dayWrapSelected: {
      backgroundColor: colors.accent,
    },
    dayWrapToday: {
      borderWidth: 1,
      borderColor: colors.accentBorder,
    },
    dayText: {
      color: colors.text,
      fontSize: 14 * fontScale,
      fontWeight: "600",
    },
    dayTextDisabled: {
      color: colors.inactive,
      opacity: 0.5,
    },
    dayTextSelected: {
      color: colors.bg,
      fontWeight: "800",
    },
    footer: {
      flexDirection: "row",
      gap: 10,
      marginTop: 12,
    },
    footerBtn: {
      flex: 1,
      height: 42,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    footerBtnPrimary: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accentBorder,
    },
    footerBtnText: {
      color: colors.sub,
      fontSize: 14 * fontScale,
      fontWeight: "700",
    },
    footerBtnTextPrimary: {
      color: colors.accent,
    },
  });
}
