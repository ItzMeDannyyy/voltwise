import { Tabs, Redirect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Platform,
  View,
  Text,
  StyleSheet,
  DeviceEventEmitter,
  Pressable,
} from "react-native";
import * as Haptics from "expo-haptics";
import DemoFab from "../../components/DemoFab";
import ConfirmModal from "../../components/ConfirmModal";
import PowerControlModal from "../../components/PowerControlModal";
import { api, ApiAlert, ALERTS_CHANGED_EVENT, emitAlertsChanged, emitDevicesChanged } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useMqtt } from "../../context/MqttContext";
import { useNotifications } from "../../context/NotificationContext";
import { usePowerControl } from "../../context/PowerControlContext";
import { useTheme } from "../../context/ThemeContext";
import { useThemedStyles } from "../../components/themed";
import type { ThemeColors } from "../../constants/theme";

function HapticTab(props: any) {
  return (
    <Pressable
      {...props}
      onPressIn={(ev) => {
        if (Platform.OS === "ios") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}

function AlertsBadge() {
  const [count, setCount] = useState(0);
  const styles = useThemedStyles(createStyles);
  // isAlertVisible, not shouldNotify: quiet hours silences interruptions but
  // must never blank the badge — that would hide alerts rather than mute them.
  const { isAlertVisible } = useNotifications();

  useEffect(() => {
    const load = () => {
      api
        .get<ApiAlert[]>("/alerts")
        .then((data) => setCount(data.filter((a) => !a.read && isAlertVisible(a)).length))
        .catch(() => {});
    };
    load();
    const sub = DeviceEventEmitter.addListener(ALERTS_CHANGED_EVENT, load);
    return () => sub.remove();
  }, [isAlertVisible]);

  if (count <= 0) return null;

  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

function getApplianceIcon(name?: string): keyof typeof Ionicons.glyphMap {
  if (!name) return "flash-outline";
  const n = name.toLowerCase();
  if (n.includes("kettle") || n.includes("boiler") || n.includes("heat")) return "cafe-outline";
  if (n.includes("light") || n.includes("bulb") || n.includes("lamp")) return "bulb-outline";
  if (n.includes("air") || n.includes("condition") || n.includes("cool") || n.includes("ac")) return "snow-outline";
  if (n.includes("fridge") || n.includes("refrigerat")) return "cube-outline";
  if (n.includes("phone") || n.includes("cell") || n.includes("charg")) return "phone-portrait-outline";
  if (n.includes("tv") || n.includes("entertain")) return "tv-outline";
  if (n.includes("wash") || n.includes("laundry")) return "water-outline";
  return "flash-outline";
}

function cleanApplianceName(name?: string): string {
  if (!name) return "Appliance";
  const lower = name.toLowerCase();
  if (lower.includes("light") || lower.includes("bulb") || lower.includes("lamp")) return "Light Bulb";
  if (lower.includes("kettle") || lower.includes("boiler") || lower.includes("heat")) return "Electric Kettle";
  if (lower.includes("air") || lower.includes("condition") || lower.includes("ac") || lower.includes("cool")) return "Air Conditioner";
  if (lower.includes("refrigerat") || lower.includes("fridge")) return "Refrigerator";
  if (lower.includes("phone") || lower.includes("cell") || lower.includes("charg")) return "Phone Charger";
  if (lower.includes("tv") || lower.includes("entertain")) return "Television";
  if (name.includes("/")) {
    const parts = name.split("/").map((p) => p.trim());
    return parts[0] || name;
  }
  return name;
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

/**
 * Live appliance & load detection prompt: when the backend publishes
 * an appliance_detected or new_load event on the MQTT events topic,
 * notify the user with a tailored modal.
 * Mounted globally (next to DemoFab) so the prompt appears on any tab.
 */
function NewLoadPrompt() {
  const { lastEvent } = useMqtt();
  const { prefs } = useNotifications();
  const router = useRouter();
  // receivedAt of the event the user already dealt with (one event = one prompt).
  const [handledAt, setHandledAt] = useState<number | null>(null);
  const [registering, setRegistering] = useState(false);

  const isPromptable =
    lastEvent?.type === "new_load" || lastEvent?.type === "appliance_detected";
  const visible =
    prefs.newLoadPrompt && isPromptable && lastEvent?.receivedAt !== handledAt;

  // The detector also stored an INFO alert — refresh the tab badge right away.
  useEffect(() => {
    if (isPromptable) emitAlertsChanged();
  }, [isPromptable, lastEvent?.receivedAt]);

  if (!visible || !lastEvent) return null;

  const watts =
    lastEvent.deltaWatts !== undefined ? Math.round(lastEvent.deltaWatts) : undefined;
  const wattsSuffix = watts !== undefined ? ` (~${watts} W)` : "";
  const appName = cleanApplianceName(lastEvent.dominantAppliance);
  const deviceName = lastEvent.deviceName || appName;
  const icon = getApplianceIcon(lastEvent.dominantAppliance || lastEvent.deviceName);

  // 1. Registered device detected (e.g. Living Room Lights turned ON)
  if (lastEvent.type === "appliance_detected" || lastEvent.isRegistered) {
    return (
      <ConfirmModal
        visible
        icon={icon}
        title={`${deviceName} is ON`}
        message={`VoltWise ML detected that your ${deviceName} (${appName}${wattsSuffix}) was turned ON.`}
        confirmText="View devices"
        cancelText="OK"
        onConfirm={() => {
          setHandledAt(lastEvent.receivedAt);
          router.push("/(tabs)/devices");
        }}
        onCancel={() => setHandledAt(lastEvent.receivedAt)}
      />
    );
  }

  // 2. Anomaly detected
  if (lastEvent.isAnomaly) {
    return (
      <ConfirmModal
        visible
        icon="warning-outline"
        title="Electrical Anomaly Detected"
        message={
          lastEvent.interpretation ||
          `Unusual electrical load${wattsSuffix} detected on your circuit. Check connected equipment.`
        }
        confirmText="View alerts"
        cancelText="Dismiss"
        destructive
        onConfirm={() => {
          setHandledAt(lastEvent.receivedAt);
          router.push("/(tabs)/alerts");
        }}
        onCancel={() => setHandledAt(lastEvent.receivedAt)}
      />
    );
  }

  // 3. Unregistered new load detected (prompt to register as device)
  return (
    <ConfirmModal
      visible
      icon={icon}
      loading={registering}
      title={`${appName} Detected`}
      message={`VoltWise ML detected a ${appName}${wattsSuffix}. Do you want to register this device?`}
      confirmText="Yes"
      cancelText="Dismiss"
      onConfirm={async () => {
        try {
          setRegistering(true);
          await api.post("/devices", {
            name: appName,
            category: getApplianceCategory(appName),
            room: "Living Room",
            watts: Math.round(watts || 7),
            enabled: true,
          });
          if (Platform.OS === "ios" || Platform.OS === "android") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          }
          emitAlertsChanged();
          emitDevicesChanged();
          setHandledAt(lastEvent.receivedAt);
          router.push("/(tabs)/devices");
        } catch (err) {
          console.error("Failed to register device:", err);
          // If automatic creation fails, navigate to the manual form
          setHandledAt(lastEvent.receivedAt);
          router.push({
            pathname: "/(tabs)/devices",
            params: {
              openAdd: "1",
              initialName: appName,
              initialWatts: watts !== undefined ? String(watts) : undefined,
            },
          });
        } finally {
          setRegistering(false);
        }
      }}
      onCancel={() => setHandledAt(lastEvent.receivedAt)}
    />
  );
}

function CenterPowerTabButton({
  onPress,
  masterOn,
}: {
  onPress: () => void;
  masterOn: boolean;
}) {
  const { colors, fontScale } = useTheme();
  const styles = useThemedStyles(createCenterButtonStyles);

  return (
    <Pressable
      style={styles.container}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel="Power control dual-line management"
      accessibilityHint="Opens modal to control high-load, low-load, and master power"
    >
      <View
        style={[
          styles.circle,
          {
            backgroundColor: masterOn ? colors.accentSoft : colors.red + "1A",
            borderColor: masterOn ? colors.accent : colors.red,
            shadowColor: masterOn ? colors.accent : colors.red,
          },
        ]}
      >
        <Ionicons
          name="power"
          size={22}
          color={masterOn ? colors.accent : colors.red}
        />
      </View>
      <Text
        style={[
          styles.label,
          { color: masterOn ? colors.accent : colors.sub },
        ]}
      >
        Power
      </Text>
    </Pressable>
  );
}

export default function TabLayout() {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const { colors, fontScale } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { masterOn, isModalVisible, openModal, closeModal } = usePowerControl();

  // Auth gate for the protected group: kick back to login on sign-out / 401
  // without requiring an app reload.
  if (!isBootstrapping && !isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inactive,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 84 : 64,
          paddingBottom: Platform.OS === "ios" ? 24 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11 * fontScale,
          fontWeight: "500",
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="devices"
        options={{
          title: "Devices",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="hardware-chip-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="power"
        options={{
          title: "Power",
          tabBarButton: () => (
            <CenterPowerTabButton
              onPress={openModal}
              masterOn={masterOn}
            />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            openModal();
          },
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="notifications-outline" size={size} color={color} />
              <AlertsBadge />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: "Analytics",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
      />
      </Tabs>
      <DemoFab />
      <NewLoadPrompt />
      <PowerControlModal visible={isModalVisible} onClose={closeModal} />
    </View>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    badge: {
      position: "absolute",
      top: -4,
      right: -8,
      backgroundColor: colors.red,
      borderRadius: 8,
      minWidth: 16,
      height: 16,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 3,
    },
    badgeText: {
      color: colors.white,
      fontSize: 10 * fontScale,
      fontWeight: "700",
      lineHeight: 14,
    },
  });
}

function createCenterButtonStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      top: Platform.OS === "ios" ? -12 : -8,
    },
    circle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1.5,
      alignItems: "center",
      justifyContent: "center",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 5,
      elevation: 5,
    },
    label: {
      fontSize: 10 * fontScale,
      fontWeight: "600",
      marginTop: 2,
    },
  });
}
