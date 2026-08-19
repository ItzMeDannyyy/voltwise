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
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "./themed";
import type { ThemeColors } from "../constants/theme";

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
  /**
   * Render only the confirm button — for notices that inform rather than ask
   * (e.g. "Master power is off"), where a second choice would be meaningless.
   */
  singleAction?: boolean;
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
 * Reusable two-action confirmation dialog that follows the active theme. Used
 * for the profile "Save changes?" prompt and the "Sign out" prompt.
 */
export default function ConfirmModal({
  visible,
  title,
  message,
  confirmText = "Yes",
  cancelText = "No",
  destructive = false,
  loading = false,
  singleAction = false,
  icon,
  onConfirm,
  onCancel,
  onDismiss,
}: ConfirmModalProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
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
                { backgroundColor: destructive ? colors.red + "1f" : colors.accentSoft },
              ]}
            >
              <Ionicons name={icon} size={26} color={destructive ? colors.red : colors.accent} />
            </View>
          )}

          <Text style={styles.title}>{title}</Text>
          {message && <Text style={styles.message}>{message}</Text>}

          <View style={styles.actions}>
            {!singleAction && (
              <TouchableOpacity
                style={[styles.btn, styles.cancelBtn]}
                onPress={onCancel}
                activeOpacity={0.8}
                disabled={loading}
              >
                <Text style={styles.cancelText}>{cancelText}</Text>
              </TouchableOpacity>
            )}

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
                  color={destructive ? colors.white : colors.bg}
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

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
    },
    card: {
      width: "100%",
      maxWidth: 360,
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
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
      color: colors.text,
      fontSize: 18 * fontScale,
      fontWeight: "700",
      textAlign: "center",
      marginBottom: 6,
    },
    message: {
      color: colors.sub,
      fontSize: 14 * fontScale,
      lineHeight: 20 * fontScale,
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
      borderColor: colors.border,
      backgroundColor: "transparent",
    },
    cancelText: {
      color: colors.sub,
      fontSize: 15 * fontScale,
      fontWeight: "700",
    },
    confirmBtn: {
      backgroundColor: colors.accent,
    },
    confirmBtnDestructive: {
      backgroundColor: colors.red,
    },
    confirmText: {
      color: colors.bg,
      fontSize: 15 * fontScale,
      fontWeight: "700",
    },
    confirmTextDestructive: {
      color: colors.white,
    },
  });
}
