import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../lib/api";
import { useTheme } from "../../context/ThemeContext";
import { useThemedStyles } from "../../components/themed";
import type { ThemeColors } from "../../constants/theme";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = "email" | "reset";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  // Step state
  const [step, setStep] = useState<Step>("email");

  // Step 1 — email
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  // Step 2 — reset
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);

  // Shared
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ---- Step 1 handlers ----

  function validateEmail(): boolean {
    if (!email.trim()) {
      setEmailError("Email is required.");
      return false;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setEmailError("Enter a valid email address.");
      return false;
    }
    setEmailError(null);
    return true;
  }

  async function handleRequestReset() {
    if (!validateEmail()) return;

    setLoading(true);
    setError(null);

    try {
      const data = await api.post<{ resetToken: string; email: string }>(
        "/auth/forgot-password",
        { email: email.trim() }
      );
      setResetToken(data.resetToken);
      setStep("reset");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // ---- Step 2 handlers ----

  function validateReset(): boolean {
    let valid = true;

    if (!newPassword) {
      setNewPasswordError("New password is required.");
      valid = false;
    } else if (newPassword.length < 6) {
      setNewPasswordError("Password must be at least 6 characters.");
      valid = false;
    } else {
      setNewPasswordError(null);
    }

    if (!confirmPassword) {
      setConfirmPasswordError("Please confirm your new password.");
      valid = false;
    } else if (newPassword !== confirmPassword) {
      setConfirmPasswordError("Passwords do not match.");
      valid = false;
    } else {
      setConfirmPasswordError(null);
    }

    return valid;
  }

  async function handleResetPassword() {
    if (!validateReset()) return;

    setLoading(true);
    setError(null);

    try {
      const data = await api.post<{ message: string }>("/auth/reset-password", {
        token: resetToken,
        newPassword,
      });
      setSuccessMessage(data.message ?? "Password reset successfully.");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong. Please try again.";
      if (msg.includes("401") || msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("expired")) {
        setError("Reset link is invalid or has expired. Please start over.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  // ---- Render ----

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 16}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Wordmark */}
          <View style={styles.brandRow}>
            <Image
              source={require("../../assets/images/voltwise-logo/voltwise-logo-complete.png")}
              style={styles.brandLogo}
              resizeMode="contain"
            />
          </View>

          {/* Card */}
          <View style={styles.card}>
            {step === "email" ? (
              <>
                <Text style={styles.heading}>Reset password</Text>
                <Text style={styles.headingSub}>
                  Enter the email linked to your account and we{"'"}ll get you back in.
                </Text>

                {/* Error banner */}
                {error && (
                  <View style={styles.errorBanner}>
                    <Ionicons name="warning-outline" size={16} color={colors.red} />
                    <Text style={styles.errorBannerText}>{error}</Text>
                  </View>
                )}

                {/* Email field */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={[styles.input, emailError ? styles.inputError : null]}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.inactive}
                    value={email}
                    onChangeText={(t) => {
                      setEmail(t);
                      if (emailError) setEmailError(null);
                      if (error) setError(null);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    returnKeyType="done"
                    onSubmitEditing={handleRequestReset}
                  />
                  {emailError && <Text style={styles.fieldError}>{emailError}</Text>}
                </View>

                {/* Submit */}
                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  onPress={handleRequestReset}
                  activeOpacity={0.8}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.bg} />
                  ) : (
                    <Text style={styles.submitBtnText}>Continue</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : successMessage ? (
              <>
                {/* Success state */}
                <View style={styles.successIcon}>
                  <Ionicons name="checkmark-circle" size={48} color={colors.green} />
                </View>
                <Text style={styles.heading}>All done!</Text>
                <Text style={styles.headingSub}>{successMessage}</Text>

                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={() => router.replace("/(auth)/login")}
                  activeOpacity={0.8}
                >
                  <Text style={styles.submitBtnText}>Back to sign in</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.heading}>Create new password</Text>
                <Text style={styles.headingSub}>
                  Choose a new password for{" "}
                  <Text style={styles.emailHighlight}>{email}</Text>.
                </Text>

                {/* Error banner */}
                {error && (
                  <View style={styles.errorBanner}>
                    <Ionicons name="warning-outline" size={16} color={colors.red} />
                    <Text style={styles.errorBannerText}>{error}</Text>
                  </View>
                )}

                {/* New password */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>New password</Text>
                  <View
                    style={[
                      styles.inputRow,
                      newPasswordError ? styles.inputError : null,
                    ]}
                  >
                    <TextInput
                      style={styles.inputInner}
                      placeholder="Min. 6 characters"
                      placeholderTextColor={colors.inactive}
                      value={newPassword}
                      onChangeText={(t) => {
                        setNewPassword(t);
                        if (newPasswordError) setNewPasswordError(null);
                        if (error) setError(null);
                      }}
                      secureTextEntry={!showNewPassword}
                      textContentType="newPassword"
                      returnKeyType="next"
                    />
                    <TouchableOpacity
                      onPress={() => setShowNewPassword((v) => !v)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={showNewPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={colors.inactive}
                      />
                    </TouchableOpacity>
                  </View>
                  {newPasswordError && (
                    <Text style={styles.fieldError}>{newPasswordError}</Text>
                  )}
                </View>

                {/* Confirm password */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Confirm password</Text>
                  <View
                    style={[
                      styles.inputRow,
                      confirmPasswordError ? styles.inputError : null,
                    ]}
                  >
                    <TextInput
                      style={styles.inputInner}
                      placeholder="Re-enter password"
                      placeholderTextColor={colors.inactive}
                      value={confirmPassword}
                      onChangeText={(t) => {
                        setConfirmPassword(t);
                        if (confirmPasswordError) setConfirmPasswordError(null);
                        if (error) setError(null);
                      }}
                      secureTextEntry={!showConfirmPassword}
                      textContentType="newPassword"
                      returnKeyType="done"
                      onSubmitEditing={handleResetPassword}
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirmPassword((v) => !v)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={colors.inactive}
                      />
                    </TouchableOpacity>
                  </View>
                  {confirmPasswordError && (
                    <Text style={styles.fieldError}>{confirmPasswordError}</Text>
                  )}
                </View>

                {/* Submit */}
                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                  onPress={handleResetPassword}
                  activeOpacity={0.8}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.bg} />
                  ) : (
                    <Text style={styles.submitBtnText}>Reset password</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Back to sign in */}
          {!successMessage && (
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>Remember your password?</Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                  <Text style={styles.switchLink}> Sign in</Text>
                </TouchableOpacity>
              </Link>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    flex: {
      flex: 1,
    },
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 48,
      paddingBottom: 32,
      justifyContent: "center",
    },
    brandRow: {
      alignItems: "center",
      marginBottom: 40,
    },
    brandLogo: {
      width: 240,
      height: 96,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
    },
    heading: {
      color: colors.text,
      fontSize: 24 * fontScale,
      fontWeight: "700",
      marginBottom: 4,
    },
    headingSub: {
      color: colors.sub,
      fontSize: 14 * fontScale,
      marginBottom: 20,
    },
    emailHighlight: {
      color: colors.accent,
      fontWeight: "600",
    },
    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.red + "1F",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.red + "4D",
      padding: 12,
      marginBottom: 16,
    },
    errorBannerText: {
      color: colors.red,
      fontSize: 14 * fontScale,
      flex: 1,
    },
    successIcon: {
      alignItems: "center",
      marginBottom: 12,
    },
    fieldGroup: {
      marginBottom: 16,
    },
    label: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      fontWeight: "600",
      marginBottom: 6,
    },
    input: {
      backgroundColor: colors.bg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      height: 50,
      color: colors.text,
      fontSize: 15 * fontScale,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      height: 50,
    },
    inputInner: {
      flex: 1,
      color: colors.text,
      fontSize: 15 * fontScale,
      height: 50,
    },
    inputError: {
      borderColor: colors.red,
    },
    fieldError: {
      color: colors.red,
      fontSize: 12 * fontScale,
      marginTop: 4,
    },
    submitBtn: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      height: 52,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
    },
    submitBtnDisabled: {
      opacity: 0.6,
    },
    submitBtnText: {
      color: colors.bg,
      fontSize: 16 * fontScale,
      fontWeight: "700",
    },
    switchRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 24,
    },
    switchText: {
      color: colors.sub,
      fontSize: 14 * fontScale,
    },
    switchLink: {
      color: colors.accent,
      fontSize: 14 * fontScale,
      fontWeight: "600",
    },
  });
}
