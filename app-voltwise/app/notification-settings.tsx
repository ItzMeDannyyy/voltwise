import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Switch,
  Modal,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer, useThemedStyles } from "../components/themed";
import { useTheme } from "../context/ThemeContext";
import { useNotifications } from "../context/NotificationContext";
import {
  SEVERITIES,
  SEVERITY_HINTS,
  SEVERITY_LABELS,
  formatMinutes,
  type AlertSeverity,
} from "../lib/notification-rules";
import type { ThemeColors } from "../constants/theme";

/**
 * Real, working notification preferences — the screen behind the Settings
 * "Notifications" row. Everything here is device-local (see
 * lib/notification-storage.ts); nothing syncs to the backend.
 */

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTE_STEPS = [0, 15, 30, 45];

/** Dependency-free time picker — 15-minute buckets are plenty for quiet hours. */
function TimePickerModal({
  visible,
  title,
  value,
  onCancel,
  onConfirm,
  styles,
  colors,
}: {
  visible: boolean;
  title: string;
  value: number;
  onCancel: () => void;
  onConfirm: (minutes: number) => void;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  const [hour, setHour] = useState(Math.floor(value / 60));
  const [minute, setMinute] = useState(Math.floor((value % 60) / 15) * 15);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.pickerCard} onPress={() => {}}>
          <Text style={styles.pickerTitle}>{title}</Text>
          <Text style={styles.pickerPreview}>{formatMinutes(hour * 60 + minute)}</Text>

          <View style={styles.pickerColumns}>
            <ScrollView style={styles.pickerColumn} showsVerticalScrollIndicator={false}>
              {HOURS.map((h) => {
                const active = h === hour;
                return (
                  <Pressable
                    key={h}
                    style={[styles.pickerCell, active && styles.pickerCellActive]}
                    onPress={() => setHour(h)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.pickerCellText, active && styles.pickerCellTextActive]}>
                      {String(h).padStart(2, "0")}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.pickerColon}>:</Text>

            <ScrollView style={styles.pickerColumn} showsVerticalScrollIndicator={false}>
              {MINUTE_STEPS.map((m) => {
                const active = m === minute;
                return (
                  <Pressable
                    key={m}
                    style={[styles.pickerCell, active && styles.pickerCellActive]}
                    onPress={() => setMinute(m)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.pickerCellText, active && styles.pickerCellTextActive]}>
                      {String(m).padStart(2, "0")}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.pickerActions}>
            <Pressable style={styles.pickerBtn} onPress={onCancel} accessibilityRole="button">
              <Text style={[styles.pickerBtnText, { color: colors.sub }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.pickerBtn, styles.pickerBtnPrimary]}
              onPress={() => onConfirm(hour * 60 + minute)}
              accessibilityRole="button"
            >
              <Text style={[styles.pickerBtnText, { color: colors.bg }]}>Set</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function NotificationSettingsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const {
    prefs,
    permission,
    requestPermission,
    setEnabled,
    setSeverity,
    setSound,
    setHaptics,
    setNewLoadPrompt,
    setQuietHours,
  } = useNotifications();

  const [picking, setPicking] = useState<"start" | "end" | null>(null);

  const off = !prefs.enabled;
  const switchProps = {
    trackColor: { false: colors.border, true: colors.accent },
    thumbColor: colors.text,
    ios_backgroundColor: colors.border,
  };

  const renderRow = (
    key: string,
    label: string,
    hint: string,
    value: boolean,
    onChange: (v: boolean) => void,
    opts: { disabled?: boolean; divider?: boolean } = {}
  ) => (
    <View
      key={key}
      style={[styles.row, opts.divider && styles.rowDivider, opts.disabled && styles.rowDisabled]}
    >
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowSubtitle}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={opts.disabled}
        accessibilityLabel={label}
        {...switchProps}
      />
    </View>
  );

  return (
    <ScreenContainer edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Permission — only when the OS hasn't granted it */}
        {permission !== "granted" && permission !== "unsupported" && (
          <View style={styles.banner}>
            <Ionicons name="notifications-off-outline" size={18} color={colors.accent} />
            <View style={styles.bannerBody}>
              <Text style={styles.bannerText}>
                {permission === "denied"
                  ? "Notifications are blocked for this app. Turn them on in your system settings."
                  : "Allow notifications so VoltWise can alert you when something needs attention."}
              </Text>
              <Pressable
                style={styles.bannerBtn}
                onPress={() =>
                  permission === "denied" ? Linking.openSettings() : requestPermission()
                }
                accessibilityRole="button"
              >
                <Text style={styles.bannerBtnText}>
                  {permission === "denied" ? "Open system settings" : "Turn on notifications"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {permission === "unsupported" && (
          <View style={styles.banner}>
            <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
            <Text style={styles.bannerText}>
              System notifications aren&apos;t available on web. These settings still control
              in-app alerts.
            </Text>
          </View>
        )}

        {/* Master */}
        <View style={styles.group}>
          <View style={styles.card}>
            {renderRow(
              "master",
              "Allow notifications",
              "Turn everything off in one place",
              prefs.enabled,
              setEnabled
            )}
          </View>
        </View>

        {/* Severity */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Alert types</Text>
          <View style={styles.card}>
            {SEVERITIES.map((severity: AlertSeverity, idx) =>
              renderRow(
                severity,
                SEVERITY_LABELS[severity],
                SEVERITY_HINTS[severity],
                prefs.severities[severity],
                (v) => setSeverity(severity, v),
                { disabled: off, divider: idx < SEVERITIES.length - 1 }
              )
            )}
          </View>
        </View>

        {/* Sound & feedback */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Sound &amp; feedback</Text>
          <View style={styles.card}>
            {renderRow(
              "sound",
              "Sound",
              "Alert chime and notification tone",
              prefs.sound,
              setSound,
              { disabled: off, divider: true }
            )}
            {renderRow(
              "haptics",
              "Vibration",
              "Buzz when an alert arrives",
              prefs.haptics,
              setHaptics,
              { disabled: off }
            )}
          </View>
        </View>

        {/* Quiet hours */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Quiet hours</Text>
          <View style={styles.card}>
            {renderRow(
              "quiet",
              "Enable quiet hours",
              "Silence notifications during a set window",
              prefs.quietHours.enabled,
              (v) => setQuietHours({ enabled: v }),
              { disabled: off, divider: true }
            )}

            {(["start", "end"] as const).map((which, idx) => {
              const disabled = off || !prefs.quietHours.enabled;
              const minutes =
                which === "start" ? prefs.quietHours.startMin : prefs.quietHours.endMin;
              return (
                <Pressable
                  key={which}
                  style={[styles.row, idx === 0 && styles.rowDivider, disabled && styles.rowDisabled]}
                  onPress={() => !disabled && setPicking(which)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={`${which === "start" ? "From" : "To"} ${formatMinutes(minutes)}`}
                >
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{which === "start" ? "From" : "To"}</Text>
                  </View>
                  <Text style={styles.rowValue}>{formatMinutes(minutes)}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.sub} />
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.footnote}>Critical alerts always come through.</Text>
        </View>

        {/* In-app */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>In-app</Text>
          <View style={styles.card}>
            {renderRow(
              "newLoad",
              "New load prompt",
              "Ask to add a device when a new appliance switches on",
              prefs.newLoadPrompt,
              setNewLoadPrompt,
              { disabled: off }
            )}
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      <TimePickerModal
        // Remount per open so the columns seed from the value being edited.
        key={picking ?? "closed"}
        visible={picking !== null}
        title={picking === "start" ? "Quiet hours start" : "Quiet hours end"}
        value={picking === "start" ? prefs.quietHours.startMin : prefs.quietHours.endMin}
        onCancel={() => setPicking(null)}
        onConfirm={(minutes) => {
          setQuietHours(picking === "start" ? { startMin: minutes } : { endMin: minutes });
          setPicking(null);
        }}
        styles={styles}
        colors={colors}
      />
    </ScreenContainer>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    scroll: {
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    banner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      backgroundColor: colors.accentSoft,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      padding: 14,
      marginBottom: 24,
    },
    bannerBody: {
      flex: 1,
      gap: 10,
    },
    bannerText: {
      color: colors.accent,
      fontSize: 13 * fontScale,
      lineHeight: 18 * fontScale,
      flex: 1,
    },
    bannerBtn: {
      alignSelf: "flex-start",
      backgroundColor: colors.accent,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    bannerBtnText: {
      color: colors.bg,
      fontSize: 13 * fontScale,
      fontWeight: "700",
    },
    group: {
      marginBottom: 24,
    },
    groupHeading: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      fontWeight: "700",
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: 10,
      marginLeft: 4,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    rowDisabled: {
      opacity: 0.5,
    },
    rowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowBody: {
      flex: 1,
    },
    rowTitle: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "600",
    },
    rowSubtitle: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 16 * fontScale,
      marginTop: 2,
    },
    rowValue: {
      color: colors.accent,
      fontSize: 15 * fontScale,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
    footnote: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      marginTop: 8,
      marginLeft: 4,
    },
    // ---- Time picker ----
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    pickerCard: {
      width: "100%",
      maxWidth: 320,
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
    },
    pickerTitle: {
      color: colors.text,
      fontSize: 16 * fontScale,
      fontWeight: "700",
      textAlign: "center",
    },
    pickerPreview: {
      color: colors.accent,
      fontSize: 30 * fontScale,
      fontWeight: "800",
      textAlign: "center",
      marginTop: 6,
      fontVariant: ["tabular-nums"],
    },
    pickerColumns: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 14,
    },
    pickerColumn: {
      maxHeight: 180,
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 3,
      minWidth: 74,
    },
    pickerColon: {
      color: colors.sub,
      fontSize: 18 * fontScale,
      fontWeight: "700",
    },
    pickerCell: {
      paddingVertical: 9,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    pickerCellActive: {
      backgroundColor: colors.accent,
    },
    pickerCellText: {
      color: colors.sub,
      fontSize: 15 * fontScale,
      fontWeight: "600",
      fontVariant: ["tabular-nums"],
    },
    pickerCellTextActive: {
      color: colors.bg,
      fontWeight: "800",
    },
    pickerActions: {
      flexDirection: "row",
      gap: 10,
      marginTop: 18,
    },
    pickerBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    pickerBtnPrimary: {
      backgroundColor: colors.accent,
    },
    pickerBtnText: {
      fontSize: 14 * fontScale,
      fontWeight: "700",
    },
  });
}
