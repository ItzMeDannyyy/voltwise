import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  ScrollView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useMqtt } from "../context/MqttContext";
import { usePowerControl } from "../context/PowerControlContext";
import { useThemedStyles } from "./themed";
import type { ThemeColors } from "../constants/theme";

export interface PowerControlModalProps {
  visible: boolean;
  onClose: () => void;
}

interface PowerSwitchProps {
  on: boolean;
  offline: boolean;
  pending: boolean;
  staggering?: boolean;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  colors: ThemeColors;
  fontScale: number;
  styles: ReturnType<typeof createStyles>;
}

function PowerSwitch({
  on,
  offline,
  pending,
  staggering,
  onPress,
  disabled,
  accessibilityLabel,
  colors,
  fontScale,
  styles,
}: PowerSwitchProps) {
  const switchColor = offline
    ? colors.sub
    : staggering
      ? colors.amber
      : on
        ? colors.green
        : colors.red;

  const switchBg = offline
    ? colors.surface
    : staggering
      ? colors.amber + "1F"
      : on
        ? colors.green + "1F"
        : colors.red + "1F";

  const label = offline ? "OFFLINE" : staggering ? "WAIT 3s" : on ? "ON" : "OFF";
  const labelFontSize = (offline || staggering ? 9 : 11) * fontScale;

  return (
    <TouchableOpacity
      style={[
        styles.powerSwitchBtn,
        {
          borderColor: offline ? colors.border : switchColor,
          backgroundColor: switchBg,
          opacity: offline ? 0.45 : disabled && !pending ? 0.6 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled), checked: on }}
    >
      {pending ? (
        <ActivityIndicator size="small" color={switchColor} />
      ) : (
        <>
          <Ionicons
            name={offline ? "cloud-offline" : "power"}
            size={offline ? 18 : 20}
            color={switchColor}
          />
          <Text
            style={[
              styles.powerSwitchLabel,
              {
                color: switchColor,
                fontSize: labelFontSize,
              },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export default function PowerControlModal({ visible, onClose }: PowerControlModalProps) {
  const { colors, fontScale } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { telemetry } = useMqtt();
  const {
    masterOn,
    highOn,
    lowOn,
    isStaggering,
    staggerSeconds,
    pending,
    pendingTarget,
    error,
    isOffline,
    isDemoMode,
    canControl,
    toggleMaster,
    toggleHighLine,
    toggleLowLine,
  } = usePowerControl();

  const isAllOn = highOn && lowOn;
  const isAllOff = !highOn && !lowOn && !isStaggering;
  const isPartial = !isAllOn && !isAllOff && !isStaggering;

  const statusLabel = !canControl
    ? "Sensors Offline"
    : isStaggering
      ? `Inrush Protection: Staggering (${staggerSeconds}s)...`
      : isAllOn
        ? "Both Lines Active"
        : isPartial
          ? "Partial Power Active"
          : "All Circuits Turned Off";

  const statusColor = !canControl
    ? colors.sub
    : isStaggering
      ? colors.amber
      : isAllOn
        ? colors.green
        : isPartial
          ? colors.amber
          : colors.red;

  // Buttons and switches are disabled when offline and not in demo mode
  const controlsDisabled = !canControl || pending;

  // Dynamic simulated telemetry ONLY when Demo Mode is active
  const isSimulated = isDemoMode;
  const simulatedWatts = (highOn ? 1345 : 0) + (lowOn ? 383 : 0);

  const currentWatts = isSimulated
    ? `${simulatedWatts} W`
    : telemetry?.watts !== undefined
      ? `${Math.round(telemetry.watts)} W`
      : "-- W";

  const currentVolts = isSimulated
    ? (masterOn ? "228 V" : "0 V")
    : telemetry?.voltage !== undefined
      ? `${Math.round(telemetry.voltage)} V`
      : "-- V";

  const currentPf = isSimulated
    ? (masterOn && simulatedWatts > 0 ? "0.97" : "0.00")
    : telemetry?.powerFactor !== undefined
      ? telemetry.powerFactor.toFixed(2)
      : "--";

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissOverlay} onPress={onClose} />

        <View style={styles.sheetContainer}>
          {/* Grabber indicator */}
          <View style={styles.grabber} />

          {/* Modal Header */}
          <View style={styles.header}>
            <View style={styles.headerTitles}>
              <View style={styles.titleRow}>
                <Ionicons name="flash" size={20} color={colors.accent} style={{ marginRight: 6 }} />
                <Text style={styles.title}>Power Control</Text>
              </View>
              <Text style={styles.subtitle}>Dual-Line Circuit Management</Text>
            </View>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close power control modal"
            >
              <Ionicons name="close" size={20} color={colors.sub} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* System Status & Operating Mode Row */}
            <View style={styles.topStatusRow}>
              <View style={[styles.statusPill, { borderColor: statusColor + "40", backgroundColor: statusColor + "14" }]}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
              </View>

              <View
                style={[
                  styles.modeBadge,
                  {
                    backgroundColor: isDemoMode
                      ? colors.accent + "18"
                      : isOffline
                        ? colors.red + "18"
                        : colors.green + "18",
                    borderColor: isDemoMode
                      ? colors.accent
                      : isOffline
                        ? colors.red
                        : colors.green,
                  },
                ]}
              >
                <Ionicons
                  name={isDemoMode ? "sparkles" : isOffline ? "cloud-offline" : "radio"}
                  size={12}
                  color={isDemoMode ? colors.accent : isOffline ? colors.red : colors.green}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.modeBadgeText,
                    {
                      color: isDemoMode
                        ? colors.accent
                        : isOffline
                          ? colors.red
                          : colors.green,
                    },
                  ]}
                >
                  {isDemoMode ? "DEMO MODE" : isOffline ? "OFFLINE" : "HARDWARE LIVE"}
                </Text>
              </View>
            </View>

            {/* Informative Mode Banner */}
            {isDemoMode ? (
              <View style={[styles.infoBanner, { backgroundColor: colors.accent + "12", borderColor: colors.accent + "40" }]}>
                <Ionicons name="sparkles" size={15} color={colors.accent} style={{ marginRight: 8, marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoBannerTitle, { color: colors.accent }]}>Interactive Sample Data Active</Text>
                  <Text style={styles.infoBannerText}>
                    Dual-line demo enabled. Toggling lines recalculates real-time load, amperage, and appliance states.
                  </Text>
                </View>
              </View>
            ) : isOffline ? (
              <View style={[styles.infoBanner, { backgroundColor: colors.red + "12", borderColor: colors.red + "40" }]}>
                <Ionicons name="cloud-offline-outline" size={15} color={colors.red} style={{ marginRight: 8, marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.infoBannerTitle, { color: colors.red }]}>IoT Sensor Offline</Text>
                  <Text style={styles.infoBannerText}>
                    Power controls are locked because the sensor is offline. Turn on Sample Data in the Demo FAB to demonstrate this feature.
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Error banner if any online command failed */}
            {error ? (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={colors.red} style={{ marginRight: 6 }} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* ========================================================================= */}
            {/* MASTER POWER CARD (SIMULTANEOUS CONTROL) */}
            {/* ========================================================================= */}
            <View
              style={[
                styles.masterCard,
                {
                  borderColor: !canControl
                    ? colors.border
                    : masterOn
                      ? colors.green + "50"
                      : colors.border,
                },
              ]}
            >
              <View style={styles.masterCardContent}>
                <View
                  style={[
                    styles.masterIconHalo,
                    {
                      backgroundColor: !canControl
                        ? colors.surface
                        : isStaggering
                          ? "#f59e0b20"
                          : masterOn
                            ? colors.green + "20"
                            : colors.surface,
                      borderColor: !canControl
                        ? colors.border
                        : isStaggering
                          ? "#f59e0b"
                          : masterOn
                            ? colors.green
                            : colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={!canControl ? "cloud-offline" : "flash"}
                    size={22}
                    color={!canControl ? colors.inactive : isStaggering ? "#f59e0b" : masterOn ? colors.green : colors.inactive}
                  />
                </View>

                <View style={styles.masterTextWrap}>
                  <View style={styles.masterTitleRow}>
                    <Text style={styles.masterTitle}>Master Power</Text>
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor: !canControl
                            ? colors.surface
                            : isStaggering
                              ? "#f59e0b22"
                              : masterOn
                                ? colors.green + "22"
                                : colors.red + "22",
                          borderColor: !canControl
                            ? colors.border
                            : isStaggering
                              ? "#f59e0b"
                              : masterOn
                                ? colors.green
                                : colors.red,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          {
                            color: !canControl
                              ? colors.sub
                              : isStaggering
                                ? "#f59e0b"
                                : masterOn
                                  ? colors.green
                                  : colors.red,
                          },
                        ]}
                      >
                        {!canControl ? "OFFLINE" : isStaggering ? "STAGGERING" : masterOn ? "MAIN ON" : "MAIN OFF"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.masterDesc}>
                    Simultaneously control all relays across Line 1 & Line 2
                  </Text>
                </View>

                <PowerSwitch
                  on={masterOn}
                  offline={!canControl}
                  pending={(pending && pendingTarget === "all") || isStaggering}
                  onPress={() => toggleMaster()}
                  disabled={controlsDisabled}
                  accessibilityLabel={
                    !canControl
                      ? "Master power offline"
                      : masterOn
                        ? "Turn off master power"
                        : "Turn on master power"
                  }
                  colors={colors}
                  fontScale={fontScale}
                  styles={styles}
                />
              </View>
            </View>

            {/* Section Divider */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>INDIVIDUAL LINE CONTROLS</Text>
              <Text style={styles.sectionHeaderSub}>Turn lines on/off separately without cutting the other</Text>
            </View>

            {/* ========================================================================= */}
            {/* LINE 1: HIGH VOLTAGE / HIGH LOAD LINE */}
            {/* ========================================================================= */}
            <View
              style={[
                styles.lineCard,
                {
                  borderColor: !canControl
                    ? colors.border
                    : isStaggering
                      ? "#f59e0b"
                      : highOn
                        ? colors.green + "40"
                        : colors.border,
                },
              ]}
            >
              <View style={styles.lineCardTop}>
                <View
                  style={[
                    styles.lineIconWrap,
                    {
                      backgroundColor: !canControl
                        ? colors.surface
                        : isStaggering || highOn
                          ? "#f59e0b20"
                          : colors.surface,
                    },
                  ]}
                >
                  <Ionicons
                    name="flame"
                    size={22}
                    color={!canControl ? colors.inactive : isStaggering || highOn ? "#f59e0b" : colors.inactive}
                  />
                </View>

                <View style={styles.lineInfo}>
                  <View style={styles.lineTitleRow}>
                    <Text style={styles.lineTitle}>Heavy Appliances (Line 1)</Text>
                    <View
                      style={[
                        styles.miniBadge,
                        {
                          backgroundColor: !canControl
                            ? colors.surface
                            : isStaggering
                              ? "#f59e0b20"
                              : highOn
                                ? colors.green + "20"
                                : colors.red + "20",
                          borderColor: !canControl
                            ? colors.border
                            : isStaggering
                              ? "#f59e0b"
                              : highOn
                                ? colors.green
                                : colors.red,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.miniBadgeText,
                          {
                            color: !canControl
                              ? colors.sub
                              : isStaggering
                                ? "#f59e0b"
                                : highOn
                                  ? colors.green
                                  : colors.red,
                          },
                        ]}
                      >
                        {!canControl ? "OFFLINE" : isStaggering ? "INRUSH WAIT (3s)" : highOn ? "ACTIVE" : "OFF"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.lineRating}>Outlet 1 • Heavy Duty (Up to 30A)</Text>
                </View>

                {/* Power Switch on the Right Side */}
                <PowerSwitch
                  on={highOn}
                  offline={!canControl}
                  pending={pending && pendingTarget === "high"}
                  staggering={isStaggering}
                  onPress={() => toggleHighLine()}
                  disabled={controlsDisabled}
                  accessibilityLabel={
                    !canControl
                      ? "Heavy Appliances Line 1 is offline"
                      : isStaggering
                        ? "Heavy Appliances Line 1 waiting for inrush delay"
                        : highOn
                          ? "Turn off Heavy Appliances Line 1"
                          : "Turn on Heavy Appliances Line 1"
                  }
                  colors={colors}
                  fontScale={fontScale}
                  styles={styles}
                />
              </View>

              {/* Connected Appliances Chips */}
              <View style={styles.chipsRow}>
                <View style={[styles.chip, (!highOn && !isStaggering || !canControl) && styles.chipDimmed]}>
                  <Ionicons
                    name="snow-outline"
                    size={12}
                    color={canControl && (highOn || isStaggering) ? colors.sub : colors.inactive}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.chipText, (!highOn && !isStaggering || !canControl) && styles.chipTextDimmed]}>
                    Aircon (1,180W){!canControl ? " • Offline" : isStaggering ? " • In 3s" : !highOn ? " • Off" : ""}
                  </Text>
                </View>
                <View style={[styles.chip, (!highOn && !isStaggering || !canControl) && styles.chipDimmed]}>
                  <Ionicons
                    name="cube-outline"
                    size={12}
                    color={canControl && (highOn || isStaggering) ? colors.sub : colors.inactive}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.chipText, (!highOn && !isStaggering || !canControl) && styles.chipTextDimmed]}>
                    Refrigerator (165W){!canControl ? " • Offline" : isStaggering ? " • In 3s" : !highOn ? " • Off" : ""}
                  </Text>
                </View>
                <View style={[styles.chip, (!highOn && !isStaggering || !canControl) && styles.chipDimmed]}>
                  <Ionicons
                    name="water-outline"
                    size={12}
                    color={canControl && (highOn || isStaggering) ? colors.sub : colors.inactive}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.chipText, (!highOn && !isStaggering || !canControl) && styles.chipTextDimmed]}>
                    Water Pump{!canControl ? " • Offline" : isStaggering ? " • In 3s" : !highOn ? " • Off" : ""}
                  </Text>
                </View>
              </View>
            </View>

            {/* ========================================================================= */}
            {/* LINE 2: LOW VOLTAGE / LOW LOAD LINE */}
            {/* ========================================================================= */}
            <View
              style={[
                styles.lineCard,
                {
                  borderColor: !canControl
                    ? colors.border
                    : lowOn
                      ? colors.green + "40"
                      : colors.border,
                },
              ]}
            >
              <View style={styles.lineCardTop}>
                <View
                  style={[
                    styles.lineIconWrap,
                    {
                      backgroundColor: !canControl
                        ? colors.surface
                        : lowOn
                          ? colors.accentSoft
                          : colors.surface,
                    },
                  ]}
                >
                  <Ionicons
                    name="bulb"
                    size={22}
                    color={!canControl ? colors.inactive : lowOn ? colors.accent : colors.inactive}
                  />
                </View>

                <View style={styles.lineInfo}>
                  <View style={styles.lineTitleRow}>
                    <Text style={styles.lineTitle}>Lighting & Standard Outlets (Line 2)</Text>
                    <View
                      style={[
                        styles.miniBadge,
                        {
                          backgroundColor: !canControl
                            ? colors.surface
                            : lowOn
                              ? colors.green + "20"
                              : colors.red + "20",
                          borderColor: !canControl
                            ? colors.border
                            : lowOn
                              ? colors.green
                              : colors.red,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.miniBadgeText,
                          {
                            color: !canControl
                              ? colors.sub
                              : lowOn
                                ? colors.green
                                : colors.red,
                          },
                        ]}
                      >
                        {!canControl ? "OFFLINE" : lowOn ? "ACTIVE" : "OFF"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.lineRating}>Outlet 2 • Standard Duty (Up to 10A)</Text>
                </View>

                {/* Power Switch on the Right Side */}
                <PowerSwitch
                  on={lowOn}
                  offline={!canControl}
                  pending={pending && pendingTarget === "low"}
                  onPress={() => toggleLowLine()}
                  disabled={controlsDisabled}
                  accessibilityLabel={
                    !canControl
                      ? "Lighting Line 2 is offline"
                      : lowOn
                        ? "Turn off Lighting Line 2"
                        : "Turn on Lighting Line 2"
                  }
                  colors={colors}
                  fontScale={fontScale}
                  styles={styles}
                />
              </View>

              {/* Connected Appliances Chips */}
              <View style={styles.chipsRow}>
                <View style={[styles.chip, (!lowOn || !canControl) && styles.chipDimmed]}>
                  <Ionicons
                    name="tv-outline"
                    size={12}
                    color={canControl && lowOn ? colors.sub : colors.inactive}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.chipText, (!lowOn || !canControl) && styles.chipTextDimmed]}>
                    Smart TV (95W){!canControl ? " • Offline" : !lowOn ? " • Off" : ""}
                  </Text>
                </View>
                <View style={[styles.chip, (!lowOn || !canControl) && styles.chipDimmed]}>
                  <Ionicons
                    name="restaurant-outline"
                    size={12}
                    color={canControl && lowOn ? colors.sub : colors.inactive}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.chipText, (!lowOn || !canControl) && styles.chipTextDimmed]}>
                    Rice Cooker{!canControl ? " • Offline" : !lowOn ? " • Off" : ""}
                  </Text>
                </View>
                <View style={[styles.chip, (!lowOn || !canControl) && styles.chipDimmed]}>
                  <Ionicons
                    name="phone-portrait-outline"
                    size={12}
                    color={canControl && lowOn ? colors.sub : colors.inactive}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.chipText, (!lowOn || !canControl) && styles.chipTextDimmed]}>
                    Chargers & Lights (288W){!canControl ? " • Offline" : !lowOn ? " • Off" : ""}
                  </Text>
                </View>
              </View>
            </View>

            {/* ========================================================================= */}
            {/* LIVE TELEMETRY & INRUSH SAFETY FOOTER */}
            {/* ========================================================================= */}
            <View style={styles.telemetryCard}>
              <View style={styles.telemetryItem}>
                <Text style={styles.telemetryLabel}>Total Power Draw</Text>
                <Text style={styles.telemetryValue}>{currentWatts}</Text>
              </View>
              <View style={styles.telemetryDivider} />
              <View style={styles.telemetryItem}>
                <Text style={styles.telemetryLabel}>Supply Voltage</Text>
                <Text style={styles.telemetryValue}>{currentVolts}</Text>
              </View>
              <View style={styles.telemetryDivider} />
              <View style={styles.telemetryItem}>
                <Text style={styles.telemetryLabel}>Power Factor</Text>
                <Text style={styles.telemetryValue}>{currentPf}</Text>
              </View>
            </View>

            <View style={styles.safetyNotice}>
              <Ionicons
                name={!canControl ? "alert-circle-outline" : "shield-checkmark-outline"}
                size={14}
                color={!canControl ? colors.red : colors.accent}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.safetyNoticeText, !canControl && { color: colors.red }]}>
                {isDemoMode
                  ? "Interactive demo: switching lines recalculates aggregate power draw and current in real time."
                  : !canControl
                    ? "Hardware offline: switches are locked to prevent desync. Tap the Demo sparkle button at the bottom right to test controls."
                    : "Sequential reconnection active: Relay switching maintains a safety delay to prevent tripping your circuit breaker."}
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlayStrong,
      justifyContent: "flex-end",
    },
    dismissOverlay: {
      flex: 1,
    },
    sheetContainer: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1,
      borderColor: colors.border,
      maxHeight: "88%",
      paddingTop: 8,
      paddingBottom: Platform.OS === "ios" ? 34 : 20,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 20,
    },
    grabber: {
      width: 44,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 10,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitles: {
      flex: 1,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    title: {
      fontSize: 18 * fontScale,
      fontWeight: "700",
      color: colors.text,
    },
    subtitle: {
      fontSize: 12 * fontScale,
      color: colors.sub,
      marginTop: 2,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      marginLeft: 12,
    },
    scrollArea: {
      paddingHorizontal: 20,
    },
    scrollContent: {
      paddingTop: 16,
      paddingBottom: 24,
    },
    topStatusRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 8,
    },
    statusPillText: {
      fontSize: 12 * fontScale,
      fontWeight: "600",
      letterSpacing: 0.3,
    },
    modeBadge: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
    },
    modeBadgeText: {
      fontSize: 10 * fontScale,
      fontWeight: "800",
      letterSpacing: 0.4,
    },
    infoBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      borderWidth: 1,
      borderRadius: 12,
      padding: 10,
      marginBottom: 14,
    },
    infoBannerTitle: {
      fontSize: 12 * fontScale,
      fontWeight: "700",
      marginBottom: 2,
    },
    infoBannerText: {
      fontSize: 11 * fontScale,
      color: colors.sub,
      lineHeight: 15,
    },
    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.red + "18",
      borderColor: colors.red,
      borderWidth: 1,
      borderRadius: 10,
      padding: 10,
      marginBottom: 14,
    },
    errorText: {
      fontSize: 12 * fontScale,
      color: colors.red,
      flex: 1,
    },
    masterCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1.5,
      padding: 14,
      marginBottom: 20,
    },
    masterCardContent: {
      flexDirection: "row",
      alignItems: "center",
    },
    masterIconHalo: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },
    masterTextWrap: {
      flex: 1,
      marginRight: 8,
    },
    masterTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 2,
    },
    masterTitle: {
      fontSize: 15 * fontScale,
      fontWeight: "700",
      color: colors.text,
    },
    masterDesc: {
      fontSize: 11 * fontScale,
      color: colors.sub,
      lineHeight: 15,
    },
    badge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 1,
    },
    badgeText: {
      fontSize: 9 * fontScale,
      fontWeight: "800",
      letterSpacing: 0.4,
    },
    powerSwitchBtn: {
      width: 64,
      height: 52,
      borderRadius: 14,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
    },
    powerSwitchLabel: {
      fontSize: 10 * fontScale,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    sectionHeader: {
      marginBottom: 12,
    },
    sectionHeaderText: {
      fontSize: 11 * fontScale,
      fontWeight: "700",
      letterSpacing: 0.8,
      color: colors.sub,
    },
    sectionHeaderSub: {
      fontSize: 11 * fontScale,
      color: colors.sub,
      marginTop: 2,
    },
    lineCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      padding: 14,
      marginBottom: 12,
    },
    lineCardTop: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 10,
    },
    lineIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },
    lineInfo: {
      flex: 1,
      marginRight: 8,
    },
    lineTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 2,
    },
    lineTitle: {
      fontSize: 14 * fontScale,
      fontWeight: "600",
      color: colors.text,
      marginRight: 6,
    },
    miniBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      borderWidth: 1,
    },
    miniBadgeText: {
      fontSize: 9 * fontScale,
      fontWeight: "700",
    },
    lineRating: {
      fontSize: 11 * fontScale,
      color: colors.sub,
    },
    chipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      paddingTop: 4,
      borderTopWidth: 1,
      borderTopColor: colors.border + "80",
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipDimmed: {
      opacity: 0.45,
      backgroundColor: colors.surface,
    },
    chipText: {
      fontSize: 11 * fontScale,
      color: colors.sub,
      fontWeight: "500",
    },
    chipTextDimmed: {
      color: colors.inactive,
      textDecorationLine: "line-through",
    },
    telemetryCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginTop: 8,
      marginBottom: 12,
    },
    telemetryItem: {
      alignItems: "center",
      flex: 1,
    },
    telemetryLabel: {
      fontSize: 10 * fontScale,
      color: colors.sub,
      marginBottom: 2,
    },
    telemetryValue: {
      fontSize: 13 * fontScale,
      fontWeight: "700",
      color: colors.text,
    },
    telemetryDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.border,
    },
    safetyNotice: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.accentSoft,
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.accentBorder,
    },
    safetyNoticeText: {
      fontSize: 11 * fontScale,
      color: colors.accent,
      flex: 1,
      lineHeight: 15,
    },
  });
}
