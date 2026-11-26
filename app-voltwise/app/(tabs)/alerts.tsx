import { useCallback, useEffect, useState } from "react";
import {
  Animated,
  View,
  Text,
  Pressable,
  StyleSheet,
  DeviceEventEmitter,
  Platform,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  AlertCircle,
  AlertTriangle,
  BellOff,
  CheckCheck,
  Info,
  Power,
  Receipt,
  X,
  Zap,
} from "../../components/LucideIcons";
import {
  api,
  ApiAlert,
  ALERTS_CHANGED_EVENT,
  emitAlertsChanged,
  emitDevicesChanged,
  requestMasterShutdown,
} from "../../lib/api";
import ConfirmModal from "../../components/ConfirmModal";
import { PullToRefresh } from "../../components/pull-to-refresh";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";
import { useTheme } from "../../context/ThemeContext";
import { useThemedStyles } from "../../components/themed";
import type { ThemeColors } from "../../constants/theme";

function isTariffAlert(alert: AlertItem): boolean {
  const combined = `${alert.title} ${alert.description} ${alert.recommendation || ""}`.toLowerCase();
  return (
    combined.includes("tariff") ||
    combined.includes("kwh rate") ||
    combined.includes("rate not set") ||
    combined.includes("electricity tariff")
  );
}

function getApplianceCategory(name?: string): string {
  if (!name) return "General";
  const lower = name.toLowerCase();
  if (lower.includes("light") || lower.includes("bulb") || lower.includes("lamp")) return "Lighting";
  if (lower.includes("kettle") || lower.includes("boiler") || lower.includes("heat")) return "Kitchen";
  if (lower.includes("air") || lower.includes("condition") || lower.includes("ac") || lower.includes("cool")) return "Cooling";
  if (lower.includes("refrigerat") || lower.includes("fridge")) return "Kitchen";
  if (lower.includes("phone") || lower.includes("cell") || lower.includes("charg")) return "Electronics";
  if (lower.includes("tv") || lower.includes("entertain")) return "Entertainment";
  return "General";
}

