import { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  DeviceEventEmitter,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiAlert, ALERTS_CHANGED_EVENT } from "../lib/api";

const C = {
  card: "#242b3d",
  accent: "#00d4aa",
  text: "#ffffff",
  red: "#ef4444",
};

/**
 * Shared brand header for the tab screens: the VoltWise wordmark on the left,
 * with an interactive bell (→ Alerts, badged with the unread count) and a
 * profile avatar (→ Profile) on the right. Replaces the native tab header so
 * the in-app logo/profile bar is the single source of truth.
 *
 * Aligns with each screen's `paddingHorizontal: 16` container; the logo's
 * negative left margin optically squares its internal whitespace to that edge.
 */
export default function AppHeader() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  // Keep the bell badge in sync with the alert event bus.
  useEffect(() => {
    const load = () => {
      api
        .get<ApiAlert[]>("/alerts")
        .then((data) => setUnread(data.filter((a) => !a.read).length))
        .catch(() => {});
    };
    load();
    const sub = DeviceEventEmitter.addListener(ALERTS_CHANGED_EVENT, load);
    return () => sub.remove();
  }, []);

  return (
    <View style={styles.header}>
      <Image
        source={require("../assets/images/voltwise-logo.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <View style={styles.icons}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.push("/(tabs)/alerts")}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={
            unread > 0 ? `View alerts, ${unread} unread` : "View alerts"
          }
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="notifications-outline" size={22} color={C.text} />
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.avatar}
          onPress={() => router.push("/profile")}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          <Ionicons name="person-outline" size={18} color={C.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  logo: {
    width: 240,
    height: 72,
    marginLeft: -20,
  },
  icons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBtn: {
    padding: 4,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: C.red,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#1a1f2e",
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.card,
    alignItems: "center",
    justifyContent: "center",
  },
});
