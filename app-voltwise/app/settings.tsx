import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

const C = {
  bg: "#1a1f2e",
  card: "#242b3d",
  accent: "#00d4aa",
  text: "#ffffff",
  sub: "#9ca3af",
  border: "#2d3448",
  inactive: "#6b7280",
};

/**
 * A settings entry that is scaffolded but not wired up yet. Each row shows an
 * icon, a title/subtitle and a "Soon" badge; the whole screen is intentionally
 * non-interactive until the underlying features land.
 */
type SettingItem = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
};

type SettingGroup = {
  heading: string;
  items: SettingItem[];
};

const GROUPS: SettingGroup[] = [
  {
    heading: "Preferences",
    items: [
      {
        icon: "notifications-outline",
        title: "Notifications",
        subtitle: "Choose which alerts push to your device",
      },
      {
        icon: "color-palette-outline",
        title: "Appearance",
        subtitle: "Theme, accent color, and text size",
      },
      {
        icon: "speedometer-outline",
        title: "Units & Tariff",
        subtitle: "Energy units and electricity rate",
      },
    ],
  },
  {
    heading: "Data & Devices",
    items: [
      {
        icon: "hardware-chip-outline",
        title: "Sensor & IoT",
        subtitle: "Pair sensors and manage the MQTT bridge",
      },
      {
        icon: "cloud-download-outline",
        title: "Data & Export",
        subtitle: "Download readings and clear local cache",
      },
    ],
  },
  {
    heading: "About",
    items: [
      {
        icon: "shield-checkmark-outline",
        title: "Privacy & Security",
        subtitle: "Sessions, permissions, and account safety",
      },
      {
        icon: "information-circle-outline",
        title: "About VoltWise",
        subtitle: "Version, licenses, and support",
      },
    ],
  },
];

export default function SettingsScreen() {
  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Coming-soon banner */}
        <View style={styles.banner}>
          <Ionicons name="construct-outline" size={18} color={C.accent} />
          <Text style={styles.bannerText}>
            Settings are on the way. These controls are placeholders and will be
            wired up in an upcoming release.
          </Text>
        </View>

        {GROUPS.map((group) => (
          <View key={group.heading} style={styles.group}>
            <Text style={styles.groupHeading}>{group.heading}</Text>
            <View style={styles.card}>
              {group.items.map((item, idx) => (
                <View
                  key={item.title}
                  style={[
                    styles.row,
                    idx < group.items.length - 1 && styles.rowDivider,
                  ]}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name={item.icon} size={20} color={C.sub} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
                  </View>
                  <View style={styles.soonBadge}>
                    <Text style={styles.soonBadgeText}>Soon</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(0,212,170,0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,212,170,0.3)",
    padding: 14,
    marginBottom: 24,
  },
  bannerText: {
    color: C.accent,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  group: {
    marginBottom: 24,
  },
  groupHeading: {
    color: C.sub,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    opacity: 0.65,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  rowSubtitle: {
    color: C.sub,
    fontSize: 12,
    lineHeight: 16,
  },
  soonBadge: {
    backgroundColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  soonBadgeText: {
    color: C.sub,
    fontSize: 11,
    fontWeight: "700",
  },
});
