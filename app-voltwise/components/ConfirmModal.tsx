import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const C = {
  card: "#242b3d",
  accent: "#00d4aa",
  text: "#ffffff",
  sub: "#9ca3af",
  border: "#2d3448",
  red: "#ef4444",
};

export interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message?: string;
  /** Primary action label (e.g. "Save", "Sign out"). Defaults to "Yes". */
  confirmText?: string;
  /** Secondary action label (e.g. "Discard", "Cancel"). Defaults to "No". */
  cancelText?: string;
  /** Style the confirm button as a destructive (red) action. */
  destructive?: boolean;
  /** Show a spinner on the confirm button and disable both actions. */
  loading?: boolean;
  /** Optional icon shown above the title. */
  icon?: keyof typeof Ionicons.glyphMap;
  onConfirm: () => void;
  onCancel: () => void;
  /**
   * Called when the backdrop / hardware back dismisses the modal. Falls back to
   * onCancel when omitted. Provide this when a backdrop tap should differ from
   * the explicit cancel action (e.g. "stay editing" vs "discard changes").
   */
  onDismiss?: () => void;
}

/**
 * Reusable two-action confirmation dialog with the app's dark theme. Used for
 * the profile "Save changes?" prompt and the "Sign out" prompt.
 */
export default function ConfirmModal({
  visible,
  title,
  message,
  confirmText = "Yes",
  cancelText = "No",
  destructive = false,
  loading = false,
  icon,
  onConfirm,
  onCancel,
  onDismiss,
}: ConfirmModalProps) {
  const dismiss = onDismiss ?? onCancel;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <Pressable style={styles.backdrop} onPress={dismiss}>
        {/* Inner press handler absorbs taps so they don't dismiss the modal. */}
        <Pressable style={styles.card} onPress={() => {}}>
          {icon && (
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: destructive ? "rgba(239,68,68,0.12)" : "rgba(0,212,170,0.12)" },
              ]}
            >
              <Ionicons name={icon} size={26} color={destructive ? C.red : C.accent} />
            </View>
          )}

          <Text style={styles.title}>{title}</Text>
          {message && <Text style={styles.message}>{message}</Text>}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn]}
              onPress={onCancel}
              activeOpacity={0.8}
              disabled={loading}
            >
              <Text style={styles.cancelText}>{cancelText}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.btn,
                styles.confirmBtn,
                destructive && styles.confirmBtnDestructive,
              ]}
              onPress={onConfirm}
              activeOpacity={0.8}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator
                  size="small"
                  color={destructive ? "#ffffff" : "#1a1f2e"}
                />
              ) : (
                <Text
                  style={[
                    styles.confirmText,
                    destructive && styles.confirmTextDestructive,
                  ]}
                >
                  {confirmText}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 24,
    alignItems: "center",
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    color: C.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },
  message: {
    color: C.sub,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    alignSelf: "stretch",
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: "transparent",
  },
  cancelText: {
    color: C.sub,
    fontSize: 15,
    fontWeight: "700",
  },
  confirmBtn: {
    backgroundColor: C.accent,
  },
  confirmBtnDestructive: {
    backgroundColor: C.red,
  },
  confirmText: {
    color: "#1a1f2e",
    fontSize: 15,
    fontWeight: "700",
  },
  confirmTextDestructive: {
    color: "#ffffff",
  },
});
