import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAppLock } from "../context/AppLockContext";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "./themed";
import type { ThemeColors } from "../constants/theme";

/**
 * The screen the app lock puts in front of everything.
 *
 * Rendered above the navigator rather than as a route, so it covers whatever
 * the user was last looking at without disturbing navigation state — they come
 * back to the same screen they left, not to a reset stack.
 *
 * It prompts once by itself on appearing, because an extra tap to reach the
 * fingerprint sheet is pure friction. After that the user drives: a failed or
 * cancelled prompt leaves the "Unlock" button, and "Sign out" is always
 * offered. That escape hatch is not decoration — it is the only way out for
 * someone whose face has stopped being recognised, and it is safe because it
 * ends the session rather than opening it.
 */
export default function AppLockOverlay() {
  const { isLocked, unlock, methodLabel } = useAppLock();
  const { signOut } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // One automatic prompt per lock. Without this guard the prompt re-fires on
  // every re-render caused by its own state changes.
  const promptedRef = useRef(false);

  const attempt = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const ok = await unlock();
      if (!ok) setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [unlock]);

  useEffect(() => {
    if (!isLocked) {
      promptedRef.current = false;
      setFailed(false);
      return;
    }

    if (promptedRef.current) return;
    promptedRef.current = true;
    void attempt();
  }, [isLocked, attempt]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.replace("/(auth)/login");
  }, [signOut, router]);

  if (!isLocked) return null;

  return (
    <Modal visible transparent={false} animationType="fade" statusBarTranslucent>
      <View style={styles.root}>
        <View style={styles.badge}>
          <Ionicons name="lock-closed" size={38} color={colors.accent} />
        </View>

        <Text style={styles.title}>VoltWise is locked</Text>
        <Text style={styles.subtitle}>
          {failed
            ? "Not verified. Try again, or sign out to use a password instead."
            : methodLabel}
        </Text>

        <Pressable
          style={[styles.unlockBtn, busy && styles.unlockBtnBusy]}
          onPress={() => void attempt()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Unlock VoltWise"
          accessibilityState={{ busy, disabled: busy }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.bg} />
          ) : (
            <>
              <Ionicons name="finger-print" size={20} color={colors.bg} />
              <Text style={styles.unlockText}>Unlock</Text>
            </>
          )}
        </Pressable>

        <Pressable
          style={styles.signOutBtn}
          onPress={() => void handleSignOut()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Sign out instead"
        >
          <Text style={styles.signOutText}>Sign out instead</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
    },
    badge: {
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 22,
    },
    title: {
      color: colors.text,
      fontSize: 22 * fontScale,
      fontWeight: "800",
      marginBottom: 8,
      textAlign: "center",
    },
    subtitle: {
      color: colors.sub,
      fontSize: 14 * fontScale,
      lineHeight: 20 * fontScale,
      textAlign: "center",
      marginBottom: 28,
    },
    unlockBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      alignSelf: "stretch",
      maxWidth: 320,
      height: 52,
      borderRadius: 14,
      backgroundColor: colors.accent,
    },
    unlockBtnBusy: {
      opacity: 0.7,
    },
    unlockText: {
      color: colors.bg,
      fontSize: 16 * fontScale,
      fontWeight: "800",
    },
    signOutBtn: {
      marginTop: 16,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    signOutText: {
      color: colors.sub,
      fontSize: 14 * fontScale,
      fontWeight: "600",
    },
  });
}
