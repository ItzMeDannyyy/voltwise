import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Eye,
  EyeOff,
  Gauge,
  Lock,
  LogOut,
  Mail,
  Pencil,
  ShieldCheck,
  User,
  X,
} from "../components/LucideIcons";
import { useAuth } from "../context/AuthContext";
import { useMqtt } from "../context/MqttContext";
import { useTheme } from "../context/ThemeContext";
import { useUnits } from "../context/UnitsContext";
import ConfirmModal from "../components/ConfirmModal";
import { useThemedStyles } from "../components/themed";
import { LINK_LABELS, linkHealth } from "../lib/iot-prefs";
import type { ThemeColors } from "../constants/theme";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ─── Helpers ────────────────────────────────────────────────────── */
function getInitials(name: string, email: string): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0][0].toUpperCase();
  }
  return (email ?? "?").charAt(0).toUpperCase();
}

function formatCreatedAt(iso?: string): string {
  if (!iso) return "Active session";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "Active session";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type FocusedField = "name" | "email" | "currentPw" | "newPw" | null;

/* ─── Main screen ────────────────────────────────────────────────── */
export default function ProfileScreen() {
  const { user, signOut, updateProfile } = useAuth();
  const { formatRate, currency, prefs } = useUnits();
  const { configured, connected, deviceOnline, telemetryAt, deviceUid } = useMqtt();
  const router = useRouter();
  const { colors, fontScale } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [focusedField, setFocusedField] = useState<FocusedField>(null);

  // Field-level errors — checked on submit
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [currentPwError, setCurrentPwError] = useState<string | null>(null);
  const [newPwError, setNewPwError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [enterOpacity] = useState(() => new Animated.Value(0));
  const [enterTranslate] = useState(() => new Animated.Value(10));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    Animated.parallel([
      Animated.timing(enterOpacity, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
      Animated.timing(enterTranslate, {
        toValue: 0,
        duration: 420,
        useNativeDriver: true,
      }),
    ]).start();

    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(tick);
  }, [enterOpacity, enterTranslate]);

  const isDirty =
    name.trim() !== (user?.name ?? "") ||
    email.trim() !== (user?.email ?? "") ||
    currentPassword.length > 0 ||
    newPassword.length > 0;

  function clearFieldErrors() {
    setNameError(null);
    setEmailError(null);
    setCurrentPwError(null);
    setNewPwError(null);
  }

  function resetFields() {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setCurrentPassword("");
    setNewPassword("");
    clearFieldErrors();
  }

  function enterEdit() {
    resetFields();
    setError(null);
    setSuccess(null);
    setEditing(true);
  }

  function requestCancelEdit() {
    if (isDirty) {
      setShowSaveModal(true);
    } else {
      setEditing(false);
      setError(null);
      setSuccess(null);
      clearFieldErrors();
    }
  }

  function discardAndExit() {
    resetFields();
    setError(null);
    setShowSaveModal(false);
    setEditing(false);
  }

  function validateForm(): boolean {
    let valid = true;
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setNameError("Write the display name for this account.");
      valid = false;
    } else {
      setNameError(null);
    }

    if (!trimmedEmail) {
      setEmailError("Write the email address for this account.");
      valid = false;
    } else if (!EMAIL_REGEX.test(trimmedEmail)) {
      setEmailError("Write an email address with an @ and a domain.");
      valid = false;
    } else {
      setEmailError(null);
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        setNewPwError("New password must be at least 6 characters.");
        valid = false;
      } else {
        setNewPwError(null);
      }

      if (!currentPassword) {
        setCurrentPwError("Enter your current password to confirm the change.");
        valid = false;
      } else {
        setCurrentPwError(null);
      }
    } else {
      setNewPwError(null);
      setCurrentPwError(null);
    }

    return valid;
  }

  async function handleSave(): Promise<boolean> {
    if (!validateForm()) return false;

    const trimmedEmail = email.trim();
    const previousUser = {
      name: user?.name ?? "",
      email: user?.email ?? "",
    };

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const dto: Record<string, string> = {
        name: name.trim(),
        email: trimmedEmail,
      };
      if (newPassword) {
        dto.currentPassword = currentPassword;
        dto.newPassword = newPassword;
      }

      await updateProfile(dto);

      const changedPassword = Boolean(newPassword);
      setCurrentPassword("");
      setNewPassword("");
      clearFieldErrors();
      setSuccess(
        changedPassword
          ? "Profile and password saved. Other signed-in devices have been revoked."
          : "Account details saved."
      );
      setEditing(false);
      return true;
    } catch (err: unknown) {
      setName(previousUser.name);
      setEmail(previousUser.email);

      const msg =
        err instanceof Error ? err.message : "Could not save profile changes.";
      if (msg.includes("401") || msg.toLowerCase().includes("incorrect")) {
        setCurrentPwError("Current password did not match this account.");
      } else if (msg.includes("409") || msg.toLowerCase().includes("already")) {
        setEmailError("That email address is already registered to another account.");
      } else {
        setError(msg);
      }
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmSave() {
    await handleSave();
    setShowSaveModal(false);
  }

  async function handleConfirmSignOut() {
    setSigningOut(true);
    await signOut();
    setShowLogoutModal(false);
    router.replace("/(auth)/login");
  }

  const initials = getInitials(user?.name ?? "", user?.email ?? "");
  const createdLabel = formatCreatedAt(user?.createdAt);
  const sensorHealth = linkHealth({
    configured,
    appConnected: connected,
    deviceOnline,
    telemetryAt,
    now,
  });
  const sensorTone =
    sensorHealth === "live"
      ? colors.green
      : sensorHealth === "stale"
        ? colors.amber
        : colors.sub;

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.content,
              {
                opacity: enterOpacity,
                transform: [{ translateY: enterTranslate }],
              },
            ]}
          >
            {/* ── Identity summary block (left-aligned, no glow/purple ring) ── */}
            <View style={styles.identityCard}>
              <View style={styles.identityTopRow}>
                <View style={styles.initialTile}>
                  <Text style={styles.initialTileText}>{initials}</Text>
                </View>

                <View style={styles.identityBody}>
                  <Text style={styles.identityName} numberOfLines={1}>
                    {user?.name || "Unnamed account"}
                  </Text>
                  <Text style={styles.identityEmail} numberOfLines={1}>
                    {user?.email || "—"}
                  </Text>
                </View>

                {!editing && (
                  <Pressable
                    onPress={enterEdit}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={({ pressed }) => [
                      styles.editHeaderBtn,
                      pressed && styles.btnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Edit account details"
                  >
                    <Pencil size={14 * fontScale} color={colors.accent} strokeWidth={2} />
                    <Text style={styles.editHeaderBtnText}>Edit</Text>
                  </Pressable>
                )}
              </View>

              {/* Fact strip: Account ID + Registered date + Active rate */}
              <View style={styles.identityFactsRow}>
                <View style={styles.factCell}>
                  <Text style={styles.factLabel}>Account ID</Text>
                  <Text style={styles.factValue}>#{user?.id ?? "—"}</Text>
                </View>
                <View style={styles.factDivider} />
                <View style={styles.factCell}>
                  <Text style={styles.factLabel}>Tariff rate</Text>
                  <Text style={styles.factValue}>{formatRate()}</Text>
                </View>
                <View style={styles.factDivider} />
                <View style={styles.factCell}>
                  <Text style={styles.factLabel}>Registered</Text>
                  <Text style={styles.factValue} numberOfLines={1}>
                    {createdLabel}
                  </Text>
                </View>
              </View>
            </View>

            {/* ── Status banners ──────────────────────────────────────────── */}
            {error && (
              <View style={styles.errorBanner} role="alert">
                <AlertCircle size={16 * fontScale} color={colors.red} strokeWidth={2} />
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            )}
            {success && (
              <View style={styles.successBanner} role="status">
                <CheckCircle2 size={16 * fontScale} color={colors.green} strokeWidth={2.2} />
                <Text style={styles.successBannerText}>{success}</Text>
              </View>
            )}

            {/* ── Read-only state: Account record & Household meter config ── */}
            {!editing ? (
              <>
                <View style={styles.group}>
                  <Text style={styles.groupHeading}>Account record</Text>
                  <View style={styles.card}>
                    <View style={styles.row}>
                      <View style={styles.rowIcon}>
                        <User size={17 * fontScale} color={colors.sub} strokeWidth={1.9} />
                      </View>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowLabel}>Full name</Text>
                        <Text style={styles.rowValue}>{user?.name || "—"}</Text>
                      </View>
                    </View>

                    <View style={[styles.row, styles.rowDivider]}>
                      <View style={styles.rowIcon}>
                        <Mail size={17 * fontScale} color={colors.sub} strokeWidth={1.9} />
                      </View>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowLabel}>Email address</Text>
                        <Text style={styles.rowValue} numberOfLines={1}>
                          {user?.email || "—"}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.row, styles.rowDivider]}>
                      <View style={styles.rowIcon}>
                        <Calendar size={17 * fontScale} color={colors.sub} strokeWidth={1.9} />
                      </View>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowLabel}>Account opened</Text>
                        <Text style={styles.rowValue}>{createdLabel}</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={styles.group}>
                  <Text style={styles.groupHeading}>Meter & security</Text>
                  <View style={styles.card}>
                    <Pressable
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                      onPress={() => router.push("/units-settings")}
                      accessibilityRole="button"
                      accessibilityLabel="Open Units and Tariff settings"
                    >
                      <View style={styles.rowIcon}>
                        <Gauge size={17 * fontScale} color={colors.sub} strokeWidth={1.9} />
                      </View>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowTitle}>Tariff & display units</Text>
                        <Text style={styles.rowSubtitle}>
                          {formatRate()} · {currency.code} ({currency.symbol}) · {prefs.powerUnit} / {prefs.energyUnit}
                        </Text>
                      </View>
                      <ChevronRight size={16 * fontScale} color={colors.sub} strokeWidth={2} />
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [
                        styles.row,
                        styles.rowDivider,
                        pressed && styles.rowPressed,
                      ]}
                      onPress={() => router.push("/iot-settings")}
                      accessibilityRole="button"
                      accessibilityLabel="Open Sensor and IoT settings"
                    >
                      <View style={styles.rowIcon}>
                        <Cpu size={17 * fontScale} color={colors.sub} strokeWidth={1.9} />
                      </View>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowTitle}>Paired ESP32 sensor</Text>
                        <Text style={styles.rowSubtitle}>
                          UID {deviceUid}
                        </Text>
                      </View>
                      <View style={styles.statusRight}>
                        <View style={[styles.statusDot, { backgroundColor: sensorTone }]} />
                        <Text style={[styles.statusRightText, { color: sensorTone }]}>
                          {LINK_LABELS[sensorHealth]}
                        </Text>
                        <ChevronRight size={16 * fontScale} color={colors.sub} strokeWidth={2} />
                      </View>
                    </Pressable>

                    <Pressable
                      style={({ pressed }) => [
                        styles.row,
                        styles.rowDivider,
                        pressed && styles.rowPressed,
                      ]}
                      onPress={() => router.push("/privacy-settings")}
                      accessibilityRole="button"
                      accessibilityLabel="Open Privacy and Security settings"
                    >
                      <View style={styles.rowIcon}>
                        <ShieldCheck size={17 * fontScale} color={colors.sub} strokeWidth={1.9} />
                      </View>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowTitle}>Sessions & app lock</Text>
                        <Text style={styles.rowSubtitle}>
                          Manage signed-in devices, biometric lock, and account deletion
                        </Text>
                      </View>
                      <ChevronRight size={16 * fontScale} color={colors.sub} strokeWidth={2} />
                    </Pressable>
                  </View>
                </View>

                {/* Primary & Sign out actions */}
                <View style={styles.actionsBlock}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      pressed && styles.btnPressed,
                    ]}
                    onPress={enterEdit}
                    accessibilityRole="button"
                    accessibilityLabel="Edit account details"
                  >
                    <Pencil size={16 * fontScale} color={colors.bg} strokeWidth={2.1} />
                    <Text style={styles.primaryBtnText}>Edit account details</Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.signOutBtn,
                      pressed && styles.btnPressed,
                      signingOut && styles.btnDisabled,
                    ]}
                    onPress={() => setShowLogoutModal(true)}
                    disabled={signingOut}
                    accessibilityRole="button"
                    accessibilityLabel="Sign out of this device"
                  >
                    <LogOut size={16 * fontScale} color={colors.red} strokeWidth={2.1} />
                    <Text style={styles.signOutText}>
                      {signingOut ? "Signing out…" : "Sign out of this device"}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              /* ── Edit mode: Identity + Password update panels ── */
              <>
                <View style={styles.group}>
                  <Text style={styles.groupHeading}>Identity</Text>
                  <View style={styles.formPanel}>
                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Full name</Text>
                      <TextInput
                        style={[
                          styles.input,
                          focusedField === "name" && styles.inputFocused,
                          nameError ? styles.inputError : null,
                        ]}
                        placeholder="Full name"
                        placeholderTextColor={colors.inactive}
                        value={name}
                        onFocus={() => setFocusedField("name")}
                        onBlur={() =>
                          setFocusedField((prev) => (prev === "name" ? null : prev))
                        }
                        onChangeText={(t) => {
                          setName(t);
                          if (nameError) setNameError(null);
                          setError(null);
                          setSuccess(null);
                        }}
                        autoCapitalize="words"
                        textContentType="name"
                        autoComplete="name"
                        accessibilityLabel="Full name"
                      />
                      {nameError && <Text style={styles.fieldError}>{nameError}</Text>}
                    </View>

                    <View style={styles.fieldGroupLast}>
                      <Text style={styles.fieldLabel}>Email address</Text>
                      <TextInput
                        style={[
                          styles.input,
                          focusedField === "email" && styles.inputFocused,
                          emailError ? styles.inputError : null,
                        ]}
                        placeholder="name@domain.com"
                        placeholderTextColor={colors.inactive}
                        value={email}
                        onFocus={() => setFocusedField("email")}
                        onBlur={() =>
                          setFocusedField((prev) => (prev === "email" ? null : prev))
                        }
                        onChangeText={(t) => {
                          setEmail(t);
                          if (emailError) setEmailError(null);
                          setError(null);
                          setSuccess(null);
                        }}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        textContentType="emailAddress"
                        autoComplete="email"
                        accessibilityLabel="Email address"
                      />
                      {emailError && <Text style={styles.fieldError}>{emailError}</Text>}
                    </View>
                  </View>
                </View>

                <View style={styles.group}>
                  <Text style={styles.groupHeading}>Password update (optional)</Text>
                  <View style={styles.formPanel}>
                    <View style={styles.panelNoteRow}>
                      <Lock size={14 * fontScale} color={colors.sub} strokeWidth={2} />
                      <Text style={styles.panelNoteText}>
                        Leave blank to keep your current password. Setting a new password revokes all other signed-in devices.
                      </Text>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Current password</Text>
                      <View
                        style={[
                          styles.inputRow,
                          focusedField === "currentPw" && styles.inputFocused,
                          currentPwError ? styles.inputError : null,
                        ]}
                      >
                        <TextInput
                          style={styles.inputInner}
                          placeholder="Enter current password"
                          placeholderTextColor={colors.inactive}
                          value={currentPassword}
                          onFocus={() => setFocusedField("currentPw")}
                          onBlur={() =>
                            setFocusedField((prev) =>
                              prev === "currentPw" ? null : prev
                            )
                          }
                          onChangeText={(t) => {
                            setCurrentPassword(t);
                            if (currentPwError) setCurrentPwError(null);
                            setError(null);
                          }}
                          secureTextEntry={!showCurrentPw}
                          textContentType="password"
                          autoComplete="password"
                          accessibilityLabel="Current password"
                        />
                        <Pressable
                          onPress={() => setShowCurrentPw((v) => !v)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          style={styles.eyeBtn}
                          accessibilityRole="button"
                          accessibilityLabel={
                            showCurrentPw ? "Hide current password" : "Show current password"
                          }
                        >
                          {showCurrentPw ? (
                            <EyeOff size={18 * fontScale} color={colors.sub} strokeWidth={1.9} />
                          ) : (
                            <Eye size={18 * fontScale} color={colors.sub} strokeWidth={1.9} />
                          )}
                        </Pressable>
                      </View>
                      {currentPwError && (
                        <Text style={styles.fieldError}>{currentPwError}</Text>
                      )}
                    </View>

                    <View style={styles.fieldGroupLast}>
                      <Text style={styles.fieldLabel}>New password</Text>
                      <View
                        style={[
                          styles.inputRow,
                          focusedField === "newPw" && styles.inputFocused,
                          newPwError ? styles.inputError : null,
                        ]}
                      >
                        <TextInput
                          style={styles.inputInner}
                          placeholder="At least 6 characters"
                          placeholderTextColor={colors.inactive}
                          value={newPassword}
                          onFocus={() => setFocusedField("newPw")}
                          onBlur={() =>
                            setFocusedField((prev) => (prev === "newPw" ? null : prev))
                          }
                          onChangeText={(t) => {
                            setNewPassword(t);
                            if (newPwError) setNewPwError(null);
                            setError(null);
                          }}
                          secureTextEntry={!showNewPw}
                          textContentType="newPassword"
                          autoComplete="new-password"
                          accessibilityLabel="New password"
                        />
                        <Pressable
                          onPress={() => setShowNewPw((v) => !v)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          style={styles.eyeBtn}
                          accessibilityRole="button"
                          accessibilityLabel={
                            showNewPw ? "Hide new password" : "Show new password"
                          }
                        >
                          {showNewPw ? (
                            <EyeOff size={18 * fontScale} color={colors.sub} strokeWidth={1.9} />
                          ) : (
                            <Eye size={18 * fontScale} color={colors.sub} strokeWidth={1.9} />
                          )}
                        </Pressable>
                      </View>
                      {newPwError && <Text style={styles.fieldError}>{newPwError}</Text>}
                    </View>
                  </View>
                </View>

                <View style={styles.actionsBlock}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      pressed && !saving && styles.btnPressed,
                      saving && styles.btnDisabled,
                    ]}
                    onPress={handleSave}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel="Save profile changes"
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color={colors.bg} />
                    ) : (
                      <>
                        <Check size={17 * fontScale} color={colors.bg} strokeWidth={2.4} />
                        <Text style={styles.primaryBtnText}>Save profile changes</Text>
                      </>
                    )}
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.secondaryBtn,
                      pressed && styles.btnPressed,
                    ]}
                    onPress={requestCancelEdit}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel editing"
                  >
                    <X size={16 * fontScale} color={colors.text} strokeWidth={2} />
                    <Text style={styles.secondaryBtnText}>Cancel editing</Text>
                  </Pressable>
                </View>
              </>
            )}

            <View style={{ height: 32 }} />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Modals ────────────────────────────────────────────────── */}
      <ConfirmModal
        visible={showSaveModal}
        title="Save profile changes?"
        message="You have unsaved edits to your account details."
        confirmText="Save changes"
        cancelText="Discard edits"
        loading={saving}
        onConfirm={handleConfirmSave}
        onCancel={discardAndExit}
        onDismiss={() => setShowSaveModal(false)}
      />

      <ConfirmModal
        visible={showLogoutModal}
        title="Sign out of this device?"
        message="Ends the current session on this phone. Your readings, tariff, and paired sensor stay saved on your account."
        confirmText="Sign out"
        cancelText="Stay signed in"
        destructive
        loading={signingOut}
        onConfirm={handleConfirmSignOut}
        onCancel={() => setShowLogoutModal(false)}
      />
    </SafeAreaView>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────── */
