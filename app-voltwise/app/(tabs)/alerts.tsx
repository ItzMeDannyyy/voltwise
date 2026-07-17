import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  DeviceEventEmitter,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  api,
  ApiAlert,
  ALERTS_CHANGED_EVENT,
  emitAlertsChanged,
  requestMasterShutdown,
} from "../../lib/api";
import { AnomalyModal } from "../../components/AnomalyModal";

const C = {
  bg: "#1a1f2e",
  card: "#242b3d",
  accent: "#00d4aa",
  text: "#ffffff",
  sub: "#9ca3af",
  border: "#2d3448",
  yellow: "#f59e0b",
  red: "#ef4444",
};

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
    description: "Abnormal consumption recorded. Thermostat set point might be too low.",
    time: "14:32",
    section: "TODAY",
    read: false,
    recommendation: "Check AC thermostat settings or filter blockage.",
  },
  {
    id: "2",
    type: "warning",
    title: "Circuit B voltage drop: 198V",
    description: "Voltage dropped below 200V limit.",
    time: "11:05",
    section: "TODAY",
    read: false,
  },
  {
    id: "3",
    type: "info",
    title: "Daily energy report ready",
    description: "You used 12.4 kWh yesterday.",
    time: "09:15",
    section: "TODAY",
    read: true,
  },
  {
    id: "4",
    type: "critical",
    title: "Fridge power spike: 420W",
    description: "Compressor drew abnormal power during startup phase.",
    time: "22:41",
    section: "YESTERDAY",
    read: false,
  },
  {
    id: "5",
    type: "warning",
    title: "High consumption detected",
    description: "Total usage exceeded 8 kW for 15 minutes.",
    time: "16:20",
    section: "YESTERDAY",
    read: true,
  },
];

function severityColor(type: AlertType): string {
  switch (type) {
    case "critical":
      return C.red;
    case "warning":
      return C.yellow;
    case "info":
      return C.accent;
  }
}

