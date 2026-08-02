import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer, useThemedStyles } from "../components/themed";
import { useTheme } from "../context/ThemeContext";
import { useUnits } from "../context/UnitsContext";
import {
  CURRENCIES,
  ENERGY_UNITS,
  ENERGY_UNIT_LABELS,
  MAX_RATE_PER_KWH,
  MIN_RATE_PER_KWH,
  POWER_UNITS,
  POWER_UNIT_LABELS,
  parseRate,
} from "../lib/unit-prefs";
import type { ThemeColors } from "../constants/theme";

/**
 * Units & Tariff — the screen behind that Settings row.
 *
 * The unit choices are device-local; the rate and currency belong to the
 * account and are pushed to the backend (see context/UnitsContext.tsx). Because
 * a push can fail while the local write always succeeds, the screen reports the
 * two outcomes differently rather than pretending a save reached the server.
 */

/** Sample figures for the live preview — a mid-range load and a day's usage. */
const PREVIEW_WATTS = 1240;
const PREVIEW_KWH = 8.75;

/** Pill-style multi-choice control, matching the Appearance card in settings.tsx. */
function SegmentedControl<T extends string>({
  options,
  labels,
  value,
  onChange,
  styles,
}: {
  options: T[];
  labels: Record<T, string>;
  value: T;
  onChange: (next: T) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.segmentRow}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => onChange(opt)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={labels[opt]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {labels[opt]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function UnitsSettingsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const {
    prefs,
    currency,
    setPowerUnit,
    setEnergyUnit,
    setCurrency,
    setRatePerKwh,
    formatPower,
    formatEnergy,
    formatCostOf,
    formatRate,
  } = useUnits();

  const [rateModalVisible, setRateModalVisible] = useState(false);
  const [rateInput, setRateInput] = useState("");
  const [rateError, setRateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Set when a save applied locally but never reached the server. */
  const [offlineNotice, setOfflineNotice] = useState(false);

  const openRateEditor = () => {
    setRateInput(prefs.ratePerKwh.toFixed(2));
    setRateError(null);
    setRateModalVisible(true);
  };

  const closeRateEditor = () => {
    if (saving) return;
    Keyboard.dismiss();
    setRateModalVisible(false);
  };

  const handleSaveRate = async () => {
    const rate = parseRate(rateInput);
    if (rate === null) {
      setRateError(`Enter a rate between ${MIN_RATE_PER_KWH} and ${MAX_RATE_PER_KWH}.`);
      return;
    }

    setSaving(true);
    setRateError(null);
    const synced = await setRatePerKwh(rate);
    setSaving(false);
    setOfflineNotice(!synced);
    Keyboard.dismiss();
    setRateModalVisible(false);
  };

  const handleSelectCurrency = async (code: string) => {
    if (code === prefs.currencyCode) return;
    const synced = await setCurrency(code);
    setOfflineNotice(!synced);
  };

  return (
    <ScreenContainer edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {offlineNotice && (
          <View style={styles.banner}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.accent} />
            <Text style={styles.bannerText}>
              Saved on this device, but the server couldn&apos;t be reached. Cost figures
              calculated on the server will catch up once you&apos;re back online.
            </Text>
          </View>
        )}

        {/* Display units */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Display units</Text>
          <View style={styles.card}>
            <View style={styles.choiceRow}>
              <View style={styles.choiceLabelRow}>
                <Ionicons name="flash-outline" size={18} color={colors.sub} />
                <Text style={styles.choiceLabel}>Power</Text>
              </View>
              <SegmentedControl
                options={POWER_UNITS}
                labels={POWER_UNIT_LABELS}
                value={prefs.powerUnit}
                onChange={setPowerUnit}
                styles={styles}
              />
              <Text style={styles.choiceHint}>
                Auto shows watts under 1 kW and kilowatts above it.
              </Text>
            </View>

            <View style={[styles.choiceRow, styles.rowDivider]}>
              <View style={styles.choiceLabelRow}>
                <Ionicons name="battery-charging-outline" size={18} color={colors.sub} />
                <Text style={styles.choiceLabel}>Energy</Text>
              </View>
              <SegmentedControl
                options={ENERGY_UNITS}
                labels={ENERGY_UNIT_LABELS}
                value={prefs.energyUnit}
                onChange={setEnergyUnit}
                styles={styles}
              />
            </View>
          </View>

          {/* Live preview so the effect of a choice is visible without leaving. */}
          <View style={styles.preview}>
            <Text style={styles.previewLabel}>Preview</Text>
            <View style={styles.previewRow}>
              <Text style={styles.previewValue}>{formatPower(PREVIEW_WATTS)}</Text>
              <Text style={styles.previewSep}>·</Text>
              <Text style={styles.previewValue}>{formatEnergy(PREVIEW_KWH, 1)}</Text>
              <Text style={styles.previewSep}>·</Text>
              <Text style={styles.previewValue}>{formatCostOf(PREVIEW_KWH)}</Text>
            </View>
          </View>
        </View>

        {/* Currency */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Currency</Text>
          <View style={styles.card}>
            {CURRENCIES.map((item, idx) => {
              const active = item.code === prefs.currencyCode;
              return (
                <Pressable
                  key={item.code}
                  // rowDivider is a top border, so it goes on every row but the first.
                  style={[styles.row, idx > 0 && styles.rowDivider]}
                  onPress={() => handleSelectCurrency(item.code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${item.label} (${item.symbol})`}
                >
                  <View style={styles.symbolBadge}>
                    <Text style={styles.symbolBadgeText}>{item.symbol}</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{item.label}</Text>
                    <Text style={styles.rowSubtitle}>{item.code}</Text>
                  </View>
                  {active && <Ionicons name="checkmark" size={20} color={colors.accent} />}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Tariff */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Electricity tariff</Text>
          <View style={styles.card}>
            <Pressable
              style={styles.row}
              onPress={openRateEditor}
              accessibilityRole="button"
              accessibilityLabel={`Rate per kilowatt-hour, ${formatRate()}`}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="calculator-outline" size={20} color={colors.sub} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Rate per kWh</Text>
                <Text style={styles.rowSubtitle}>What your provider charges</Text>
              </View>
              <Text style={styles.rowValue}>{formatRate()}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.sub} />
            </Pressable>
          </View>
          <Text style={styles.footnote}>
            Every cost figure in VoltWise — the bill predictor, the usage breakdown and each
            device&apos;s daily cost — is calculated from this rate. It is saved to your account,
            so it follows you to any device you sign in on.
          </Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      <Modal
        visible={rateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeRateEditor}
      >
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.backdrop} onPress={closeRateEditor}>
            <Pressable style={styles.modalCard} onPress={Keyboard.dismiss}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="calculator-outline" size={28} color={colors.accent} />
              </View>

              <Text style={styles.modalTitle}>Rate per kWh</Text>
              <Text style={styles.modalMessage}>
                Set the utility rate charged by your electricity provider per kilowatt-hour.
              </Text>

              <View style={styles.inputRow}>
                <Text style={styles.inputPrefix}>{currency.symbol}</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={rateInput}
                  onChangeText={(text) => {
                    setRateInput(text);
                    if (rateError) setRateError(null);
                  }}
                  placeholder="10.50"
                  placeholderTextColor={colors.sub}
                  selectTextOnFocus
                  autoFocus
                  editable={!saving}
                  accessibilityLabel="Rate per kilowatt-hour"
                />
                <Text style={styles.inputSuffix}>/kWh</Text>
              </View>

              {rateError !== null && <Text style={styles.errorText}>{rateError}</Text>}

              <View style={styles.modalActions}>
                <Pressable
                  style={styles.modalBtn}
                  onPress={closeRateEditor}
                  disabled={saving}
                  accessibilityRole="button"
                >
                  <Text style={[styles.modalBtnText, { color: colors.sub }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalBtn, styles.modalBtnPrimary]}
                  onPress={handleSaveRate}
                  disabled={saving}
                  accessibilityRole="button"
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.bg} />
                  ) : (
                    <Text style={[styles.modalBtnText, { color: colors.bg }]}>Save</Text>
                  )}
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
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
    bannerText: {
      color: colors.accent,
      fontSize: 13 * fontScale,
      lineHeight: 18 * fontScale,
      flex: 1,
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
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    rowIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
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
      lineHeight: 17 * fontScale,
      marginTop: 8,
      marginLeft: 4,
    },
    // ---- Unit choices ----
    choiceRow: {
      paddingHorizontal: 16,
      paddingVertical: 16,
      gap: 12,
    },
    choiceLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    choiceLabel: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "600",
    },
    choiceHint: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 16 * fontScale,
    },
    segmentRow: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 3,
      gap: 3,
    },
    segment: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    segmentActive: {
      backgroundColor: colors.accent,
    },
    segmentText: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      fontWeight: "600",
    },
    segmentTextActive: {
      color: colors.bg,
      fontWeight: "700",
    },
    // ---- Preview ----
    preview: {
      marginTop: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    previewLabel: {
      color: colors.sub,
      fontSize: 11 * fontScale,
      fontWeight: "700",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    previewRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
    },
    previewValue: {
      color: colors.text,
      fontSize: 16 * fontScale,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
    previewSep: {
      color: colors.sub,
      fontSize: 16 * fontScale,
    },
    // ---- Currency ----
    symbolBadge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    symbolBadgeText: {
      color: colors.text,
      fontSize: 16 * fontScale,
      fontWeight: "700",
    },
    // ---- Rate editor ----
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    modalCard: {
      width: "100%",
      maxWidth: 340,
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      alignItems: "center",
    },
    modalIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 17 * fontScale,
      fontWeight: "700",
      textAlign: "center",
    },
    modalMessage: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      lineHeight: 18 * fontScale,
      textAlign: "center",
      marginTop: 6,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "stretch",
      gap: 8,
      marginTop: 16,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    inputPrefix: {
      color: colors.accent,
      fontSize: 18 * fontScale,
      fontWeight: "700",
    },
    input: {
      flex: 1,
      color: colors.text,
      fontSize: 20 * fontScale,
      fontWeight: "700",
      padding: 0,
      fontVariant: ["tabular-nums"],
    },
    inputSuffix: {
      color: colors.sub,
      fontSize: 14 * fontScale,
      fontWeight: "600",
    },
    errorText: {
      color: colors.red,
      fontSize: 12 * fontScale,
      marginTop: 10,
      textAlign: "center",
    },
    modalActions: {
      flexDirection: "row",
      alignSelf: "stretch",
      gap: 10,
      marginTop: 18,
    },
    modalBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    modalBtnPrimary: {
      backgroundColor: colors.accent,
    },
    modalBtnText: {
      fontSize: 14 * fontScale,
      fontWeight: "700",
    },
  });
}
