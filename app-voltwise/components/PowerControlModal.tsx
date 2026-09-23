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
  Switch,
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

export default function PowerControlModal({ visible, onClose }: PowerControlModalProps) {
  const { colors, fontScale } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { telemetry } = useMqtt();
  const {
    masterOn,
    highOn,
    lowOn,
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
  const isAllOff = !highOn && !lowOn;
  const isPartial = !isAllOn && !isAllOff;

  const statusLabel = isAllOn
    ? "Both Lines Active"
    : isPartial
      ? "Partial Load Active"
      : "All Lines De-energized";

  const statusColor = isAllOn
    ? colors.accent
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
            <View style={[styles.masterCard, { borderColor: masterOn ? colors.accent + "50" : colors.border }]}>
              <View style={styles.masterCardHeader}>
                <View
                  style={[
                    styles.masterIconHalo,
                    {
                      backgroundColor: masterOn ? colors.accentSoft : colors.surface,
                      borderColor: masterOn ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="power"
                    size={28}
                    color={masterOn ? colors.accent : colors.inactive}
                  />
                </View>

                <View style={styles.masterTextWrap}>
                  <View style={styles.masterTitleRow}>
                    <Text style={styles.masterTitle}>Master Power</Text>
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor: masterOn ? colors.accent + "22" : colors.red + "22",
                          borderColor: masterOn ? colors.accent : colors.red,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          { color: masterOn ? colors.accent : colors.red },
                        ]}
                      >
                        {masterOn ? "MAIN ON" : "MAIN OFF"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.masterDesc}>
                    Simultaneously turn ON or OFF all relays across both High & Low voltage lines
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.masterActionButton,
                  {
                    backgroundColor: !canControl
                      ? colors.surface
                      : masterOn
                        ? colors.red + "18"
                        : colors.accent + "20",
                    borderColor: !canControl
                      ? colors.border
                      : masterOn
                        ? colors.red
                        : colors.accent,
                    opacity: !canControl ? 0.45 : 1,
                  },
                ]}
                onPress={() => toggleMaster()}
                disabled={controlsDisabled}
                accessibilityRole="button"
                accessibilityLabel="Toggle master power"
              >
                {pending && pendingTarget === "all" ? (
                  <ActivityIndicator size="small" color={masterOn ? colors.red : colors.accent} />
                ) : !canControl ? (
                  <>
                    <Ionicons
                      name="cloud-offline"
                      size={18}
                      color={colors.sub}
                      style={{ marginRight: 8 }}
                    />
                    <Text
                      style={[
                        styles.masterActionText,
                        { color: colors.sub },
                      ]}
                    >
                      Controls Offline (Locked)
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons
                      name="power"
                      size={18}
                      color={masterOn ? colors.red : colors.accent}
                      style={{ marginRight: 8 }}
                    />
                    <Text
                      style={[
                        styles.masterActionText,
                        { color: masterOn ? colors.red : colors.accent },
                      ]}
                    >
                      {masterOn ? "Cut All Power (Master Shutdown)" : "Energize All Circuits"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Section Divider */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>INDIVIDUAL LINE CONTROLS</Text>
              <Text style={styles.sectionHeaderSub}>Turn lines on/off separately without cutting the other</Text>
            </View>

            {/* ========================================================================= */}
            {/* LINE 1: HIGH VOLTAGE / HIGH LOAD LINE */}
            {/* ========================================================================= */}
            <View style={[styles.lineCard, { borderColor: highOn ? colors.accent + "40" : colors.border }]}>
              <View style={styles.lineCardTop}>
                <View style={[styles.lineIconWrap, { backgroundColor: highOn ? "#f59e0b20" : colors.surface }]}>
                  <Ionicons name="flame" size={22} color={highOn ? "#f59e0b" : colors.inactive} />
                </View>

                <View style={styles.lineInfo}>
                  <View style={styles.lineTitleRow}>
                    <Text style={styles.lineTitle}>High Load Voltage Line</Text>
                    <View
                      style={[
                        styles.miniBadge,
                        {
                          backgroundColor: highOn ? colors.green + "20" : colors.red + "20",
                          borderColor: highOn ? colors.green : colors.red,
                        },
                      ]}
                    >
                      <Text style={[styles.miniBadgeText, { color: highOn ? colors.green : colors.red }]}>
                        {highOn ? "ACTIVE" : "OFF"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.lineRating}>Outlet 1 • 2× 30A Relays</Text>
                </View>

                {pending && pendingTarget === "high" ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Switch
                    value={highOn}
                    onValueChange={(val) => toggleHighLine(val)}
                    disabled={controlsDisabled}
                    trackColor={{ false: colors.border, true: colors.accent }}
                    thumbColor={Platform.OS === "android" ? (highOn ? colors.card : colors.sub) : colors.white}
                  />
                )}
              </View>

              {/* Connected Appliances Chips */}
              <View style={styles.chipsRow}>
                <View style={[styles.chip, !highOn && styles.chipDimmed]}>
                  <Ionicons name="snow-outline" size={12} color={highOn ? colors.sub : colors.inactive} style={{ marginRight: 4 }} />
                  <Text style={[styles.chipText, !highOn && styles.chipTextDimmed]}>
                    Aircon (1,180W){!highOn ? " • Off" : ""}
                  </Text>
                </View>
                <View style={[styles.chip, !highOn && styles.chipDimmed]}>
                  <Ionicons name="cube-outline" size={12} color={highOn ? colors.sub : colors.inactive} style={{ marginRight: 4 }} />
                  <Text style={[styles.chipText, !highOn && styles.chipTextDimmed]}>
                    Refrigerator (165W){!highOn ? " • Off" : ""}
                  </Text>
                </View>
                <View style={[styles.chip, !highOn && styles.chipDimmed]}>
                  <Ionicons name="water-outline" size={12} color={highOn ? colors.sub : colors.inactive} style={{ marginRight: 4 }} />
                  <Text style={[styles.chipText, !highOn && styles.chipTextDimmed]}>
                    Water Pump{!highOn ? " • Off" : ""}
                  </Text>
                </View>
              </View>
            </View>

            {/* ========================================================================= */}
            {/* LINE 2: LOW VOLTAGE / LOW LOAD LINE */}
            {/* ========================================================================= */}
            <View style={[styles.lineCard, { borderColor: lowOn ? colors.accent + "40" : colors.border }]}>
              <View style={styles.lineCardTop}>
                <View style={[styles.lineIconWrap, { backgroundColor: lowOn ? colors.accentSoft : colors.surface }]}>
                  <Ionicons name="bulb" size={22} color={lowOn ? colors.accent : colors.inactive} />
                </View>

                <View style={styles.lineInfo}>
                  <View style={styles.lineTitleRow}>
                    <Text style={styles.lineTitle}>Low Load Voltage Line</Text>
                    <View
                      style={[
                        styles.miniBadge,
                        {
                          backgroundColor: lowOn ? colors.green + "20" : colors.red + "20",
                          borderColor: lowOn ? colors.green : colors.red,
                        },
                      ]}
                    >
                      <Text style={[styles.miniBadgeText, { color: lowOn ? colors.green : colors.red }]}>
                        {lowOn ? "ACTIVE" : "OFF"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.lineRating}>Outlet 2 • 2× 10A Relays</Text>
                </View>

                {pending && pendingTarget === "low" ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Switch
                    value={lowOn}
                    onValueChange={(val) => toggleLowLine(val)}
                    disabled={controlsDisabled}
                    trackColor={{ false: colors.border, true: colors.accent }}
                    thumbColor={Platform.OS === "android" ? (lowOn ? colors.card : colors.sub) : colors.white}
                  />
                )}
              </View>

              {/* Connected Appliances Chips */}
              <View style={styles.chipsRow}>
                <View style={[styles.chip, !lowOn && styles.chipDimmed]}>
                  <Ionicons name="tv-outline" size={12} color={lowOn ? colors.sub : colors.inactive} style={{ marginRight: 4 }} />
                  <Text style={[styles.chipText, !lowOn && styles.chipTextDimmed]}>
                    Smart TV (95W){!lowOn ? " • Off" : ""}
                  </Text>
                </View>
                <View style={[styles.chip, !lowOn && styles.chipDimmed]}>
                  <Ionicons name="restaurant-outline" size={12} color={lowOn ? colors.sub : colors.inactive} style={{ marginRight: 4 }} />
                  <Text style={[styles.chipText, !lowOn && styles.chipTextDimmed]}>
                    Rice Cooker{!lowOn ? " • Off" : ""}
                  </Text>
                </View>
                <View style={[styles.chip, !lowOn && styles.chipDimmed]}>
                  <Ionicons name="phone-portrait-outline" size={12} color={lowOn ? colors.sub : colors.inactive} style={{ marginRight: 4 }} />
                  <Text style={[styles.chipText, !lowOn && styles.chipTextDimmed]}>
                    Chargers & Lights (288W){!lowOn ? " • Off" : ""}
                  </Text>
                </View>
              </View>
            </View>

            {/* ========================================================================= */}
            {/* LIVE TELEMETRY & INRUSH SAFETY FOOTER */}
            {/* ========================================================================= */}
            <View style={styles.telemetryCard}>
              <View style={styles.telemetryItem}>
                <Text style={styles.telemetryLabel}>Aggregate Load</Text>
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
                    ? "Hardware offline: switches are locked to prevent desync. Turn on Sample Data in the Demo FAB to demonstrate."
                    : "Sequential reconnection active: Relay switching maintains a safety delay to prevent inrush breaker trips."}
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
      padding: 16,
      marginBottom: 20,
    },
    masterCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 14,
    },
    masterIconHalo: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 14,
    },
    masterTextWrap: {
      flex: 1,
    },
    masterTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 4,
    },
    masterTitle: {
      fontSize: 16 * fontScale,
      fontWeight: "700",
      color: colors.text,
    },
    masterDesc: {
      fontSize: 11 * fontScale,
      color: colors.sub,
      lineHeight: 16,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
    },
    badgeText: {
      fontSize: 10 * fontScale,
      fontWeight: "800",
      letterSpacing: 0.4,
    },
    masterActionButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1.5,
    },
    masterActionText: {
      fontSize: 13 * fontScale,
      fontWeight: "700",
      letterSpacing: 0.2,
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
      marginRight: 12,
    },
    lineInfo: {
      flex: 1,
      marginRight: 8,
    },
    lineTitleRow: {
      flexDirection: "row",
      alignItems: "center",
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