function parseAlertAppliance(alert: AlertItem): { appName: string; watts: number } {
  const title = alert.title || "";
  const desc = alert.description || "";
  const combined = `${title} ${desc}`.toLowerCase();

  let appName = "Light Bulb";
  if (combined.includes("kettle") || combined.includes("boiler")) {
    appName = "Electric Kettle";
  } else if (combined.includes("light") || combined.includes("bulb") || combined.includes("lamp")) {
    appName = "Light Bulb";
  } else if (combined.includes("air") || combined.includes("condition") || combined.includes("ac")) {
    appName = "Air Conditioner";
  } else if (combined.includes("fridge") || combined.includes("refrigerat")) {
    appName = "Refrigerator";
  } else if (combined.includes("phone") || combined.includes("charg")) {
    appName = "Phone Charger";
  } else if (title.includes("Detected")) {
    const raw = title.replace(/Detected/i, "").trim();
    if (raw && !raw.toLowerCase().includes("load") && !raw.toLowerCase().includes("anomaly")) {
      appName = raw;
    }
  }

  let watts = 7;
  const match = desc.match(/(?:~|\(|\s)(\d+(?:\.\d+)?)\s*W/i);
  if (match && match[1]) {
    watts = Math.round(parseFloat(match[1]));
  }

  return { appName, watts };
}

function isLoadDetectionAlert(alert: AlertItem): boolean {
  const combined = `${alert.title} ${alert.description}`.toLowerCase();
  if (alert.title.toLowerCase().includes("anomaly") || alert.type === "critical") {
    return false;
  }
  return (
    combined.includes("detected") ||
    combined.includes("register") ||
    combined.includes("new load") ||
    combined.includes("unregistered") ||
    combined.includes("plug in")
  );
}

type AlertType = "critical" | "warning" | "info";
type FilterTab = "All" | "Unread" | "Critical";
type Section = "TODAY" | "YESTERDAY";

interface AlertItem {
  id: string;
  type: AlertType;
  title: string;
  description: string;
  time: string;
  section: Section;
  read: boolean;
  recommendation?: string;
}

const INITIAL_ALERTS: AlertItem[] = [
  {
    id: "1",
    type: "critical",
    title: "Aircon exceeded 3 kW threshold",
    description: "Sustained draw above the 3,000 W circuit limit. Check thermostat setpoint or compressor load.",
    time: "14:32",
    section: "TODAY",
    read: false,
    recommendation: "Inspect AC filter blockage or raise thermostat setpoint.",
  },
  {
    id: "2",
    type: "warning",
    title: "Circuit B voltage drop: 198 V",
    description: "Supply sagged below the 200 V operating floor (220 V nominal).",
    time: "11:05",
    section: "TODAY",
    read: false,
  },
  {
    id: "3",
    type: "info",
    title: "Daily meter summary recorded",
    description: "Household consumed 12.4 kWh across yesterday's 24-hour window.",
    time: "09:15",
    section: "TODAY",
    read: true,
  },
  {
    id: "4",
    type: "critical",
    title: "Fridge inrush spike: 420 W",
    description: "Compressor drew above expected startup envelope.",
    time: "22:41",
    section: "YESTERDAY",
    read: false,
  },
  {
    id: "5",
    type: "warning",
    title: "Sustained load above 8 kW",
    description: "Whole-home demand stayed above 8 kW for 15 minutes.",
    time: "16:20",
    section: "YESTERDAY",
    read: true,
  },
];

function severityColor(type: AlertType, colors: ThemeColors): string {
  switch (type) {
    case "critical":
      return colors.red;
    case "warning":
      return colors.yellow;
    case "info":
      return colors.accent;
  }
}

function severityLabel(type: AlertType): string {
  switch (type) {
    case "critical":
      return "Critical";
    case "warning":
      return "Warning";
    case "info":
      return "Info";
  }
}

function SeverityIcon({
  type,
  color,
  size,
}: {
  type: AlertType;
  color: string;
  size: number;
}) {
  if (type === "critical") return <AlertCircle size={size} color={color} strokeWidth={2} />;
  if (type === "warning") return <AlertTriangle size={size} color={color} strokeWidth={2} />;
  return <Info size={size} color={color} strokeWidth={2} />;
}

export default function AlertsScreen() {
  const { colors, fontScale } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  const [alerts, setAlerts] = useState<AlertItem[]>(INITIAL_ALERTS);
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [detailAlert, setDetailAlert] = useState<AlertItem | null>(null);
  const [registerAlert, setRegisterAlert] = useState<AlertItem | null>(null);
  const [shutdownConfirmAlert, setShutdownConfirmAlert] = useState<AlertItem | null>(null);
  const [registering, setRegistering] = useState(false);

  const [enterOpacity] = useState(() => new Animated.Value(0));
  const [enterTranslate] = useState(() => new Animated.Value(8));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(enterOpacity, {
        toValue: 1,
        duration: 380,
        useNativeDriver: true,
      }),
      Animated.timing(enterTranslate, {
        toValue: 0,
        duration: 380,
        useNativeDriver: true,
      }),
    ]).start();
  }, [enterOpacity, enterTranslate]);

  const fetchAlerts = useCallback(async () => {
    try {
      const data = await api.get<ApiAlert[]>("/alerts");
      if (data?.length) setAlerts(data);
    } catch {
      // Offline-first: keep seeded INITIAL_ALERTS fallback.
    }
  }, []);

  const { refreshing, onRefresh } = usePullToRefresh(fetchAlerts);

  useFocusEffect(
    useCallback(() => {
      void fetchAlerts();
    }, [fetchAlerts])
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(ALERTS_CHANGED_EVENT, () => {
      void fetchAlerts();
    });
    return () => sub.remove();
  }, [fetchAlerts]);

  const filteredAlerts = alerts.filter((a) => {
    if (activeTab === "Unread") return !a.read;
    if (activeTab === "Critical") return a.type === "critical";
    return true;
  });

  const todayAlerts = filteredAlerts.filter((a) => a.section === "TODAY");
  const yesterdayAlerts = filteredAlerts.filter((a) => a.section === "YESTERDAY");

  const unreadCount = alerts.filter((a) => !a.read).length;
  const criticalCount = alerts.filter((a) => a.type === "critical").length;
  const unreadCriticalCount = alerts.filter(
    (a) => !a.read && a.type === "critical"
  ).length;

  function tabBadgeCount(tab: FilterTab): number {
    if (tab === "All") return alerts.length;
    if (tab === "Unread") return unreadCount;
    return unreadCriticalCount > 0 ? unreadCriticalCount : criticalCount;
  }

  function markAllRead() {
    if (unreadCount === 0) return;
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    api.post("/alerts/read-all").catch(() => {});
    emitAlertsChanged();
  }

  function markRead(id: string) {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, read: true } : a))
    );
    api.patch(`/alerts/${id}/read`).catch(() => {});
    emitAlertsChanged();
  }

  function handleAlertPress(alert: AlertItem) {
    markRead(alert.id);

    // If unregistered load detection, prompt device registration
    if (isLoadDetectionAlert(alert)) {
      setRegisterAlert(alert);
      return;
    }

    // Open detail modal for inspection (System notice / Electrical warning / Critical fault)
    setDetailAlert(alert);
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Animated.View
        style={[
          styles.inner,
          {
            opacity: enterOpacity,
            transform: [{ translateY: enterTranslate }],
          },
        ]}
      >
        {/* Header block */}
        <View style={styles.header}>
          <View style={styles.headerTextCol}>
            <Text style={styles.eyebrow}>Threshold & load event log</Text>
            <Text style={styles.title}>Alerts</Text>
            <Text style={styles.subtitle}>
              {unreadCount === 0
                ? `${alerts.length} recorded events · All read`
                : `${unreadCount} unread${unreadCriticalCount > 0 ? ` · ${unreadCriticalCount} critical` : ""}`}
            </Text>
          </View>

          <Pressable
            onPress={markAllRead}
            disabled={unreadCount === 0}
            style={({ pressed }) => [
              styles.markAllBtn,
              unreadCount === 0 && styles.markAllBtnDisabled,
              pressed && unreadCount > 0 && styles.btnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Mark all alerts read"
            accessibilityState={{ disabled: unreadCount === 0 }}
          >
            <CheckCheck
              size={15 * fontScale}
              color={unreadCount === 0 ? colors.inactive : colors.accent}
              strokeWidth={2.1}
            />
            <Text
              style={[
                styles.markAllText,
                unreadCount === 0 && { color: colors.inactive },
              ]}
            >
              Mark all read
            </Text>
          </Pressable>
        </View>

        {/* Segmented filter control */}
        <View style={styles.filterSegment}>
          {(["All", "Unread", "Critical"] as FilterTab[]).map((tab) => {
            const active = activeTab === tab;
            const count = tabBadgeCount(tab);
            const isCritBadge = tab === "Critical" && unreadCriticalCount > 0;

            return (
              <Pressable
                key={tab}
                style={[styles.filterTab, active && styles.filterTabActive]}
                onPress={() => setActiveTab(tab)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>
                  {tab}
                </Text>
                {count > 0 && (
                  <View
                    style={[
                      styles.filterCountBadge,
                      active && styles.filterCountBadgeActive,
                      isCritBadge && !active && styles.filterCountBadgeCritical,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterCountText,
                        active && styles.filterCountTextActive,
                        isCritBadge && !active && { color: colors.red },
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Feed */}
        {filteredAlerts.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconTile}>
              <BellOff size={22 * fontScale} color={colors.sub} strokeWidth={1.8} />
            </View>
            <Text style={styles.emptyTitle}>
              {activeTab === "Unread"
                ? "No unread alerts"
                : activeTab === "Critical"
                  ? "No critical faults recorded"
                  : "No alerts recorded"}
            </Text>
            <Text style={styles.emptySub}>
              {activeTab === "Unread"
                ? "Every threshold and load notice in your feed has been reviewed."
                : "Voltage drops, over-wattage events, and new load detections appear here."}
            </Text>
          </View>
        ) : (
          <PullToRefresh
            refreshing={refreshing}
            onRefresh={onRefresh}
            contentContainerStyle={styles.scroll}
            indicatorColor={colors.accent}
          >
            {todayAlerts.length > 0 && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionLabel}>Today</Text>
                  <Text style={styles.sectionCount}>{todayAlerts.length}</Text>
                </View>
                {todayAlerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onPress={() => handleAlertPress(alert)}
                  />
                ))}
              </View>
            )}

            {yesterdayAlerts.length > 0 && (
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionLabel}>Earlier</Text>
                  <Text style={styles.sectionCount}>{yesterdayAlerts.length}</Text>
                </View>
                {yesterdayAlerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onPress={() => handleAlertPress(alert)}
                  />
                ))}
              </View>
            )}

            <View style={{ height: 24 }} />
          </PullToRefresh>
        )}
      </Animated.View>

      <AlertDetailModal
        alert={detailAlert}
        onClose={() => setDetailAlert(null)}
        onRequestCutoff={(critAlert) => {
          setDetailAlert(null);
          setShutdownConfirmAlert(critAlert);
        }}
        onOpenTariff={() => {
          setDetailAlert(null);
          router.push("/units-settings");
        }}
      />

      <ConfirmModal
        visible={!!shutdownConfirmAlert}
        destructive
        iconNode={<Power size={20 * fontScale} color={colors.red} strokeWidth={2.2} />}
        title="Disconnect master power?"
        message="This sends an emergency disconnect command to physical relays on all circuits."
        confirmText="Disconnect now"
        cancelText="Keep circuits on"
        onConfirm={async () => {
          try {
            await requestMasterShutdown();
            if (Platform.OS === "ios" || Platform.OS === "android") {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            }
          } catch (err) {
            console.error("Master shutdown failed:", err);
          } finally {
            setShutdownConfirmAlert(null);
          }
        }}
        onCancel={() => setShutdownConfirmAlert(null)}
      />

      {registerAlert &&
        (() => {
          const { appName, watts } = parseAlertAppliance(registerAlert);
          const wattsSuffix = watts ? ` (~${watts} W)` : "";

          return (
            <ConfirmModal
              visible={true}
              iconNode={<Zap size={19 * fontScale} color={colors.accent} strokeWidth={2} />}
              loading={registering}
              title={`Register ${appName}?`}
              message={`Detected an unregistered load matching ${appName}${wattsSuffix}. Add it to your household appliance inventory?`}
              confirmText="Register appliance"
              cancelText="Dismiss"
              onConfirm={async () => {
                try {
                  setRegistering(true);
                  await api.post("/devices", {
                    name: appName,
                    category: getApplianceCategory(appName),
                    room: "Living Room",
                    watts,
                    enabled: true,
                  });
                  markRead(registerAlert.id);
                  if (Platform.OS === "ios" || Platform.OS === "android") {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
                      () => {}
                    );
                  }
                  emitAlertsChanged();
                  emitDevicesChanged();
                  setRegisterAlert(null);
                  router.push("/(tabs)/devices");
                } catch (err) {
                  console.error("Failed to register device from alert:", err);
                  markRead(registerAlert.id);
                  setRegisterAlert(null);
                  router.push({
                    pathname: "/(tabs)/devices",
                    params: {
                      openAdd: "1",
                      initialName: appName,
                      initialWatts: String(watts),
                    },
                  });
                } finally {
                  setRegistering(false);
                }
              }}
              onCancel={() => {
                markRead(registerAlert.id);
                setRegisterAlert(null);
              }}
            />
          );
        })()}
    </SafeAreaView>
  );
}

