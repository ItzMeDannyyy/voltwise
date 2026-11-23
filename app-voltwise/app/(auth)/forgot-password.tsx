import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Image,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
} from "../../components/LucideIcons";
import { api } from "../../lib/api";
import { useTheme } from "../../context/ThemeContext";
import { useThemedStyles } from "../../components/themed";
import type { ThemeColors } from "../../constants/theme";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = "email" | "reset";
type FocusedField = "email" | "newPassword" | "confirmPassword" | null;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors, fontScale } = useTheme();
  const styles = useThemedStyles(createStyles);

  // Step state
  const [step, setStep] = useState<Step>("email");
  const [focusedField, setFocusedField] = useState<FocusedField>(null);

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

  const confirmRef = useRef<TextInput>(null);
  const [enterOpacity] = useState(() => new Animated.Value(0));
  const [enterTranslate] = useState(() => new Animated.Value(10));

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
  }, [enterOpacity, enterTranslate]);

  // ---- Step 1 handlers ----

  function validateEmail(): boolean {
    if (!email.trim()) {
      setEmailError("Write the email address registered to your account.");
      return false;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setEmailError("Write an email address with an @ and a domain.");
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
        err instanceof Error ? err.message : "Could not verify email. Try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // ---- Step 2 handlers ----

  function validateReset(): boolean {
    let valid = true;

    if (!newPassword) {
      setNewPasswordError("Enter a new password of at least 6 characters.");
      valid = false;
    } else if (newPassword.length < 6) {
      setNewPasswordError("New password must be at least 6 characters.");
      valid = false;
    } else {
      setNewPasswordError(null);
    }

    if (!confirmPassword) {
      setConfirmPasswordError("Type the new password again to confirm.");
      valid = false;
    } else if (newPassword !== confirmPassword) {
      setConfirmPasswordError("The two passwords do not match.");
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
      setSuccessMessage(
        data.message ?? "Your password has been updated and active sessions were signed out."
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Could not update password. Try again.";
      if (
        msg.includes("401") ||
        msg.toLowerCase().includes("invalid") ||
        msg.toLowerCase().includes("expired")
      ) {
        setError("Reset token expired or is invalid. Verify your email again.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  const currentStepNum = successMessage ? 2 : step === "email" ? 1 : 2;

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
          <Animated.View
            style={[
              styles.content,
              {
                opacity: enterOpacity,
                transform: [{ translateY: enterTranslate }],
              },
            ]}
          >
            {/* Top utility bar */}
            <View style={styles.topBar}>
              <Image
                source={require("../../assets/images/voltwise-logo/voltwise-logo-complete.png")}
                style={styles.brandLogo}
                resizeMode="contain"
                accessibilityLabel="VoltWise"
              />
              <View style={styles.stepPill}>
                <KeyRound size={12 * fontScale} color={colors.sub} strokeWidth={2} />
                <Text style={styles.stepPillText}>
                  {successMessage ? "Completed" : `Step ${currentStepNum} of 2`}
                </Text>
              </View>
            </View>

            {/* Editorial heading block */}
            {step === "email" ? (
              <View style={styles.headerBlock}>
                <Text style={styles.eyebrow}>Account recovery</Text>
                <Text style={styles.heading}>Reset your password</Text>
                <Text style={styles.headingSub}>
                  Enter your account email to issue a direct reset token on this server. No external email wait required.
                </Text>
              </View>
            ) : successMessage ? (
              <View style={styles.headerBlock}>
                <Text style={styles.eyebrow}>Password updated</Text>
                <Text style={styles.heading}>Your new password is saved</Text>
                <Text style={styles.headingSub}>
                  All other signed-in devices have been revoked so only you can sign back in.
                </Text>
              </View>
            ) : (
              <View style={styles.headerBlock}>
                <Text style={styles.eyebrow}>Token verified</Text>
                <Text style={styles.heading}>Set a new password</Text>
                <Text style={styles.headingSub}>
                  Replacing the password for{" "}
                  <Text style={styles.emailHighlight}>{email.trim()}</Text> will sign out any other active sessions.
                </Text>
              </View>
            )}

            {/* Main panel */}
            <View style={styles.panel}>
              {step === "email" ? (
                <>
                  {error && (
                    <View style={styles.errorBanner} role="alert">
                      <AlertCircle size={16 * fontScale} color={colors.red} strokeWidth={2} />
                      <Text style={styles.errorBannerText}>{error}</Text>
                    </View>
                  )}

                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Account email address</Text>
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
                        if (error) setError(null);
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      textContentType="emailAddress"
                      autoComplete="email"
                      returnKeyType="done"
                      onSubmitEditing={handleRequestReset}
                      accessibilityLabel="Account email address"
                    />
                    {emailError && <Text style={styles.fieldError}>{emailError}</Text>}
                  </View>

                  <Pressable
                    style={({ pressed }) => [
                      styles.submitBtn,
                      pressed && !loading && styles.submitBtnPressed,
                      loading && styles.submitBtnDisabled,
                    ]}
                    onPress={handleRequestReset}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel="Verify account email"
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color={colors.bg} />
                    ) : (
                      <View style={styles.submitBtnInner}>
                        <Text style={styles.submitBtnText}>Verify account email</Text>
                        <ArrowRight size={17 * fontScale} color={colors.bg} strokeWidth={2.2} />
                      </View>
                    )}
                  </Pressable>
                </>
              ) : successMessage ? (
                <>
                  <View style={styles.successBanner}>
                    <CheckCircle2 size={20 * fontScale} color={colors.green} strokeWidth={2.2} />
                    <Text style={styles.successBannerText}>{successMessage}</Text>
                  </View>

                  <Pressable
                    style={({ pressed }) => [
                      styles.submitBtn,
                      pressed && styles.submitBtnPressed,
                    ]}
                    onPress={() => router.replace("/(auth)/login")}
                    accessibilityRole="button"
                    accessibilityLabel="Return to sign in"
                  >
                    <View style={styles.submitBtnInner}>
                      <Text style={styles.submitBtnText}>Return to sign in</Text>
                      <ArrowRight size={17 * fontScale} color={colors.bg} strokeWidth={2.2} />
                    </View>
                  </Pressable>
                </>
              ) : (
                <>
                  {error && (
                    <View style={styles.errorBanner} role="alert">
                      <AlertCircle size={16 * fontScale} color={colors.red} strokeWidth={2} />
                      <Text style={styles.errorBannerText}>{error}</Text>
                    </View>
                  )}

                  {/* Change email button if user mistyped */}
                  <View style={styles.accountRow}>
                    <Text style={styles.accountRowLabel} numberOfLines={1}>
                      Account: <Text style={styles.accountRowEmail}>{email.trim()}</Text>
                    </Text>
                    <Pressable
                      onPress={() => {
                        setStep("email");
                        setError(null);
                        setNewPasswordError(null);
                        setConfirmPasswordError(null);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Change email address"
                    >
                      <Text style={styles.changeEmailLink}>Change email</Text>
                    </Pressable>
                  </View>

                  {/* New password */}
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>New password</Text>
                    <View
                      style={[
                        styles.inputRow,
                        focusedField === "newPassword" && styles.inputFocused,
                        newPasswordError ? styles.inputError : null,
                      ]}
                    >
                      <TextInput
                        style={styles.inputInner}
                        placeholder="At least 6 characters"
                        placeholderTextColor={colors.inactive}
                        value={newPassword}
                        onFocus={() => setFocusedField("newPassword")}
                        onBlur={() =>
                          setFocusedField((prev) =>
                            prev === "newPassword" ? null : prev
                          )
                        }
                        onChangeText={(t) => {
                          setNewPassword(t);
                          if (newPasswordError) setNewPasswordError(null);
                          if (error) setError(null);
                        }}
                        secureTextEntry={!showNewPassword}
                        textContentType="newPassword"
                        autoComplete="new-password"
                        returnKeyType="next"
                        onSubmitEditing={() => confirmRef.current?.focus()}
                        accessibilityLabel="New password"
                      />
                      <Pressable
                        onPress={() => setShowNewPassword((v) => !v)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={styles.eyeBtn}
                        accessibilityRole="button"
                        accessibilityLabel={
                          showNewPassword ? "Hide new password" : "Show new password"
                        }
                      >
                        {showNewPassword ? (
                          <EyeOff size={18 * fontScale} color={colors.sub} strokeWidth={1.9} />
                        ) : (
                          <Eye size={18 * fontScale} color={colors.sub} strokeWidth={1.9} />
                        )}
                      </Pressable>
                    </View>
                    {newPasswordError && (
                      <Text style={styles.fieldError}>{newPasswordError}</Text>
                    )}
                  </View>

                  {/* Confirm password */}
                  <View style={styles.fieldGroup}>
                    <Text style={styles.label}>Confirm new password</Text>
                    <View
                      style={[
                        styles.inputRow,
                        focusedField === "confirmPassword" && styles.inputFocused,
                        confirmPasswordError ? styles.inputError : null,
                      ]}
                    >
                      <TextInput
                        ref={confirmRef}
                        style={styles.inputInner}
                        placeholder="Repeat new password"
                        placeholderTextColor={colors.inactive}
                        value={confirmPassword}
                        onFocus={() => setFocusedField("confirmPassword")}
                        onBlur={() =>
                          setFocusedField((prev) =>
                            prev === "confirmPassword" ? null : prev
                          )
                        }
                        onChangeText={(t) => {
                          setConfirmPassword(t);
                          if (confirmPasswordError) setConfirmPasswordError(null);
                          if (error) setError(null);
                        }}
                        secureTextEntry={!showConfirmPassword}
                        textContentType="newPassword"
                        autoComplete="new-password"
                        returnKeyType="done"
                        onSubmitEditing={handleResetPassword}
                        accessibilityLabel="Confirm new password"
                      />
                      <Pressable
                        onPress={() => setShowConfirmPassword((v) => !v)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={styles.eyeBtn}
                        accessibilityRole="button"
                        accessibilityLabel={
                          showConfirmPassword
                            ? "Hide confirm password"
                            : "Show confirm password"
                        }
                      >
                        {showConfirmPassword ? (
                          <EyeOff size={18 * fontScale} color={colors.sub} strokeWidth={1.9} />
                        ) : (
                          <Eye size={18 * fontScale} color={colors.sub} strokeWidth={1.9} />
                        )}
                      </Pressable>
                    </View>
                    {confirmPasswordError && (
                      <Text style={styles.fieldError}>{confirmPasswordError}</Text>
                    )}
                  </View>

                  {/* Submit: verb + object */}
                  <Pressable
                    style={({ pressed }) => [
                      styles.submitBtn,
                      pressed && !loading && styles.submitBtnPressed,
                      loading && styles.submitBtnDisabled,
                    ]}
                    onPress={handleResetPassword}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel="Save new password"
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color={colors.bg} />
                    ) : (
                      <View style={styles.submitBtnInner}>
                        <Text style={styles.submitBtnText}>Save new password</Text>
                        <ArrowRight size={17 * fontScale} color={colors.bg} strokeWidth={2.2} />
                      </View>
                    )}
                  </Pressable>
                </>
              )}
            </View>

            {/* Back to sign in */}
            {!successMessage && (
              <View style={styles.switchRow}>
                <Text style={styles.switchText}>Know your current password?</Text>
                <Link href="/(auth)/login" asChild>
                  <Pressable
                    hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                    style={({ pressed }) => [
                      styles.switchLinkBtn,
                      pressed && styles.linkPressed,
                    ]}
                    accessibilityRole="link"
                    accessibilityLabel="Return to sign in"
                  >
                    <ArrowLeft size={14 * fontScale} color={colors.accent} strokeWidth={2.2} />
                    <Text style={styles.switchLink}>Return to sign in</Text>
                  </Pressable>
                </Link>
              </View>
            )}
          </Animated.View>
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
      paddingTop: 20,
      paddingBottom: 32,
    },
    content: {
      flexGrow: 1,
      justifyContent: "center",
      maxWidth: 440,
      width: "100%",
      alignSelf: "center",
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 28,
      gap: 12,
    },
    brandLogo: {
      width: 156,
      height: 48,
      marginLeft: -10,
    },
    stepPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    stepPillText: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      fontWeight: "500",
    },
    headerBlock: {
      marginBottom: 24,
    },
    eyebrow: {
      color: colors.accent,
      fontSize: 13 * fontScale,
      fontWeight: "500",
      marginBottom: 6,
    },
    heading: {
      color: colors.text,
      fontSize: 28 * fontScale,
      fontWeight: "600",
      letterSpacing: -0.5,
      lineHeight: 34 * fontScale,
      marginBottom: 8,
    },
    headingSub: {
      color: colors.sub,
      fontSize: 15 * fontScale,
      lineHeight: 22 * fontScale,
    },
    emailHighlight: {
      color: colors.text,
      fontWeight: "600",
    },
    panel: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
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
      padding: 14,
      marginBottom: 16,
    },
    successBannerText: {
      color: colors.text,
      fontSize: 14 * fontScale,
      lineHeight: 20 * fontScale,
      flex: 1,
    },
    accountRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingBottom: 14,
      marginBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    accountRowLabel: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      flex: 1,
    },
    accountRowEmail: {
      color: colors.text,
      fontWeight: "500",
    },
    changeEmailLink: {
      color: colors.accent,
      fontSize: 13 * fontScale,
      fontWeight: "500",
    },
    fieldGroup: {
      marginBottom: 16,
    },
    label: {
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
    submitBtn: {
      backgroundColor: colors.accent,
      borderRadius: 8,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 6,
      paddingHorizontal: 20,
    },
    submitBtnPressed: {
      opacity: 0.88,
      transform: [{ scale: 0.99 }],
    },
    submitBtnDisabled: {
      opacity: 0.55,
    },
    submitBtnInner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    submitBtnText: {
      color: colors.bg,
      fontSize: 15.5 * fontScale,
      fontWeight: "600",
    },
    switchRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 24,
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.card,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    switchText: {
      color: colors.sub,
      fontSize: 14 * fontScale,
    },
    switchLinkBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 2,
    },
    switchLink: {
      color: colors.accent,
      fontSize: 14 * fontScale,
      fontWeight: "600",
    },
    linkPressed: {
      opacity: 0.7,
    },
  });
}

