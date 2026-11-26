import React from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
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
  /** Optional legacy Ionicons glyph name shown in the header badge. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Optional custom Lucide SVG element shown in the header badge. */
  iconNode?: React.ReactNode;
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
 * Reusable two-action confirmation dialog that follows the active theme.
 */
export default function ConfirmModal({
  visible,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  destructive = false,
  loading = false,
  singleAction = false,
  icon,
  iconNode,
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
          <View style={styles.topRow}>
            {(iconNode || icon) && (
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: destructive ? colors.red + "14" : colors.surface,
                    borderColor: destructive ? colors.red + "40" : colors.border,
                  },
                ]}
              >
                {iconNode ? (
                  iconNode
                ) : icon ? (
                  <Ionicons
                    name={icon}
                    size={20}
                    color={destructive ? colors.red : colors.accent}
                  />
                ) : null}
              </View>
            )}
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>{title}</Text>
              {message && <Text style={styles.message}>{message}</Text>}
            </View>
          </View>

          <View style={styles.actions}>
            {!singleAction && (
              <Pressable
                style={({ pressed }) => [
                  styles.btn,
                  styles.cancelBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={onCancel}
                disabled={loading}
                accessibilityRole="button"
              >
                <Text style={styles.cancelText}>{cancelText}</Text>
              </Pressable>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.btn,
                styles.confirmBtn,
                destructive && styles.confirmBtnDestructive,
                pressed && !loading && styles.btnPressed,
              ]}
              onPress={onConfirm}
              disabled={loading}
              accessibilityRole="button"
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
            </Pressable>
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
      paddingHorizontal: 24,
    },
    card: {
      width: "100%",
      maxWidth: 380,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 14,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    headerTextWrap: {
      flex: 1,
    },
    title: {
      color: colors.text,
      fontSize: 17 * fontScale,
      fontWeight: "600",
      letterSpacing: -0.2,
      marginBottom: 4,
    },
    message: {
      color: colors.sub,
      fontSize: 14 * fontScale,
      lineHeight: 20 * fontScale,
    },
    actions: {
      flexDirection: "row",
      gap: 10,
      marginTop: 20,
    },
    btn: {
      flex: 1,
      height: 46,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 14,
    },
    btnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.99 }],
    },
    cancelBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    cancelText: {
      color: colors.text,
      fontSize: 14.5 * fontScale,
      fontWeight: "500",
    },
    confirmBtn: {
      backgroundColor: colors.accent,
    },
    confirmBtnDestructive: {
      backgroundColor: colors.red,
    },
    confirmText: {
      color: colors.bg,
      fontSize: 14.5 * fontScale,
      fontWeight: "600",
    },
    confirmTextDestructive: {
      color: colors.white,
    },
  });
}