function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingTop: 16,
    },
    content: {
      maxWidth: 520,
      width: "100%",
      alignSelf: "center",
    },

    /* Identity block */
    identityCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      marginBottom: 20,
    },
    identityTopRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    initialTile: {
      width: 52,
      height: 52,
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    initialTileText: {
      color: colors.accent,
      fontSize: 20 * fontScale,
      fontWeight: "600",
      letterSpacing: -0.3,
    },
    identityBody: {
      flex: 1,
    },
    identityName: {
      color: colors.text,
      fontSize: 19 * fontScale,
      fontWeight: "600",
      letterSpacing: -0.2,
      marginBottom: 2,
    },
    identityEmail: {
      color: colors.sub,
      fontSize: 14 * fontScale,
    },
    editHeaderBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    editHeaderBtnText: {
      color: colors.accent,
      fontSize: 13 * fontScale,
      fontWeight: "600",
    },
    identityFactsRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 16,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    factCell: {
      flex: 1,
    },
    factDivider: {
      width: 1,
      height: 26,
      backgroundColor: colors.border,
      marginHorizontal: 12,
    },
    factLabel: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      marginBottom: 2,
    },
    factValue: {
      color: colors.text,
      fontSize: 13.5 * fontScale,
      fontWeight: "600",
    },

    /* Feedback banners */
    errorBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      backgroundColor: colors.red + "14",
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.red + "40",
      padding: 12,
      marginBottom: 16,
    },
    errorBannerText: {
      color: colors.red,
      fontSize: 13.5 * fontScale,
      lineHeight: 19 * fontScale,
      flex: 1,
    },
    successBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      backgroundColor: colors.green + "14",
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.green + "40",
      padding: 12,
      marginBottom: 16,
    },
    successBannerText: {
      color: colors.text,
      fontSize: 13.5 * fontScale,
      lineHeight: 19 * fontScale,
      flex: 1,
    },

    /* Groups & cards */
    group: {
      marginBottom: 22,
    },
    groupHeading: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      fontWeight: "500",
      marginBottom: 8,
      marginLeft: 2,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    rowPressed: {
      backgroundColor: colors.surface,
    },
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    rowBody: {
      flex: 1,
    },
    rowLabel: {
      color: colors.sub,
      fontSize: 12.5 * fontScale,
      marginBottom: 2,
    },
    rowValue: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "500",
    },
    rowTitle: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "600",
    },
    rowSubtitle: {
      color: colors.sub,
      fontSize: 12.5 * fontScale,
      lineHeight: 17 * fontScale,
      marginTop: 2,
    },
    statusRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusRightText: {
      fontSize: 12.5 * fontScale,
      fontWeight: "600",
    },

    /* Edit mode form panels */
    formPanel: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
    },
    panelNoteRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      paddingBottom: 14,
      marginBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    panelNoteText: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      lineHeight: 18 * fontScale,
      flex: 1,
    },
    fieldGroup: {
      marginBottom: 16,
    },
    fieldGroupLast: {
      marginBottom: 0,
    },
    fieldLabel: {
      color: colors.text,
      fontSize: 13.5 * fontScale,
      fontWeight: "500",
      marginBottom: 6,
    },
    input: {
      backgroundColor: colors.bg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      height: 48,
      color: colors.text,
      fontSize: 16 * fontScale,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      paddingLeft: 14,
      paddingRight: 6,
      height: 48,
    },
    inputInner: {
      flex: 1,
      color: colors.text,
      fontSize: 16 * fontScale,
      height: 48,
    },
    inputFocused: {
      borderColor: colors.accent,
    },
    inputError: {
      borderColor: colors.red,
    },
    eyeBtn: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    fieldError: {
      color: colors.red,
      fontSize: 12.5 * fontScale,
      lineHeight: 17 * fontScale,
      marginTop: 6,
    },

    /* Buttons */
    actionsBlock: {
      gap: 10,
      marginTop: 4,
    },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.accent,
      borderRadius: 8,
      height: 48,
      paddingHorizontal: 20,
    },
    primaryBtnText: {
      color: colors.bg,
      fontSize: 15.5 * fontScale,
      fontWeight: "600",
    },
    secondaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.card,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      height: 48,
      paddingHorizontal: 20,
    },
    secondaryBtnText: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "500",
    },
    signOutBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.card,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.red + "40",
      height: 48,
      paddingHorizontal: 20,
    },
    signOutText: {
      color: colors.red,
      fontSize: 15 * fontScale,
      fontWeight: "600",
    },
    btnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.99 }],
    },
    btnDisabled: {
      opacity: 0.55,
    },
  });
}

