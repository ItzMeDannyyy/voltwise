import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  Linking,
  Platform,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { PullToRefresh } from "../components/pull-to-refresh";
import { ScreenContainer, useThemedStyles } from "../components/themed";
import { useMqtt } from "../context/MqttContext";
import { useTheme } from "../context/ThemeContext";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { API_BASE_URL, checkHealth } from "../lib/api";
import {
  APP_NAME,
  APP_SUMMARY,
  APP_TAGLINE,
  ISSUES_URL,
  OPEN_SOURCE,
  PROJECT_CONTEXT,
  PROJECT_LAYERS,
  PROJECT_URL,
  SAFETY_NOTICE,
  describeBuild,
  diagnosticsReport,
  readBuildSource,
  type LayerId,
} from "../lib/about-info";
import { LINK_LABELS, brokerLabel, linkHealth, type LinkHealth } from "../lib/iot-prefs";
import type { ThemeColors } from "../constants/theme";

/**
 * About VoltWise — the screen behind that Settings row.
 *
 * An About screen is usually a version number and a wall of credits. This one
 * also answers the question people actually open it for: *is the thing working,
 * and what do I tell whoever is helping me?* So the four tiers are listed with
 * their real, live status — the server is pinged, the sensor link is judged the
 * same way the Sensor & IoT screen judges it, and the model service honestly
 * says it is not connected yet — and every fact needed to diagnose a problem
 * can be shared as text rather than photographed.
 *
 * Nothing here is decorative-only: the licence list is read off the packages
 * that are genuinely installed, and the safety notice is on the screen because
 * this app can open a relay on live mains.
 */

/** Icons live here rather than in lib/about-info.ts, which stays UI-free. */
const LAYER_ICONS: Record<LayerId, keyof typeof Ionicons.glyphMap> = {
  app: "phone-portrait-outline",
  server: "server-outline",
  sensor: "hardware-chip-outline",
  ml: "sparkles-outline",
};

type Tone = "good" | "warn" | "bad" | "muted";

/** Where a "something is wrong" reader should be sent next. */
const HELP_LINKS: { icon: keyof typeof Ionicons.glyphMap; title: string; hint: string; href: Href }[] =
  [
    {
      icon: "pulse-outline",
      title: "Sensor not reporting?",
      hint: "Check the link, re-pair a board, read the raw channels",
      href: "/iot-settings",
    },
    {
      icon: "cloud-download-outline",
      title: "Your data",
      hint: "Export everything, or reset what this device keeps",
      href: "/data-settings",
    },
    {
      icon: "shield-checkmark-outline",
      title: "Privacy & security",
      hint: "App lock, signed-in devices, account deletion",
      href: "/privacy-settings",
    },
  ];

