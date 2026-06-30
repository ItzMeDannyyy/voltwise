import { useState, useRef, useEffect } from "react";
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
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";

// ---- Palette (matches login / forgot-password) ----

const C = {
  bg: "#1a1f2e",
  card: "#242b3d",
  accent: "#00d4aa",
  text: "#ffffff",
  sub: "#9ca3af",
  border: "#2d3448",
  red: "#ef4444",
  inactive: "#6b7280",
  // Strength bar colours
  strengthWeak: "#ef4444",
  strengthFair: "#f97316",
  strengthGood: "#f59e0b",
  strengthStrong: "#00d4aa",
};

// ---- Password policy ----

const POLICY = {
  minLength: 12,
  longLength: 16,
  hasLetter: /[A-Za-z]/,
  hasNumber: /[0-9]/,
  hasSpecial: /[^A-Za-z0-9]/,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface PolicyCheck {
  label: string;
  met: boolean;
}

interface StrengthResult {
  level: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
  /** 0–1 fraction for the animated bar */
  fraction: number;
  checks: PolicyCheck[];
}

function computeStrength(pw: string): StrengthResult {
  const checks: PolicyCheck[] = [
    { label: "12+ characters", met: pw.length >= POLICY.minLength },
    { label: "Letter", met: POLICY.hasLetter.test(pw) },
    { label: "Number", met: POLICY.hasNumber.test(pw) },
    { label: "Special character", met: POLICY.hasSpecial.test(pw) },
  ];

  const metCount = checks.filter((c) => c.met).length;
  // Small bonus for extra-long password
  const bonus = pw.length >= POLICY.longLength ? 0.5 : 0;
  const rawScore = metCount + bonus;

  let level: 0 | 1 | 2 | 3 | 4;
  let label: string;
  let color: string;
  let fraction: number;

  if (pw.length === 0) {
    level = 0;
    label = "";
    color = C.strengthWeak;
    fraction = 0;
  } else if (rawScore <= 1) {
    level = 1;
    label = "Weak";
    color = C.strengthWeak;
    fraction = 0.25;
  } else if (rawScore <= 2) {
    level = 2;
    label = "Fair";
    color = C.strengthFair;
    fraction = 0.5;
  } else if (rawScore <= 3) {
    level = 3;
    label = "Good";
    color = C.strengthGood;
    fraction = 0.75;
  } else {
    level = 4;
    label = "Strong";
    color = C.strengthStrong;
    fraction = 1;
  }

  return { level, label, color, fraction, checks };
}

function isPolicyMet(pw: string): boolean {
  return (
    pw.length >= POLICY.minLength &&
    POLICY.hasLetter.test(pw) &&
    POLICY.hasNumber.test(pw) &&
    POLICY.hasSpecial.test(pw)
  );
}

// ---- Strength bar component ----

interface StrengthBarProps {
  password: string;
}

function StrengthBar({ password }: StrengthBarProps) {
  const strength = computeStrength(password);
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: strength.fraction,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [strength.fraction, widthAnim]);

  if (password.length === 0) return null;

  return (
    <View style={styles.strengthContainer}>
      {/* Bar track + animated fill */}
      <View style={styles.strengthTrack}>
        <Animated.View
          style={[
            styles.strengthFill,
            {
              backgroundColor: strength.color,
              width: widthAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        />
      </View>

      {/* Level label */}
      {strength.label !== "" && (
        <Text style={[styles.strengthLabel, { color: strength.color }]}>
          {strength.label}
        </Text>
      )}

      {/* Requirements checklist */}
      <View style={styles.requirementsGrid}>
        {strength.checks.map((check) => (
          <View key={check.label} style={styles.requirementRow}>
            <Ionicons
              name={check.met ? "checkmark-circle" : "ellipse-outline"}
              size={14}
              color={check.met ? C.accent : C.inactive}
            />
            <Text
              style={[
                styles.requirementText,
                { color: check.met ? C.text : C.inactive },
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

export default function RegisterScreen() {
  const { signUp } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Field-level errors
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

  function validate(): boolean {
    let valid = true;

    if (!firstName.trim()) {
      setFirstNameError("First name is required.");
      valid = false;
    } else {
      setFirstNameError(null);
    }

    if (!lastName.trim()) {
      setLastNameError("Last name is required.");
      valid = false;
    } else {
      setLastNameError(null);
    }

    if (!email.trim()) {
      setEmailError("Email is required.");
      valid = false;
    } else if (!EMAIL_REGEX.test(email.trim())) {
      setEmailError("Enter a valid email address.");
      valid = false;
    } else {
      setEmailError(null);
    }

    if (!password) {
      setPasswordError("Password is required.");
      valid = false;
    } else if (!isPolicyMet(password)) {
      setPasswordError(
        "Password must be 12+ characters with a letter, number, and special character."
      );
      valid = false;
    } else {
      setPasswordError(null);
    }

    if (!confirmPassword) {
      setConfirmError("Please confirm your password.");
      valid = false;
    } else if (password !== confirmPassword) {
      setConfirmError("Passwords do not match.");
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
        err instanceof Error ? err.message : "Registration failed. Please try again.";
      if (msg.includes("409") || msg.toLowerCase().includes("already")) {
        setError("An account with that email already exists.");
      } else if (
        msg.includes("400") ||
        msg.toLowerCase().includes("password") ||
        msg.toLowerCase().includes("policy")
      ) {
        setError(msg);
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
          {/* Wordmark */}
          <View style={styles.brandRow}>
            <Image
              source={require("../../assets/images/voltwise-logo.png")}
              style={styles.brandLogo}
              resizeMode="contain"
            />
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.heading}>Create account</Text>
            <Text style={styles.headingSub}>Start monitoring your energy usage.</Text>

            {/* Global error banner */}
            {error && (
              <View style={styles.errorBanner}>
                <Ionicons name="warning-outline" size={16} color={C.red} />
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            )}

            {/* First name + Last name — two equal columns */}
            <View style={styles.nameRow}>
              {/* First name */}
              <View style={[styles.fieldGroup, styles.nameField]}>
                <Text style={styles.label}>First name</Text>
                <TextInput
                  style={[styles.input, firstNameError ? styles.inputError : null]}
                  placeholder="Jane"
                  placeholderTextColor={C.inactive}
                  value={firstName}
                  onChangeText={(t) => {
                    setFirstName(t);
                    if (firstNameError) setFirstNameError(null);
                  }}
                  autoCapitalize="words"
                  textContentType="givenName"
                  returnKeyType="next"
                  onSubmitEditing={() => lastNameRef.current?.focus()}
                />
                {firstNameError && (
                  <Text style={styles.fieldError}>{firstNameError}</Text>
                )}
              </View>

              {/* Last name */}
              <View style={[styles.fieldGroup, styles.nameField]}>
                <Text style={styles.label}>Last name</Text>
                <TextInput
                  ref={lastNameRef}
                  style={[styles.input, lastNameError ? styles.inputError : null]}
                  placeholder="Doe"
                  placeholderTextColor={C.inactive}
                  value={lastName}
                  onChangeText={(t) => {
                    setLastName(t);
                    if (lastNameError) setLastNameError(null);
                  }}
                  autoCapitalize="words"
                  textContentType="familyName"
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                />
                {lastNameError && (
                  <Text style={styles.fieldError}>{lastNameError}</Text>
                )}
              </View>
            </View>

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                ref={emailRef}
                style={[styles.input, emailError ? styles.inputError : null]}
                placeholder="you@example.com"
                placeholderTextColor={C.inactive}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (emailError) setEmailError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
              {emailError && <Text style={styles.fieldError}>{emailError}</Text>}
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View
                style={[styles.inputRow, passwordError ? styles.inputError : null]}
              >
                <TextInput
                  ref={passwordRef}
                  style={styles.inputInner}
                  placeholder="Min. 12 characters"
                  placeholderTextColor={C.inactive}
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    if (passwordError) setPasswordError(null);
                  }}
                  secureTextEntry={!showPassword}
                  textContentType="newPassword"
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={C.inactive}
                  />
                </TouchableOpacity>
              </View>
              {passwordError && (
                <Text style={styles.fieldError}>{passwordError}</Text>
              )}

              {/* Strength bar — visible once the user starts typing */}
              <StrengthBar password={password} />
            </View>

            {/* Confirm password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Confirm password</Text>
              <View
                style={[styles.inputRow, confirmError ? styles.inputError : null]}
              >
                <TextInput
                  ref={confirmRef}
                  style={styles.inputInner}
                  placeholder="Re-enter password"
                  placeholderTextColor={C.inactive}
                  value={confirmPassword}
                  onChangeText={(t) => {
                    setConfirmPassword(t);
                    if (confirmError) setConfirmError(null);
                  }}
                  secureTextEntry={!showConfirmPassword}
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword((v) => !v)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={
                    showConfirmPassword ? "Hide confirm password" : "Show confirm password"
                  }
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={C.inactive}
                  />
                </TouchableOpacity>
              </View>
              {confirmError && (
                <Text style={styles.fieldError}>{confirmError}</Text>
              )}
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleRegister}
              activeOpacity={0.8}
              disabled={loading}
              accessibilityLabel="Create account"
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator size="small" color="#1a1f2e" />
              ) : (
                <Text style={styles.submitBtnText}>Create account</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Switch to login */}
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Already have an account?</Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                <Text style={styles.switchLink}> Sign in</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---- Styles ----

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
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
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: C.border,
  },
  heading: {
    color: C.text,
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  headingSub: {
    color: C.sub,
    fontSize: 14,
    marginBottom: 20,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    color: C.red,
    fontSize: 14,
    flex: 1,
  },
  // Two-column row for first / last name
  nameRow: {
    flexDirection: "row",
    gap: 12,
  },
  nameField: {
    flex: 1,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    color: C.sub,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    backgroundColor: C.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    height: 50,
    color: C.text,
    fontSize: 15,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    height: 50,
  },
  inputInner: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    height: 50,
  },
  inputError: {
    borderColor: C.red,
  },
  fieldError: {
    color: C.red,
    fontSize: 12,
    marginTop: 4,
  },
  // Strength bar
  strengthContainer: {
    marginTop: 10,
  },
  strengthTrack: {
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  strengthFill: {
    height: 4,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
    textAlign: "right",
  },
  requirementsGrid: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  requirementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    width: "48%",
  },
  requirementText: {
    fontSize: 11,
  },
  // Submit button
  submitBtn: {
    backgroundColor: C.accent,
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
    color: "#1a1f2e",
    fontSize: 16,
    fontWeight: "700",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  switchText: {
    color: C.sub,
    fontSize: 14,
  },
  switchLink: {
    color: C.accent,
    fontSize: 14,
    fontWeight: "600",
  },
});
