import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  DeviceEventEmitter,
  Modal,
  Pressable,
  ScrollView,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiAlert, ALERTS_CHANGED_EVENT } from "../lib/api";

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

// The dropdown shows up to 5 banners at full height, then scrolls. These
// constants translate that "5 visible" rule into a concrete max height.
const BANNER_HEIGHT = 66;
const BANNER_GAP = 8;
const MAX_VISIBLE = 5;
const LIST_MAX_HEIGHT = BANNER_HEIGHT * MAX_VISIBLE + BANNER_GAP * (MAX_VISIBLE - 1);

function severityColor(type: ApiAlert["type"]): string {
  switch (type) {
    case "critical":
      return C.red;
    case "warning":
      return C.yellow;
    case "info":
    default:
      return C.accent;
  }
}

function severityIcon(type: ApiAlert["type"]): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case "critical":
      return "alert-circle";
    case "warning":
      return "warning";
    case "info":
    default:
      return "information-circle";
  }
}

/**
 * Shared brand header for the tab screens: the VoltWise wordmark on the left,
 * with an interactive bell and a profile avatar (→ Profile) on the right.
 *
 * Tapping the bell opens a message-bubble dropdown anchored under the icon that
 * summarizes recent alerts (severity, title, one-line detail, time). Up to five
 * banners are visible at once; beyond that the list scrolls. A footer jumps to
 * the full Alerts screen. Replaces the native tab header so the in-app
 * logo/profile bar is the single source of truth.
 */
export default function AppHeader() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<ApiAlert[]>([]);
  const [open, setOpen] = useState(false);
  // Anchor coordinates measured from the bell so the bubble hangs under it.
  const [anchor, setAnchor] = useState({ top: 72, right: 16 });
  const bellRef = useRef<View>(null);

  const unread = alerts.filter((a) => !a.read).length;

  // Keep the bell badge + dropdown contents in sync with the alert event bus.
  useEffect(() => {
    const load = () => {
      api
        .get<ApiAlert[]>("/alerts")
        .then((data) => setAlerts(data))
        .catch(() => {});
    };
    load();
    const sub = DeviceEventEmitter.addListener(ALERTS_CHANGED_EVENT, load);
    return () => sub.remove();
  }, []);

  const openDropdown = () => {
    const node = bellRef.current;
    if (node) {
      node.measureInWindow((x, y, w, h) => {
        setAnchor({
          top: y + h + 8,
          right: Dimensions.get("window").width - (x + w),
        });
        setOpen(true);
      });
    } else {
      setOpen(true);
    }
  };

  const goToAlerts = () => {
    setOpen(false);
    router.push("/(tabs)/alerts");
  };

  return (
    <View style={styles.header}>
      <Image
        source={require("../assets/images/voltwise-logo.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <View style={styles.icons}>
        <TouchableOpacity
          ref={bellRef}
          style={styles.iconBtn}
          onPress={openDropdown}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={
            unread > 0 ? `View alerts, ${unread} unread` : "View alerts"
          }
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="notifications-outline" size={26} color={C.text} />
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.push("/settings")}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="settings-outline" size={24} color={C.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.avatar}
          onPress={() => router.push("/profile")}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          <Ionicons name="person-outline" size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        {/* Tapping the dimmed backdrop closes the bubble. */}
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* Stop propagation so taps inside the bubble don't dismiss it. */}
          <Pressable
            style={[styles.bubble, { top: anchor.top, right: anchor.right }]}
            onPress={() => {}}
          >
            {/* Little pointer that ties the bubble back to the bell. */}
            <View style={styles.pointer} />

            <View style={styles.bubbleHeader}>
              <Text style={styles.bubbleTitle}>Notifications</Text>
              {unread > 0 && (
                <View style={styles.headerCount}>
                  <Text style={styles.headerCountText}>{unread} new</Text>
                </View>
              )}
            </View>

            {alerts.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="notifications-off-outline" size={24} color={C.sub} />
                <Text style={styles.emptyText}>You&apos;re all caught up</Text>
              </View>
            ) : (
              <ScrollView
                style={{ maxHeight: LIST_MAX_HEIGHT }}
                showsVerticalScrollIndicator={alerts.length > MAX_VISIBLE}
                contentContainerStyle={styles.list}
              >
                {alerts.map((a) => {
                  const color = severityColor(a.type);
                  return (
                    <TouchableOpacity
                      key={a.id}
                      style={[styles.banner, !a.read && styles.bannerUnread]}
                      activeOpacity={0.7}
                      onPress={goToAlerts}
                    >
                      <View style={[styles.bannerIcon, { backgroundColor: color + "26" }]}>
                        <Ionicons name={severityIcon(a.type)} size={16} color={color} />
                      </View>
                      <View style={styles.bannerBody}>
                        <Text style={styles.bannerTitle} numberOfLines={1}>
                          {a.title}
                        </Text>
                        <Text style={styles.bannerDesc} numberOfLines={1}>
                          {a.description}
                        </Text>
                      </View>
                      <Text style={styles.bannerTime}>{a.time}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.footer}
              onPress={goToAlerts}
              activeOpacity={0.7}
            >
              <Text style={styles.footerText}>View all alerts</Text>
              <Ionicons name="chevron-forward" size={14} color={C.accent} />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.card,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  bubble: {
    position: "absolute",
    width: 320,
    maxWidth: Dimensions.get("window").width - 24,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  pointer: {
    position: "absolute",
    top: -7,
    right: 18,
    width: 14,
    height: 14,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: C.border,
    transform: [{ rotate: "45deg" }],
  },
  bubbleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  bubbleTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: "700",
  },
  headerCount: {
    backgroundColor: C.red + "26",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  headerCountText: {
    color: C.red,
    fontSize: 11,
    fontWeight: "700",
  },
  list: {
    gap: BANNER_GAP,
  },
  banner: {
    height: BANNER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 10,
  },
  bannerUnread: {
    borderColor: C.accent + "66",
  },
  bannerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerBody: {
    flex: 1,
  },
  bannerTitle: {
    color: C.text,
    fontSize: 13,
    fontWeight: "600",
  },
  bannerDesc: {
    color: C.sub,
    fontSize: 12,
    marginTop: 2,
  },
  bannerTime: {
    color: C.sub,
    fontSize: 11,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    gap: 8,
  },
  emptyText: {
    color: C.sub,
    fontSize: 13,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  footerText: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "600",
  },
});