export default function AboutScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { configured, connected, deviceOnline, telemetryAt, deviceUid, brokerUrl } = useMqtt();

  /** Read once: none of it changes while the screen is open. */
  const build = useMemo(() => describeBuild(readBuildSource()), []);

  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Ticks so the sensor verdict ages out instead of freezing at "Live". */
  const [now, setNow] = useState(() => Date.now());

  const pingServer = useCallback(async () => {
    setServerOk(await checkHealth());
  }, []);

  const { refreshing, onRefresh } = usePullToRefresh(pingServer);

  useEffect(() => {
    void pingServer();
    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(tick);
  }, [pingServer]);

  // ---- Derived ----

  const health: LinkHealth = linkHealth({
    configured,
    appConnected: connected,
    deviceOnline,
    telemetryAt,
    now,
  });

  const broker = brokerLabel(brokerUrl);

  const serverStatus =
    serverOk === null ? "Checking…" : serverOk ? "Reachable" : "Unreachable";

  const layerStatus: Record<LayerId, { value: string; tone: Tone }> = {
    app: { value: build.version, tone: "muted" },
    server: {
      value: serverStatus,
      tone: serverOk === null ? "muted" : serverOk ? "good" : "bad",
    },
    sensor: {
      value: LINK_LABELS[health],
      tone: health === "live" ? "good" : health === "unconfigured" ? "muted" : "warn",
    },
    ml: { value: "Not connected", tone: "muted" },
  };

  // ---- Actions ----

  const openUrl = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {
      setNotice(`Could not open a browser. The address is ${url}`);
    });
  }, []);

  /**
   * Web has no Share sheet worth the name here, and react-native-web does not
   * implement Share at all — the row is simply absent there rather than being a
   * button that fails.
   */
  const shareDiagnostics = useCallback(() => {
    const report = diagnosticsReport({
      build,
      apiBaseUrl: API_BASE_URL,
      serverStatus,
      broker,
      sensorUid: deviceUid,
      sensorStatus: LINK_LABELS[health],
      generatedAt: new Date(),
    });

    Share.share({ message: report }).catch(() => {
      setNotice("Sharing is unavailable on this device.");
    });
  }, [build, serverStatus, broker, deviceUid, health]);

  // ---- Render ----

  return (
    <ScreenContainer edges={["bottom"]}>
      <PullToRefresh
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={styles.scroll}
      >
        {/* ---- Identity ---- */}
        <View style={styles.hero}>
          <Image
            source={require("../assets/images/voltwise-logo/voltwise-logo.png")}
            style={styles.heroLogo}
            resizeMode="contain"
          />
          <Text style={styles.heroTitle}>{APP_NAME}</Text>
          <Text style={styles.heroTagline}>{APP_TAGLINE}</Text>
          <View style={styles.versionPill}>
            <Text style={styles.versionPillText}>{build.versionLine}</Text>
          </View>
        </View>

        <Text style={styles.summary}>{APP_SUMMARY}</Text>

        {/* ---- The system, and whether it is up ---- */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>How it fits together</Text>
          <View style={styles.card}>
            {PROJECT_LAYERS.map((layer, idx) => {
              const status = layerStatus[layer.id];
              return (
                <View key={layer.id} style={[styles.row, idx > 0 && styles.rowDivider]}>
                  <View style={styles.rowIcon}>
                    <Ionicons name={LAYER_ICONS[layer.id]} size={18} color={colors.sub} />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{layer.title}</Text>
                    <Text style={styles.rowSubtitle}>{layer.description}</Text>
                  </View>
                  <Text style={[styles.rowValue, { color: toneColor(status.tone, colors) }]}>
                    {status.value}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.footnote}>
            Pull down to re-check. The sensor verdict is the same one the Sensor &amp; IoT screen
            uses — telemetry has to be arriving, not merely promised.
          </Text>
        </View>

        {/* ---- The facts a support message needs ---- */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>This build</Text>
          <View style={styles.card}>
            <InfoRow styles={styles} label="Version" value={build.version} />
            <InfoRow styles={styles} label="Build" value={build.mode} />
            <InfoRow styles={styles} label="Runtime" value={build.runtime} />
            <InfoRow styles={styles} label="Platform" value={build.platform} />
            {build.deviceName !== null && (
              <InfoRow styles={styles} label="Device" value={build.deviceName} />
            )}
            <InfoRow styles={styles} label="Server" value={API_BASE_URL} />
            <InfoRow styles={styles} label="Broker" value={broker ?? "Not configured"} />
            <InfoRow styles={styles} label="Sensor ID" value={deviceUid} />

            {Platform.OS !== "web" && (
              <Pressable
                style={[styles.row, styles.rowDivider]}
                onPress={shareDiagnostics}
                accessibilityRole="button"
                accessibilityLabel="Share diagnostics"
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="share-outline" size={18} color={colors.accent} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: colors.accent }]}>
                    Share diagnostics
                  </Text>
                  <Text style={styles.rowSubtitle}>
                    Sends this card as text — addresses only, no password or account details
                  </Text>
                </View>
              </Pressable>
            )}
          </View>
        </View>

        {/* ---- Where to go when something is wrong ---- */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Help &amp; feedback</Text>
          <View style={styles.card}>
            {HELP_LINKS.map((link, idx) => (
              <Pressable
                key={link.title}
                style={[styles.row, idx > 0 && styles.rowDivider]}
                onPress={() => router.push(link.href)}
                accessibilityRole="button"
                accessibilityLabel={link.title}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name={link.icon} size={18} color={colors.sub} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{link.title}</Text>
                  <Text style={styles.rowSubtitle}>{link.hint}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.sub} />
              </Pressable>
            ))}

            <Pressable
              style={[styles.row, styles.rowDivider]}
              onPress={() => openUrl(ISSUES_URL)}
              accessibilityRole="link"
              accessibilityLabel="Report an issue"
            >
              <View style={styles.rowIcon}>
                <Ionicons name="bug-outline" size={18} color={colors.sub} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Report an issue</Text>
                <Text style={styles.rowSubtitle}>Opens the project&apos;s issue tracker</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.sub} />
            </Pressable>

            <Pressable
              style={[styles.row, styles.rowDivider]}
              onPress={() => openUrl(PROJECT_URL)}
              accessibilityRole="link"
              accessibilityLabel="View the source code"
            >
              <View style={styles.rowIcon}>
                <Ionicons name="logo-github" size={18} color={colors.sub} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>View the source</Text>
                <Text style={styles.rowSubtitle}>
                  App, server, firmware and model service in one repository
                </Text>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.sub} />
            </Pressable>
          </View>
        </View>

        {/* ---- Safety ---- */}
        <View style={styles.safetyCard}>
          <Ionicons name="warning-outline" size={18} color={colors.amber} />
          <Text style={styles.safetyText}>{SAFETY_NOTICE}</Text>
        </View>

        {/* ---- Credits ---- */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Open source</Text>
          {OPEN_SOURCE.map((group) => (
            <View key={group.id} style={styles.licenseGroup}>
              <Text style={styles.subHeading}>{group.title}</Text>
              <View style={styles.card}>
                {group.components.map((component, idx) => (
                  <View
                    key={component.name}
                    style={[styles.row, idx > 0 && styles.rowDivider]}
                  >
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{component.name}</Text>
                      <Text style={styles.rowSubtitle}>{component.role}</Text>
                    </View>
                    <Text style={styles.licenseBadge}>{component.license}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
          <Text style={styles.footnote}>
            Every component above is used under its own licence, which travels with the package
            rather than being reproduced here. Versions are deliberately left out — they change
            with every install, and a stale notice is worse than none.
          </Text>
        </View>

        {notice !== null && (
          <View style={styles.banner}>
            <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
            <Text style={styles.bannerText}>{notice}</Text>
            <Pressable
              onPress={() => setNotice(null)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <Ionicons name="close" size={18} color={colors.accent} />
            </Pressable>
          </View>
        )}

        <Text style={styles.credit}>{PROJECT_CONTEXT}</Text>
        <Text style={styles.credit}>
          © {new Date().getFullYear()} the {APP_NAME} team
        </Text>

        <View style={{ height: 32 }} />
      </PullToRefresh>
    </ScreenContainer>
  );
}

function toneColor(tone: Tone, colors: ThemeColors): string {
  switch (tone) {
    case "good":
      return colors.green;
    case "warn":
      return colors.amber;
    case "bad":
      return colors.red;
    default:
      return colors.sub;
  }
}

/** Key/value line for the build card, matching the Sensor & IoT diagnostics. */
function InfoRow({
  styles,
  label,
  value,
}: {
  styles: ReturnType<typeof createStyles>;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">
        {value}
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    scroll: {
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    // ---- Hero ----
    hero: {
      alignItems: "center",
      paddingVertical: 8,
      gap: 6,
    },
    heroLogo: {
      width: 96,
      height: 108,
    },
    heroTitle: {
      color: colors.text,
      fontSize: 24 * fontScale,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    heroTagline: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      textAlign: "center",
    },
    versionPill: {
      marginTop: 6,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    versionPillText: {
      color: colors.accent,
      fontSize: 12 * fontScale,
      fontWeight: "700",
    },
    summary: {
      color: colors.sub,
      fontSize: 14 * fontScale,
      lineHeight: 21 * fontScale,
      textAlign: "center",
      marginTop: 16,
      marginBottom: 28,
    },
    // ---- Groups and cards ----
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
    subHeading: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      fontWeight: "600",
      marginBottom: 8,
      marginLeft: 4,
    },
    licenseGroup: {
      marginBottom: 16,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    // ---- Rows ----
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
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
    },
    rowSubtitle: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 16 * fontScale,
      marginTop: 2,
    },
    rowValue: {
      fontSize: 13 * fontScale,
      fontWeight: "700",
    },
    licenseBadge: {
      color: colors.sub,
      fontSize: 11 * fontScale,
      fontWeight: "700",
      backgroundColor: colors.surface,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      overflow: "hidden",
    },
    footnote: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 17 * fontScale,
      marginTop: 8,
      marginLeft: 4,
    },
    // ---- Build facts ----
    infoRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 16,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    infoLabel: {
      color: colors.sub,
      fontSize: 12 * fontScale,
    },
    infoValue: {
      color: colors.text,
      fontSize: 12 * fontScale,
      fontWeight: "600",
      flexShrink: 1,
      textAlign: "right",
    },
    // ---- Safety ----
    safetyCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 24,
    },
    safetyText: {
      color: colors.text,
      fontSize: 12 * fontScale,
      lineHeight: 17 * fontScale,
      flex: 1,
    },
    // ---- Notice ----
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.accentSoft,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      padding: 14,
      marginBottom: 16,
    },
    bannerText: {
      color: colors.accent,
      fontSize: 13 * fontScale,
      lineHeight: 18 * fontScale,
      flex: 1,
    },
    credit: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 17 * fontScale,
      textAlign: "center",
    },
  });
}
