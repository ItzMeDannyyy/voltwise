import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { ScreenContainer, useThemedStyles } from "../components/themed";
import { useTheme } from "../context/ThemeContext";
import {
  FONT_SIZE_LABELS,
  FontSize,
  THEME_MODE_LABELS,
  ThemeColors,
  ThemeMode,
} from "../constants/theme";

/** One navigable settings row: an icon, a title/subtitle, and where it goes. */
type SettingItem = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  href: Href;
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
        subtitle: "Choose which alerts reach your device",
        href: "/notification-settings",
      },
      {
        icon: "speedometer-outline",
        title: "Units & Tariff",
        subtitle: "Energy units and electricity rate",
        href: "/units-settings",
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
        href: "/iot-settings",
      },
      {
        icon: "cloud-download-outline",
        title: "Data & Export",
        subtitle: "Download your data and reset this device",
        href: "/data-settings",
      },
    ],
  },
  {
    heading: "Account",
    items: [
      {
        icon: "shield-checkmark-outline",
        title: "Privacy & Security",
        subtitle: "App lock, signed-in devices, and account safety",
        href: "/privacy-settings",
      },
    ],
  },
  {
    heading: "About",
    items: [
      {
        icon: "information-circle-outline",
        title: "About VoltWise",
        subtitle: "Version, system status, licences and support",
        href: "/about",
      },
    ],
  },
];

const THEME_MODES: ThemeMode[] = ["light", "dark", "system"];
const FONT_SIZES: FontSize[] = ["small", "medium", "large"];

/** Small pill-style multi-choice control used by the Appearance card below. */
function SegmentedControl<T extends string>({
  options,
  labels,
  value,
  onChange,
  styles,
}: {
  options: T[];
  labels: Record<T, string>;
  value: T;
  onChange: (next: T) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.segmentRow}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => onChange(opt)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={labels[opt]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {labels[opt]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function SettingsScreen() {
  const { colors, mode, setMode, fontSize, setFontSize } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  return (
    <ScreenContainer edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Appearance — the one fully working settings card */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Appearance</Text>
          <View style={styles.card}>
            <View style={styles.appearanceRow}>
              <View style={styles.appearanceLabelRow}>
                <Ionicons name="color-palette-outline" size={18} color={colors.sub} />
                <Text style={styles.appearanceLabel}>Theme</Text>
              </View>
              <SegmentedControl
                options={THEME_MODES}
                labels={THEME_MODE_LABELS}
                value={mode}
                onChange={setMode}
                styles={styles}
              />
            </View>
            <View style={[styles.appearanceRow, styles.rowDivider]}>
              <View style={styles.appearanceLabelRow}>
                <Ionicons name="text-outline" size={18} color={colors.sub} />
                <Text style={styles.appearanceLabel}>Text size</Text>
              </View>
              <SegmentedControl
                options={FONT_SIZES}
                labels={FONT_SIZE_LABELS}
                value={fontSize}
                onChange={setFontSize}
                styles={styles}
              />
            </View>
          </View>
        </View>

        {GROUPS.map((group) => (
          <View key={group.heading} style={styles.group}>
            <Text style={styles.groupHeading}>{group.heading}</Text>
            <View style={styles.card}>
              {group.items.map((item, idx) => (
                <Pressable
                  key={item.title}
                  style={[styles.row, idx < group.items.length - 1 && styles.rowDivider]}
                  onPress={() => router.push(item.href)}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name={item.icon} size={20} color={colors.sub} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.sub} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    scroll: {
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    group: {
      marginBottom: 24,
    },
    groupHeading: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      fontWeight: "700",
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: 10,
      marginLeft: 4,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    rowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    rowBody: {
      flex: 1,
    },
    rowTitle: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "600",
      marginBottom: 2,
    },
    rowSubtitle: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 16 * fontScale,
    },
    appearanceRow: {
      paddingHorizontal: 16,
      paddingVertical: 16,
      gap: 12,
    },
    appearanceLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    appearanceLabel: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "600",
    },
    segmentRow: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 3,
      gap: 3,
    },
    segment: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    segmentActive: {
      backgroundColor: colors.accent,
    },
    segmentText: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      fontWeight: "600",
    },
    segmentTextActive: {
      color: colors.bg,
      fontWeight: "700",
    },
  });
}
