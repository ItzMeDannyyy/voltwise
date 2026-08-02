import { Tabs, Redirect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Platform,
  View,
  Text,
  StyleSheet,
  DeviceEventEmitter,
} from "react-native";
import * as Haptics from "expo-haptics";
import { PlatformPressable } from "@react-navigation/elements";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";
import DemoFab from "../../components/DemoFab";
import ConfirmModal from "../../components/ConfirmModal";
import { api, ApiAlert, ALERTS_CHANGED_EVENT, emitAlertsChanged } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useMqtt } from "../../context/MqttContext";
import { useNotifications } from "../../context/NotificationContext";
import { useTheme } from "../../context/ThemeContext";
import { useThemedStyles } from "../../components/themed";
import type { ThemeColors } from "../../constants/theme";

function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
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

/**
 * Live "new load detected" prompt: when the backend's load detector publishes
 * a new_load event on the MQTT events topic, offer to register the appliance.
 * Confirming jumps to the Devices tab with the add-device form pre-opened.
 * Mounted globally (next to DemoFab) so the prompt appears on any tab.
 */
function NewLoadPrompt() {
  const { lastEvent } = useMqtt();
  const { prefs } = useNotifications();
  const router = useRouter();
  // receivedAt of the event the user already dealt with (one event = one prompt).
  const [handledAt, setHandledAt] = useState<number | null>(null);

  const isNewLoad = lastEvent?.type === "new_load";
  const visible = prefs.newLoadPrompt && isNewLoad && lastEvent.receivedAt !== handledAt;

  // The detector also stored an INFO alert — refresh the tab badge right away.
  // Stays unconditional even when the prompt is muted: this event also drives
  // the alert list and the notification engine's diff.
  useEffect(() => {
    if (isNewLoad) emitAlertsChanged();
  }, [isNewLoad, lastEvent?.receivedAt]);

  if (!visible) return null;

  const wattsLabel =
    lastEvent.deltaWatts !== undefined ? `~${Math.round(lastEvent.deltaWatts)} W` : "A load";

  return (
    <ConfirmModal
      visible
      icon="flash-outline"
      title="New load detected"
      message={`${wattsLabel} just switched on. Add it as a device to track its usage?`}
      confirmText="Add device"
      cancelText="Dismiss"
      onConfirm={() => {
        setHandledAt(lastEvent.receivedAt);
        router.push({ pathname: "/(tabs)/devices", params: { openAdd: "1" } });
      }}
      onCancel={() => setHandledAt(lastEvent.receivedAt)}
    />
  );
}

export default function TabLayout() {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const { colors, fontScale } = useTheme();
  const styles = useThemedStyles(createStyles);

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
