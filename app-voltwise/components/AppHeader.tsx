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
import { useNotifications } from "../context/NotificationContext";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "./themed";
import type { ThemeColors } from "../constants/theme";

// The dropdown is deliberately narrow: anchored under the bell in the top-right
// corner, a wide bubble reaches back across the header and buries the logo and
// the icons beside it. These constants translate the "4 visible, then scroll"
// rule into a concrete max height.
const BANNER_HEIGHT = 52;
const BANNER_GAP = 6;
const MAX_VISIBLE = 4;
const LIST_MAX_HEIGHT = BANNER_HEIGHT * MAX_VISIBLE + BANNER_GAP * (MAX_VISIBLE - 1);

function severityColor(type: ApiAlert["type"], colors: ThemeColors): string {
  switch (type) {
    case "critical":
      return colors.red;
    case "warning":
      return colors.yellow;
    case "info":
    default:
      return colors.accent;
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
 * summarizes recent alerts (severity, title, one-line detail, time). It is kept
 * narrow and compact on purpose so it hangs under the icon cluster instead of
 * spreading back over the header. Up to four banners are visible at once;
 * beyond that the list scrolls. A footer jumps to
 * the full Alerts screen. Replaces the native tab header so the in-app
 * logo/profile bar is the single source of truth.
 */
export default function AppHeader() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [alerts, setAlerts] = useState<ApiAlert[]>([]);
  const [open, setOpen] = useState(false);
  // Anchor coordinates measured from the bell so the bubble hangs under it.
  const [anchor, setAnchor] = useState({ top: 72, right: 16 });
  const bellRef = useRef<View>(null);
  const { isAlertVisible } = useNotifications();

  // Muted severities disappear from both the badge and the dropdown list.
  const visibleAlerts = alerts.filter(isAlertVisible);
  const unread = visibleAlerts.filter((a) => !a.read).length;

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
        source={require("../assets/images/voltwise-logo/voltwise-logo-complete.png")}
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
          <Ionicons name="notifications-outline" size={26} color={colors.text} />
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
          <Ionicons name="settings-outline" size={24} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.avatar}
          onPress={() => router.push("/profile")}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
        >
          <Ionicons name="person-outline" size={22} color={colors.text} />
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

            {visibleAlerts.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="notifications-off-outline" size={22} color={colors.sub} />
                <Text style={styles.emptyText}>You&apos;re all caught up</Text>
              </View>
            ) : (
              <ScrollView
                style={{ maxHeight: LIST_MAX_HEIGHT }}
                showsVerticalScrollIndicator={visibleAlerts.length > MAX_VISIBLE}
                contentContainerStyle={styles.list}
              >
                {visibleAlerts.map((a) => {
                  const color = severityColor(a.type, colors);
                  return (
                    <TouchableOpacity
                      key={a.id}
                      style={[styles.banner, !a.read && styles.bannerUnread]}
                      activeOpacity={0.7}
                      onPress={goToAlerts}
                    >
                      <View style={[styles.bannerIcon, { backgroundColor: color + "26" }]}>
                        <Ionicons name={severityIcon(a.type)} size={14} color={color} />
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
              <Ionicons name="chevron-forward" size={14} color={colors.accent} />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
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
      backgroundColor: colors.red,
      borderRadius: 9,
      minWidth: 18,
      height: 18,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
      borderWidth: 2,
      borderColor: colors.bg,
    },
    badgeText: {
      color: colors.white,
      fontSize: 10 * fontScale,
      fontWeight: "700",
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
    },
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
    },
    bubble: {
      position: "absolute",
      // Narrow enough to sit under the icon cluster rather than spanning the
      // whole header width.
      width: 258,
      maxWidth: Dimensions.get("window").width - 32,
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 8,
      paddingTop: 10,
      paddingBottom: 2,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 14,
      elevation: 12,
    },
    pointer: {
      position: "absolute",
      top: -6,
      right: 14,
      width: 12,
      height: 12,
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderColor: colors.border,
      transform: [{ rotate: "45deg" }],
    },
    bubbleHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    bubbleTitle: {
      color: colors.text,
      fontSize: 13 * fontScale,
      fontWeight: "700",
    },
    headerCount: {
      backgroundColor: colors.red + "26",
      borderRadius: 9,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    headerCountText: {
      color: colors.red,
      fontSize: 10 * fontScale,
      fontWeight: "700",
    },
    list: {
      gap: BANNER_GAP,
    },
    banner: {
      height: BANNER_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.bg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 8,
    },
    bannerUnread: {
      borderColor: colors.accent + "66",
    },
    bannerIcon: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
    },
    bannerBody: {
      flex: 1,
    },
    bannerTitle: {
      color: colors.text,
      fontSize: 12 * fontScale,
      fontWeight: "600",
    },
    bannerDesc: {
      color: colors.sub,
      fontSize: 11 * fontScale,
      marginTop: 1,
    },
    bannerTime: {
      color: colors.sub,
      fontSize: 10 * fontScale,
      alignSelf: "flex-start",
      marginTop: 1,
    },
    empty: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 20,
      gap: 6,
    },
    emptyText: {
      color: colors.sub,
      fontSize: 12 * fontScale,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingVertical: 9,
      marginTop: 2,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    footerText: {
      color: colors.accent,
      fontSize: 12 * fontScale,
      fontWeight: "600",
    },
  });
}