function severityIcon(type: AlertType): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case "critical":
      return "alert-circle";
    case "warning":
      return "warning";
    case "info":
      return "information-circle";
  }
}

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<AlertItem[]>(INITIAL_ALERTS);
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [modalAlert, setModalAlert] = useState<AlertItem | null>(null);
  const [countdown, setCountdown] = useState(3);
  const [powerOff, setPowerOff] = useState(false);

  // Load the alert feed from the backend.
  const loadAlerts = useCallback(() => {
    api
      .get<ApiAlert[]>("/alerts")
      .then((data) => {
        if (data?.length) setAlerts(data);
      })
      .catch(() => {
        // Offline-first: keep the seeded INITIAL_ALERTS fallback.
      });
  }, []);

  // Refetch every time the Alerts tab gains focus.
  useFocusEffect(
    useCallback(() => {
      loadAlerts();
    }, [loadAlerts])
  );

  // Refresh in place when a demo alert is triggered while already on this tab.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(ALERTS_CHANGED_EVENT, loadAlerts);
    return () => sub.remove();
  }, [loadAlerts]);

  // Countdown timer for critical/warning modal. Reaching zero performs the
  // same real relay shutdown as pressing TURN OFF NOW.
  useEffect(() => {
    if (!modalAlert || modalAlert.type === "info" || powerOff) return;
    if (countdown <= 0) {
      setPowerOff(true);
      void requestMasterShutdown();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [modalAlert, countdown, powerOff]);

  const filteredAlerts = alerts.filter((a) => {
    if (activeTab === "Unread") return !a.read;
    if (activeTab === "Critical") return a.type === "critical";
    return true;
  });

  const todayAlerts = filteredAlerts.filter((a) => a.section === "TODAY");
  const yesterdayAlerts = filteredAlerts.filter((a) => a.section === "YESTERDAY");

  // Unread counters used for the filter-tab badges.
  const unreadCount = alerts.filter((a) => !a.read).length;
  const unreadCriticalCount = alerts.filter(
    (a) => !a.read && a.type === "critical"
  ).length;

  function tabBadgeCount(tab: FilterTab): number {
    if (tab === "Critical") return unreadCriticalCount;
    return unreadCount;
  }

  function markAllRead() {
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

  function openModal(alert: AlertItem) {
    setModalAlert(alert);
    setCountdown(3);
    setPowerOff(false);
  }

  function closeModal(doMarkRead = true) {
    if (doMarkRead && modalAlert) markRead(modalAlert.id);
    setModalAlert(null);
  }

  function handlePowerOff() {
    setPowerOff(true);
    // Real shutdown: the backend publishes relay/set { on: false } and the
    // firmware latches power off (dashboard Master Power turns it back on).
    void requestMasterShutdown();
    setTimeout(() => closeModal(true), 1500);
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.title}>Alerts</Text>
          <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
            <Text style={styles.markAllText}>Mark all{"\n"}read</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tabRow}>
          {(["All", "Unread", "Critical"] as FilterTab[]).map((tab) => {
            const count = tabBadgeCount(tab);
            return (
              <TouchableOpacity
                key={tab}
                style={styles.tab}
                onPress={() => setActiveTab(tab)}
              >
                <View style={styles.tabLabelRow}>
                  <Text
                    style={[
                      styles.tabLabel,
                      activeTab === tab && styles.tabLabelActive,
                    ]}
                  >
                    {tab}
                  </Text>
                  {count > 0 && (
                    <View
                      style={[
                        styles.tabCountBadge,
                        tab === "Critical" && styles.tabCountBadgeCritical,
                      ]}
                    >
                      <Text style={styles.tabCountText}>{count}</Text>
                    </View>
                  )}
                </View>
                {activeTab === tab && <View style={styles.tabIndicator} />}
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.tabSeparator} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {todayAlerts.length > 0 && (
            <View>
              <Text style={styles.sectionLabel}>• TODAY</Text>
              {todayAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onPress={() => openModal(alert)}
                />
              ))}
            </View>
          )}

          {yesterdayAlerts.length > 0 && (
            <View>
              <Text style={styles.sectionLabel}>• YESTERDAY</Text>
              {yesterdayAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onPress={() => openModal(alert)}
                />
              ))}
            </View>
          )}

          <View style={{ height: 16 }} />
        </ScrollView>
      </View>

      <AnomalyModal
        alert={modalAlert}
        countdown={countdown}
        powerOff={powerOff}
        onPowerOff={handlePowerOff}
        onSkip={() => closeModal(true)}
      />
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
  const color = severityColor(alert.type);
  const icon = severityIcon(alert.type);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.cardStripe, { backgroundColor: color }]} />
      <View style={styles.cardContent}>
        <View style={[styles.iconCircle, { backgroundColor: color + "26" }]}>
          <Ionicons name={icon} size={16} color={color} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.titleRow}>
            <Text style={styles.alertTitle} numberOfLines={2}>
              {alert.title}
            </Text>
            <Text style={styles.alertTime}>{alert.time}</Text>
          </View>
          <Text style={styles.alertDescription}>{alert.description}</Text>
          {alert.recommendation && (
            <View style={styles.recommendationRow}>
              <Ionicons
                name="information-circle"
                size={14}
                color={C.accent}
                style={styles.recommendationIcon}
              />
              <Text style={styles.recommendationText}>
                {alert.recommendation}
              </Text>
            </View>
          )}
        </View>
      </View>
      {!alert.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
}


const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    color: C.text,
    fontSize: 28,
    fontWeight: "700",
  },
  markAllBtn: {
    paddingTop: 4,
  },
  markAllText: {
    color: C.accent,
    fontSize: 13,
    textAlign: "right",
    lineHeight: 18,
  },
  tabRow: {
    flexDirection: "row",
    gap: 24,
  },
  tab: {
    paddingBottom: 8,
    position: "relative",
  },
  tabLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tabLabel: {
    color: C.sub,
    fontSize: 15,
    fontWeight: "500",
  },
  tabLabelActive: {
    color: C.text,
    fontWeight: "600",
  },
  tabCountBadge: {
    backgroundColor: C.sub,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  tabCountBadgeCritical: {
    backgroundColor: C.red,
  },
  tabCountText: {
    color: C.bg,
    fontSize: 11,
    fontWeight: "700",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: C.accent,
    borderRadius: 1,
  },
  tabSeparator: {
    height: 1,
    backgroundColor: C.border,
    marginBottom: 20,
  },
  scroll: {
    paddingBottom: 8,
  },
  sectionLabel: {
    color: C.sub,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 4,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    marginBottom: 10,
    flexDirection: "row",
    overflow: "hidden",
  },
  cardStripe: {
    width: 4,
    borderRadius: 2,
  },
  cardContent: {
    flex: 1,
    flexDirection: "row",
    padding: 14,
    gap: 12,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  alertTitle: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  alertTime: {
    color: C.sub,
    fontSize: 12,
    flexShrink: 0,
    marginTop: 2,
  },
  alertDescription: {
    color: C.sub,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  recommendationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 6,
    gap: 4,
  },
  recommendationIcon: {
    marginTop: 1,
    flexShrink: 0,
  },
  recommendationText: {
    color: C.accent,
    fontSize: 12,
    flex: 1,
    lineHeight: 17,
  },
  unreadDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.red,
  },

});
