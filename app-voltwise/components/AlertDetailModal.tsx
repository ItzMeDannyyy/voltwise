import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

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

/**
 * Shape of an alert the detail modal can render. Kept structurally compatible
 * with both the local `AlertItem` on the Alerts screen and the `ApiAlert`
 * returned by the backend so either can be passed straight through.
 */
export interface AlertDetail {
  type: "critical" | "warning" | "info";
  title: string;
  description: string;
  time: string;
  section: "TODAY" | "YESTERDAY";
  read: boolean;
  recommendation?: string;
}

function severityColor(type: AlertDetail["type"]): string {
  switch (type) {
    case "critical": return C.red;
    case "warning":  return C.yellow;
    case "info":     return C.accent;
  }
}

function severityIcon(type: AlertDetail["type"]): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case "critical": return "alert-circle";
    case "warning":  return "warning";
    case "info":     return "information-circle";
  }
}

function severityLabel(type: AlertDetail["type"]): string {
  switch (type) {
    case "critical": return "Critical";
    case "warning":  return "Warning";
    case "info":     return "Information";
  }
}

/** Plain-language explanation of what each severity level means for the user. */
function severityMeaning(type: AlertDetail["type"]): string {
  switch (type) {
    case "critical":
      return "Requires your attention now. A device or circuit is operating well outside safe limits and may waste energy or risk damage if left unchecked.";
    case "warning":
      return "Worth reviewing soon. Readings are drifting outside their normal range but are not yet dangerous.";
    case "info":
      return "For your awareness only. A routine update or report — no action needed.";
  }
}

/** Human-friendly label for when the alert was recorded. */
function whenLabel(alert: AlertDetail): string {
  const day = alert.section === "TODAY" ? "Today" : "Yesterday";
  return `${day} at ${alert.time}`;
}

export function AlertDetailModal({
  alert,
  onClose,
  onMarkRead,
}: {
  /** The alert to display, or `null` to keep the modal hidden. */
  alert: AlertDetail | null;
  /** Dismiss the modal without any side effects. */
  onClose: () => void;
  /** Mark the alert as read (only shown while the alert is unread). */
  onMarkRead: () => void;
}) {
  if (!alert) return null;

  const color = severityColor(alert.type);
  const icon = severityIcon(alert.type);

  return (
    <Modal
      transparent
      animationType="slide"
      visible
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Tapping the dimmed backdrop closes the sheet. */}
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        {/* Stop taps inside the sheet from bubbling up to the backdrop. */}
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <View style={styles.grabber} />

          {/* Header — severity, status and close affordance. */}
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: color + "26" }]}>
              <Ionicons name={icon} size={26} color={color} />
            </View>
            <View style={styles.headerText}>
              <View style={styles.badgeRow}>
                <View style={[styles.severityPill, { backgroundColor: color + "26" }]}>
                  <Text style={[styles.severityPillText, { color }]}>
                    {severityLabel(alert.type)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: alert.read ? C.border : color },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: alert.read ? C.sub : "#fff" },
                    ]}
                  >
                    {alert.read ? "Read" : "Unread"}
                  </Text>
                </View>
              </View>
              <View style={styles.whenRow}>
                <Ionicons name="time-outline" size={13} color={C.sub} />
                <Text style={styles.whenText}>{whenLabel(alert)}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={C.sub} />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>{alert.title}</Text>

          <ScrollView
            style={styles.body}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.bodyContent}
          >
            {/* What happened */}
            <Section label="What happened">
              <Text style={styles.paragraph}>{alert.description}</Text>
            </Section>

            {/* Recommended action — only when the backend supplied one. */}
            {alert.recommendation && (
              <Section label="Recommended action">
                <View style={[styles.callout, { borderColor: C.accent + "55" }]}>
                  <Ionicons
                    name="bulb-outline"
                    size={18}
                    color={C.accent}
                    style={styles.calloutIcon}
                  />
                  <Text style={styles.calloutText}>{alert.recommendation}</Text>
                </View>
              </Section>
            )}

            {/* Why this severity — helps the user gauge urgency. */}
            <Section label={`Why this is a ${severityLabel(alert.type).toLowerCase()}`}>
              <Text style={styles.paragraph}>{severityMeaning(alert.type)}</Text>
            </Section>
          </ScrollView>

          {/* Footer actions */}
          <View style={styles.footer}>
            {!alert.read && (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={onMarkRead}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark-done" size={18} color={C.bg} />
                <Text style={styles.primaryBtnText}>Mark as read</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.secondaryBtn, alert.read && styles.secondaryBtnFull]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

/** A labelled block within the modal body. */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    maxHeight: "88%",
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.border,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
    gap: 6,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  severityPill: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  severityPillText: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  statusPill: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  whenRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  whenText: {
    color: C.sub,
    fontSize: 13,
  },
  closeBtn: {
    padding: 2,
  },
  title: {
    color: C.text,
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 27,
    marginTop: 16,
  },
  body: {
    marginTop: 4,
  },
  bodyContent: {
    paddingTop: 12,
    paddingBottom: 8,
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    color: C.sub,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  paragraph: {
    color: C.text,
    fontSize: 15,
    lineHeight: 22,
  },
  callout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: C.accent + "14",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  calloutIcon: {
    marginTop: 1,
    flexShrink: 0,
  },
  calloutText: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    lineHeight: 21,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 15,
  },
  primaryBtnText: {
    color: C.bg,
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.border,
    borderRadius: 14,
    paddingVertical: 15,
  },
  secondaryBtnFull: {
    flex: 1,
  },
  secondaryBtnText: {
    color: C.text,
    fontSize: 15,
    fontWeight: "700",
  },
});
