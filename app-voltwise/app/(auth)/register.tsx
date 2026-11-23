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
import { Link } from "expo-router";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Circle,
  Eye,
  EyeOff,
} from "../../components/LucideIcons";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useThemedStyles } from "../../components/themed";
import { DEFAULT_DEVICE_UID } from "../../lib/iot-prefs";
import type { ThemeColors } from "../../constants/theme";

// ---- Password policy ----

const POLICY = {
  minLength: 12,
  hasLetter: /[A-Za-z]/,
  hasNumber: /[0-9]/,
  hasSpecial: /[^A-Za-z0-9]/,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface PolicyCheck {
  label: string;
  met: boolean;
}

function evaluatePolicy(pw: string): PolicyCheck[] {
  return [
    { label: "12+ chars", met: pw.length >= POLICY.minLength },
    { label: "Letter (A–Z)", met: POLICY.hasLetter.test(pw) },
    { label: "Number (0–9)", met: POLICY.hasNumber.test(pw) },
    { label: "Symbol (!@#)", met: POLICY.hasSpecial.test(pw) },
  ];
}

function isPolicyMet(pw: string): boolean {
  return (
    pw.length >= POLICY.minLength &&
    POLICY.hasLetter.test(pw) &&
    POLICY.hasNumber.test(pw) &&
    POLICY.hasSpecial.test(pw)
  );
}

// ---- Policy checklist component ----

function PasswordPolicyBlock({ password }: { password: string }) {
  const { colors, fontScale } = useTheme();
  const styles = useThemedStyles(createStyles);
  const checks = evaluatePolicy(password);
  const metCount = checks.filter((c) => c.met).length;

  return (
    <View style={styles.policyContainer}>
      {/* 4-segment technical meter */}
      <View style={styles.segmentTrack}>
        {[0, 1, 2, 3].map((idx) => {
          const active = password.length > 0 && idx < metCount;
          const barColor =
            metCount === 4
              ? colors.accent
              : metCount >= 2
                ? colors.yellow
                : colors.red;
          return (
            <View
              key={idx}
              style={[
                styles.segmentBar,
                active && { backgroundColor: barColor },
              ]}
            />
          );
        })}
      </View>

      {/* 2x2 technical rule grid */}
      <View style={styles.requirementsGrid}>
        {checks.map((check) => (
          <View key={check.label} style={styles.requirementRow}>
            {check.met ? (
              <Check size={13 * fontScale} color={colors.accent} strokeWidth={2.4} />
            ) : (
              <Circle size={12 * fontScale} color={colors.inactive} strokeWidth={1.8} />
            )}
            <Text
              style={[
                styles.requirementText,
                { color: check.met ? colors.text : colors.sub },
              ]}
            >
              {check.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---- Screen ----

type FieldKey = "firstName" | "lastName" | "email" | "password" | "confirm";

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const { colors, fontScale } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<FieldKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Field-level errors — checked on submit
  const [firstNameError, setFirstNameError] = useState<string | null>(null);
  const [lastNameError, setLastNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Refs for focus-chain
  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
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

  function validate(): boolean {
    let valid = true;

    if (!firstName.trim()) {
      setFirstNameError("Write your first name.");
      valid = false;
    } else {
      setFirstNameError(null);
    }

    if (!lastName.trim()) {
      setLastNameError("Write your last name.");
      valid = false;
    } else {
      setLastNameError(null);
    }

    if (!email.trim()) {
      setEmailError("Write the email address for this account.");
      valid = false;
    } else if (!EMAIL_REGEX.test(email.trim())) {
      setEmailError("Write an email address with an @ and a domain.");
      valid = false;
    } else {
      setEmailError(null);
    }

    if (!password) {
      setPasswordError("Choose a password of 12 or more characters.");
      valid = false;
    } else if (!isPolicyMet(password)) {
      setPasswordError(
        "Use at least 12 characters with a letter, a number, and a symbol."
      );
      valid = false;
    } else {
      setPasswordError(null);
    }

    if (!confirmPassword) {
      setConfirmError("Type the same password again to confirm.");
      valid = false;
    } else if (password !== confirmPassword) {
      setConfirmError("The two passwords do not match.");
      valid = false;
    } else {
      setConfirmError(null);
    }

    return valid;
  }

  async function handleRegister() {
    if (!validate()) return;

    setLoading(true);
    setError(null);

    try {
      await signUp(firstName.trim(), lastName.trim(), email.trim(), password);
      // Auth state change routes the user to tabs via the index gate.
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Could not create account. Try again.";
      if (msg.includes("409") || msg.toLowerCase().includes("already")) {
        setError("An account with that email address already exists.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

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
              <View style={styles.specBadge}>
                <Text style={styles.specBadgeText}>Node · {DEFAULT_DEVICE_UID}</Text>
              </View>
            </View>

            {/* Editorial heading block */}
            <View style={styles.headerBlock}>
              <Text style={styles.eyebrow}>New household account</Text>
              <Text style={styles.heading}>Set up your meter account</Text>
              <Text style={styles.headingSub}>
                Stores your kWh tariff (₱ default), appliance inventory, and signed-in device sessions.
              </Text>
            </View>

            {/* Form panel */}
            <View style={styles.panel}>
              {error && (
                <View style={styles.errorBanner} role="alert">
                  <AlertCircle size={16 * fontScale} color={colors.red} strokeWidth={2} />
                  <Text style={styles.errorBannerText}>{error}</Text>
                </View>
              )}

              {/* First name + Last name — two equal columns */}
              <View style={styles.nameRow}>
                <View style={[styles.fieldGroup, styles.nameField]}>
                  <Text style={styles.label}>First name</Text>
                  <TextInput
                    style={[
                      styles.input,
                      focusedField === "firstName" && styles.inputFocused,
                      firstNameError ? styles.inputError : null,
                    ]}
                    placeholder="First name"
                    placeholderTextColor={colors.inactive}
                    value={firstName}
                    onFocus={() => setFocusedField("firstName")}
                    onBlur={() =>
                      setFocusedField((prev) => (prev === "firstName" ? null : prev))
                    }
                    onChangeText={(t) => {
                      setFirstName(t);
                      if (firstNameError) setFirstNameError(null);
                      if (error) setError(null);
                    }}
                    autoCapitalize="words"
                    textContentType="givenName"
                    autoComplete="name-given"
                    returnKeyType="next"
                    onSubmitEditing={() => lastNameRef.current?.focus()}
                    accessibilityLabel="First name"
                  />
                  {firstNameError && (
                    <Text style={styles.fieldError}>{firstNameError}</Text>
                  )}
                </View>

                <View style={[styles.fieldGroup, styles.nameField]}>
                  <Text style={styles.label}>Last name</Text>
                  <TextInput
                    ref={lastNameRef}
                    style={[
                      styles.input,
                      focusedField === "lastName" && styles.inputFocused,
                      lastNameError ? styles.inputError : null,
                    ]}
                    placeholder="Last name"
                    placeholderTextColor={colors.inactive}
                    value={lastName}
                    onFocus={() => setFocusedField("lastName")}
                    onBlur={() =>
                      setFocusedField((prev) => (prev === "lastName" ? null : prev))
                    }
                    onChangeText={(t) => {
                      setLastName(t);
                      if (lastNameError) setLastNameError(null);
                      if (error) setError(null);
                    }}
                    autoCapitalize="words"
                    textContentType="familyName"
                    autoComplete="name-family"
                    returnKeyType="next"
                    onSubmitEditing={() => emailRef.current?.focus()}
                    accessibilityLabel="Last name"
                  />
                  {lastNameError && (
                    <Text style={styles.fieldError}>{lastNameError}</Text>
                  )}
                </View>
              </View>

              {/* Email */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Email address</Text>
                <TextInput
                  ref={emailRef}
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
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  accessibilityLabel="Email address"
                />
                {emailError && <Text style={styles.fieldError}>{emailError}</Text>}
              </View>

              {/* Password */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Password</Text>
                <View
                  style={[
                    styles.inputRow,
                    focusedField === "password" && styles.inputFocused,
                    passwordError ? styles.inputError : null,
                  ]}
                >
                  <TextInput
                    ref={passwordRef}
                    style={styles.inputInner}
                    placeholder="12+ characters"
                    placeholderTextColor={colors.inactive}
                    value={password}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() =>
                      setFocusedField((prev) => (prev === "password" ? null : prev))
                    }
                    onChangeText={(t) => {
                      setPassword(t);
                      if (passwordError) setPasswordError(null);
                      if (error) setError(null);
                    }}
                    secureTextEntry={!showPassword}
                    textContentType="newPassword"
                    autoComplete="new-password"
                    returnKeyType="next"
                    onSubmitEditing={() => confirmRef.current?.focus()}
                    accessibilityLabel="Password"
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.eyeBtn}
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    accessibilityRole="button"
                  >
                    {showPassword ? (
                      <EyeOff size={18 * fontScale} color={colors.sub} strokeWidth={1.9} />
                    ) : (
                      <Eye size={18 * fontScale} color={colors.sub} strokeWidth={1.9} />
                    )}
                  </Pressable>
                </View>
                {passwordError && (
                  <Text style={styles.fieldError}>{passwordError}</Text>
                )}

                <PasswordPolicyBlock password={password} />
              </View>

              {/* Confirm password */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Confirm password</Text>
                <View
                  style={[
                    styles.inputRow,
                    focusedField === "confirm" && styles.inputFocused,
                    confirmError ? styles.inputError : null,
                  ]}
                >
                  <TextInput
                    ref={confirmRef}
                    style={styles.inputInner}
                    placeholder="Repeat password"
                    placeholderTextColor={colors.inactive}
                    value={confirmPassword}
                    onFocus={() => setFocusedField("confirm")}
                    onBlur={() =>
                      setFocusedField((prev) => (prev === "confirm" ? null : prev))
                    }
                    onChangeText={(t) => {
                      setConfirmPassword(t);
                      if (confirmError) setConfirmError(null);
                      if (error) setError(null);
                    }}
                    secureTextEntry={!showConfirmPassword}
                    textContentType="newPassword"
                    autoComplete="new-password"
                    returnKeyType="done"
                    onSubmitEditing={handleRegister}
                    accessibilityLabel="Confirm password"
                  />
                  <Pressable
                    onPress={() => setShowConfirmPassword((v) => !v)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.eyeBtn}
                    accessibilityLabel={
                      showConfirmPassword ? "Hide confirm password" : "Show confirm password"
                    }
                    accessibilityRole="button"
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={18 * fontScale} color={colors.sub} strokeWidth={1.9} />
                    ) : (
                      <Eye size={18 * fontScale} color={colors.sub} strokeWidth={1.9} />
                    )}
                  </Pressable>
                </View>
                {confirmError && (
                  <Text style={styles.fieldError}>{confirmError}</Text>
                )}
              </View>

              {/* Submit: verb + object */}
              <Pressable
                style={({ pressed }) => [
                  styles.submitBtn,
                  pressed && !loading && styles.submitBtnPressed,
                  loading && styles.submitBtnDisabled,
                ]}
                onPress={handleRegister}
                disabled={loading}
                accessibilityLabel="Create VoltWise account"
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.bg} />
                ) : (
                  <View style={styles.submitBtnInner}>
                    <Text style={styles.submitBtnText}>Create VoltWise account</Text>
                    <ArrowRight size={17 * fontScale} color={colors.bg} strokeWidth={2.2} />
                  </View>
                )}
              </Pressable>
            </View>

            {/* Switch to login */}
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>Already registered on this server?</Text>
              <Link href="/(auth)/login" asChild>
                <Pressable
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                  style={({ pressed }) => [styles.switchLinkBtn, pressed && styles.linkPressed]}
                  accessibilityRole="link"
                  accessibilityLabel="Sign in"
                >
                  <Text style={styles.switchLink}>Sign in</Text>
                </Pressable>
              </Link>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---- Styles ----

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
      marginBottom: 24,
      gap: 12,
    },
    brandLogo: {
      width: 156,
      height: 48,
      marginLeft: -10,
    },
    specBadge: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    specBadgeText: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      fontWeight: "500",
    },
    headerBlock: {
      marginBottom: 20,
    },
    eyebrow: {
      color: colors.accent,
      fontSize: 13 * fontScale,
      fontWeight: "500",
      marginBottom: 6,
    },
    heading: {
      color: colors.text,
      fontSize: 26 * fontScale,
      fontWeight: "600",
      letterSpacing: -0.4,
      lineHeight: 32 * fontScale,
      marginBottom: 6,
    },
    headingSub: {
      color: colors.sub,
      fontSize: 14.5 * fontScale,
      lineHeight: 21 * fontScale,
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
    nameRow: {
      flexDirection: "row",
      gap: 12,
    },
    nameField: {
      flex: 1,
    },
    fieldGroup: {
      marginBottom: 14,
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
      marginTop: 5,
    },
    // Password policy checklist
    policyContainer: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    segmentTrack: {
      flexDirection: "row",
      gap: 6,
      marginBottom: 8,
    },
    segmentBar: {
      flex: 1,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: colors.border,
    },
    requirementsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      rowGap: 6,
    },
    requirementRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      width: "50%",
    },
    requirementText: {
      fontSize: 12 * fontScale,
    },
    // Submit button
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
      marginTop: 20,
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

