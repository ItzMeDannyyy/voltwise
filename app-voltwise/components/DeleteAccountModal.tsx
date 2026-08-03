import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "./themed";
import type { ThemeColors } from "../constants/theme";

/**
 * The last thing between someone and a deleted account.
 *
 * Two gates, on purpose, because they stop different mistakes. The password
 * stops the wrong *person* — a phone left unlocked on a table already holds a
 * valid token, so "are you signed in?" is not evidence of anything. Typing
 * DELETE stops the wrong *tap*: it is the only control here that cannot be hit
 * by accident while scrolling.
 *
 * Ordinary ConfirmModal is not enough for this, and the text entry is why it
 * lives in a modal rather than inline on the screen — a keyboard opening over a
 * scrolling settings page is how a destructive button ends up under a thumb.
 */

/** What the user has to type to arm the button. Compared case-sensitively. */
export const DELETE_CONFIRM_WORD = "DELETE";

interface DeleteAccountModalProps {
  visible: boolean;
  /** Shown so it is unmistakable *which* account is about to go. */
  email: string;
  busy: boolean;
  /** Server-side failure from the last attempt, e.g. a wrong password. */
  error: string | null;
  onCancel: () => void;
  onConfirm: (password: string) => void;
}

export default function DeleteAccountModal({
  visible,
  email,
  busy,
  error,
  onCancel,
  onConfirm,
}: DeleteAccountModalProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [password, setPassword] = useState("");
  const [confirmWord, setConfirmWord] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Clear on every open. A password left sitting in state after a cancel is
  // both a small hazard and a confusing half-filled form on the way back in.
  useEffect(() => {
    if (!visible) {
      setPassword("");
      setConfirmWord("");
      setShowPassword(false);
    }
  }, [visible]);

  const armed = password.length > 0 && confirmWord === DELETE_CONFIRM_WORD && !busy;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={busy ? () => {} : onCancel}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="trash-outline" size={26} color={colors.red} />
            </View>

            <Text style={styles.title}>Delete this account?</Text>
            <Text style={styles.message}>
              Everything under <Text style={styles.email}>{email}</Text> goes: your readings,
              devices, alerts, rooms, billing history and electricity rate. This cannot be
              undone, and support cannot restore it.
            </Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Your password</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="key-outline" size={18} color={colors.inactive} />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.inactive}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  editable={!busy}
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={colors.inactive}
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>
                Type {DELETE_CONFIRM_WORD} to confirm
              </Text>
              <View style={styles.inputWrap}>
                <Ionicons name="create-outline" size={18} color={colors.inactive} />
                <TextInput
                  style={styles.input}
                  value={confirmWord}
                  onChangeText={setConfirmWord}
                  placeholder={DELETE_CONFIRM_WORD}
                  placeholderTextColor={colors.inactive}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!busy}
                />
              </View>
            </View>

            {error !== null && (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.red} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable
              style={[styles.deleteBtn, !armed && styles.deleteBtnDisabled]}
              onPress={() => onConfirm(password)}
              disabled={!armed}
              accessibilityRole="button"
              accessibilityLabel="Permanently delete my account"
              accessibilityState={{ disabled: !armed, busy }}
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.deleteText}>Permanently delete</Text>
              )}
            </Pressable>

            <Pressable
              style={styles.cancelBtn}
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Keep my account"
            >
              <Text style={styles.cancelText}>Keep my account</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlayStrong,
    },
    scroll: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingVertical: 32,
    },
    card: {
      width: "100%",
      maxWidth: 400,
      alignSelf: "center",
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 22,
    },
    iconWrap: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.red + "1f",
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      marginBottom: 14,
    },
    title: {
      color: colors.text,
      fontSize: 18 * fontScale,
      fontWeight: "800",
      textAlign: "center",
      marginBottom: 8,
    },
    message: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      lineHeight: 19 * fontScale,
      textAlign: "center",
      marginBottom: 18,
    },
    email: {
      color: colors.text,
      fontWeight: "700",
    },
    field: {
      marginBottom: 14,
    },
    fieldLabel: {
      color: colors.sub,
      fontSize: 11 * fontScale,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 8,
    },
    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      height: 50,
    },
    input: {
      flex: 1,
      color: colors.text,
      fontSize: 15 * fontScale,
      height: 50,
    },
    errorRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    errorText: {
      color: colors.red,
      fontSize: 13 * fontScale,
      lineHeight: 18 * fontScale,
      flex: 1,
    },
    deleteBtn: {
      height: 50,
      borderRadius: 12,
      backgroundColor: colors.red,
      alignItems: "center",
      justifyContent: "center",
    },
    deleteBtnDisabled: {
      opacity: 0.4,
    },
    deleteText: {
      color: colors.white,
      fontSize: 15 * fontScale,
      fontWeight: "800",
    },
    cancelBtn: {
      height: 46,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 6,
    },
    cancelText: {
      color: colors.sub,
      fontSize: 14 * fontScale,
      fontWeight: "700",
    },
  });
}