function AlertCard({
  alert,
  onPress,
}: {
  alert: AlertItem;
  onPress: () => void;
}) {
  const { colors, fontScale } = useTheme();
  const styles = useThemedStyles(createStyles);
  const color = severityColor(alert.type, colors);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        !alert.read && styles.cardUnread,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${severityLabel(alert.type)}: ${alert.title}, ${alert.time}${!alert.read ? ", unread" : ""}`}
    >
      <View style={[styles.cardStripe, { backgroundColor: color }]} />
      <View style={styles.cardContent}>
        <View
          style={[
            styles.iconTile,
            {
              backgroundColor: color + "14",
              borderColor: color + "38",
            },
          ]}
        >
          <SeverityIcon type={alert.type} color={color} size={16 * fontScale} />
        </View>

        <View style={styles.cardBody}>
          <View style={styles.metaTopRow}>
            <Text style={[styles.severityTag, { color }]}>
              {severityLabel(alert.type)}
            </Text>
            <View style={styles.timeCluster}>
              <Text style={styles.alertTime}>{alert.time}</Text>
              {!alert.read && <View style={[styles.unreadDot, { backgroundColor: color }]} />}
            </View>
          </View>

          <Text style={styles.alertTitle} numberOfLines={2}>
            {alert.title}
          </Text>
          <Text style={styles.alertDescription}>{alert.description}</Text>

          {alert.recommendation && (
            <View style={styles.recommendationBox}>
              <Info size={13 * fontScale} color={colors.accent} strokeWidth={2} />
              <Text style={styles.recommendationText}>{alert.recommendation}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function AlertDetailModal({
  alert,
  onClose,
  onRequestCutoff,
  onOpenTariff,
}: {
  alert: AlertItem | null;
  onClose: () => void;
  onRequestCutoff: (alert: AlertItem) => void;
  onOpenTariff: () => void;
}) {
  const { colors, fontScale } = useTheme();
  const styles = useThemedStyles(createStyles);
  if (!alert) return null;

  const color = severityColor(alert.type, colors);
  const isCritical = alert.type === "critical";

  return (
    <Modal
      transparent
      animationType="fade"
      visible={!!alert}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.detailCard}>
          {/* Header row */}
          <View style={styles.detailHeaderRow}>
            <View
              style={[
                styles.detailIconTile,
                { backgroundColor: color + "14", borderColor: color + "38" },
              ]}
            >
              <SeverityIcon type={alert.type} color={color} size={18 * fontScale} />
            </View>

            <View style={styles.detailHeaderMeta}>
              <Text style={[styles.detailTypeLabel, { color }]}>
                {alert.type === "critical"
                  ? "Critical fault"
                  : alert.type === "warning"
                    ? "Electrical warning"
                    : "System notice"}
              </Text>
              <Text style={styles.detailTime}>
                {alert.section === "TODAY" ? "Today" : "Earlier"} · {alert.time}
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.detailCloseBtn, pressed && styles.btnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Close alert details"
            >
              <X size={18 * fontScale} color={colors.sub} strokeWidth={2} />
            </Pressable>
          </View>

          {/* Title & Description */}
          <Text style={styles.detailTitle}>{alert.title}</Text>
          <Text style={styles.detailDesc}>{alert.description}</Text>

          {/* Recommendation / Diagnostic Box */}
          {alert.recommendation ? (
            <View style={styles.detailRecBox}>
              <View style={styles.detailRecHeader}>
                <Info size={13 * fontScale} color={colors.accent} strokeWidth={2} />
                <Text style={styles.detailRecLabel}>Recommended action</Text>
              </View>
              <Text style={styles.detailRecText}>{alert.recommendation}</Text>
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.detailActionsCol}>
            {isTariffAlert(alert) && (
              <Pressable
                style={({ pressed }) => [
                  styles.detailActionBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={onOpenTariff}
                accessibilityRole="button"
                accessibilityLabel="Configure electricity tariff rate"
              >
                <Receipt size={16 * fontScale} color={colors.white} strokeWidth={2.2} />
                <Text style={styles.detailActionBtnText}>Set electricity tariff rate</Text>
              </Pressable>
            )}

            {isCritical && (
              <Pressable
                style={({ pressed }) => [
                  styles.detailDangerBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={() => onRequestCutoff(alert)}
                accessibilityRole="button"
                accessibilityLabel="Cut master power now"
              >
                <Power size={16 * fontScale} color={colors.red} strokeWidth={2.2} />
                <Text style={styles.detailDangerBtnText}>Cut master power now</Text>
              </Pressable>
            )}

            <Pressable
              style={({ pressed }) => [styles.detailDoneBtn, pressed && styles.btnPressed]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Dismiss alert details"
            >
              <Text style={styles.detailDoneBtnText}>
                {alert.type === "info" ? "Close notice" : "Done"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    inner: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 12,
    },

    // Header
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 16,
      gap: 12,
    },
    headerTextCol: {
      flex: 1,
    },
    eyebrow: {
      color: colors.accent,
      fontSize: 12.5 * fontScale,
      fontWeight: "500",
      marginBottom: 2,
    },
    title: {
      color: colors.text,
      fontSize: 26 * fontScale,
      fontWeight: "600",
      letterSpacing: -0.4,
      lineHeight: 32 * fontScale,
    },
    subtitle: {
      color: colors.sub,
      fontSize: 13.5 * fontScale,
      marginTop: 2,
    },
    markAllBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      height: 38,
      paddingHorizontal: 12,
      marginTop: 4,
    },
    markAllBtnDisabled: {
      opacity: 0.55,
    },
    markAllText: {
      color: colors.accent,
      fontSize: 13 * fontScale,
      fontWeight: "600",
    },

    // Segmented Filter Control
    filterSegment: {
      flexDirection: "row",
      backgroundColor: colors.card,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 3,
      gap: 3,
      marginBottom: 16,
    },
    filterTab: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 8,
      borderRadius: 7,
    },
    filterTabActive: {
      backgroundColor: colors.accent,
    },
    filterLabel: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      fontWeight: "600",
    },
    filterLabelActive: {
      color: colors.bg,
      fontWeight: "600",
    },
    filterCountBadge: {
      backgroundColor: colors.surface,
      borderRadius: 5,
      paddingHorizontal: 6,
      paddingVertical: 1,
      minWidth: 20,
      alignItems: "center",
    },
    filterCountBadgeActive: {
      backgroundColor: colors.bg + "28",
    },
    filterCountBadgeCritical: {
      backgroundColor: colors.red + "18",
    },
    filterCountText: {
      color: colors.sub,
      fontSize: 11 * fontScale,
      fontWeight: "600",
    },
    filterCountTextActive: {
      color: colors.bg,
    },

    // Empty state
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingBottom: 56,
      paddingHorizontal: 24,
    },
    emptyIconTile: {
      width: 48,
      height: 48,
      borderRadius: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    emptyTitle: {
      color: colors.text,
      fontSize: 17 * fontScale,
      fontWeight: "600",
    },
    emptySub: {
      color: colors.sub,
      fontSize: 14 * fontScale,
      lineHeight: 20 * fontScale,
      textAlign: "center",
      maxWidth: 300,
    },

    // Feed sections
    scroll: {
      paddingBottom: 12,
    },
    sectionBlock: {
      marginBottom: 14,
    },
    sectionHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
      paddingHorizontal: 2,
    },
    sectionLabel: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      fontWeight: "500",
    },
    sectionCount: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      fontWeight: "500",
    },

    // Alert card
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 10,
      flexDirection: "row",
      overflow: "hidden",
    },
    cardUnread: {
      borderColor: colors.accentBorder,
    },
    cardPressed: {
      opacity: 0.9,
    },
    cardStripe: {
      width: 3,
      alignSelf: "stretch",
    },
    cardContent: {
      flex: 1,
      flexDirection: "row",
      padding: 14,
      gap: 12,
    },
    iconTile: {
      width: 34,
      height: 34,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
      flexShrink: 0,
    },
    cardBody: {
      flex: 1,
    },
    metaTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 3,
    },
    severityTag: {
      fontSize: 12 * fontScale,
      fontWeight: "600",
    },
    timeCluster: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    alertTime: {
      color: colors.sub,
      fontSize: 12 * fontScale,
    },
    unreadDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    alertTitle: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "600",
      letterSpacing: -0.15,
      lineHeight: 20 * fontScale,
    },
    alertDescription: {
      color: colors.sub,
      fontSize: 13.5 * fontScale,
      marginTop: 4,
      lineHeight: 19 * fontScale,
    },
    recommendationBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 6,
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    recommendationText: {
      color: colors.text,
      fontSize: 12.5 * fontScale,
      flex: 1,
      lineHeight: 17.5 * fontScale,
    },

    // Detail Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlayStrong,
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    detailCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 20,
      width: "100%",
      maxWidth: 420,
      borderWidth: 1,
      borderColor: colors.border,
    },
    detailHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 14,
    },
    detailIconTile: {
      width: 38,
      height: 38,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    detailHeaderMeta: {
      flex: 1,
    },
    detailTypeLabel: {
      fontSize: 12 * fontScale,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.3,
    },
    detailTime: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      marginTop: 2,
    },
    detailCloseBtn: {
      width: 32,
      height: 32,
      borderRadius: 6,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    detailTitle: {
      color: colors.text,
      fontSize: 18 * fontScale,
      fontWeight: "600",
      letterSpacing: -0.2,
      lineHeight: 24 * fontScale,
      marginBottom: 8,
    },
    detailDesc: {
      color: colors.sub,
      fontSize: 14 * fontScale,
      lineHeight: 20 * fontScale,
      marginBottom: 16,
    },
    detailRecBox: {
      backgroundColor: colors.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 18,
    },
    detailRecHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 4,
    },
    detailRecLabel: {
      color: colors.accent,
      fontSize: 12 * fontScale,
      fontWeight: "600",
    },
    detailRecText: {
      color: colors.text,
      fontSize: 13 * fontScale,
      lineHeight: 18 * fontScale,
    },
    detailActionsCol: {
      gap: 10,
    },
    detailActionBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 44,
      borderRadius: 8,
      backgroundColor: colors.accent,
    },
    detailActionBtnText: {
      color: colors.white,
      fontSize: 14 * fontScale,
      fontWeight: "600",
    },
    detailDangerBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      height: 44,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.red + "40",
      backgroundColor: colors.red + "12",
    },
    detailDangerBtnText: {
      color: colors.red,
      fontSize: 14 * fontScale,
      fontWeight: "600",
    },
    detailDoneBtn: {
      alignItems: "center",
      justifyContent: "center",
      height: 44,
      borderRadius: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    detailDoneBtnText: {
      color: colors.text,
      fontSize: 14 * fontScale,
      fontWeight: "600",
    },

    btnPressed: {
      opacity: 0.82,
      transform: [{ scale: 0.99 }],
    },
  });
}
