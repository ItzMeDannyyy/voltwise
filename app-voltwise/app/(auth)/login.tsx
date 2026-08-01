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
import { useAuth } from "../../context/AuthContext";

const C = {
  bg: "#1a1f2e",
  card: "#242b3d",
  accent: "#00d4aa",
  text: "#ffffff",
  sub: "#9ca3af",
  border: "#2d3448",
  red: "#ef4444",
  inactive: "#6b7280",
};

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline validation errors
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  function validate(): boolean {
    let valid = true;

    if (!email.trim()) {
      setEmailError("Email is required.");
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError("Enter a valid email address.");
      valid = false;
    } else {
      setEmailError(null);
    }

    if (!password) {
      setPasswordError("Password is required.");
      valid = false;
    } else if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      valid = false;
    } else {
      setPasswordError(null);
    }

    return valid;
  }

  async function handleLogin() {
    if (!validate()) return;

    setLoading(true);
    setError(null);

    try {
      await signIn(email.trim(), password);
      // Navigation is driven by the auth gate in app/index.tsx — no push needed here.
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Login failed. Please try again.";
      // Surface friendly messages for common cases.
      if (msg.includes("401") || msg.toLowerCase().includes("unauthorized")) {
        setError("Incorrect email or password.");
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
              source={require("../../assets/images/voltwise-logo/voltwise-logo-complete.png")}
              style={styles.brandLogo}
              resizeMode="contain"
            />
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.heading}>Sign in</Text>
            <Text style={styles.headingSub}>Welcome back. Enter your credentials.</Text>

            {/* Global error */}
            {error && (
              <View style={styles.errorBanner}>
                <Ionicons name="warning-outline" size={16} color={C.red} />
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            )}

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
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
              />
              {emailError && <Text style={styles.fieldError}>{emailError}</Text>}
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={[styles.inputRow, passwordError ? styles.inputError : null]}>
                <TextInput
                  style={styles.inputInner}
                  placeholder="••••••••"
                  placeholderTextColor={C.inactive}
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    if (passwordError) setPasswordError(null);
                  }}
                  secureTextEntry={!showPassword}
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={C.inactive}
                  />
                </TouchableOpacity>
              </View>
              {passwordError && <Text style={styles.fieldError}>{passwordError}</Text>}
            </View>

            {/* Forgot password */}
            <TouchableOpacity
              style={styles.forgotRow}
              onPress={() => router.push("/(auth)/forgot-password")}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.forgotLink}>Forgot password?</Text>
            </TouchableOpacity>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleLogin}
              activeOpacity={0.8}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#1a1f2e" />
              ) : (
                <Text style={styles.submitBtnText}>Sign in</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Switch to register */}
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Don{"'"}t have an account?</Text>
            <Link href="/(auth)/register" asChild>
              <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                <Text style={styles.switchLink}> Create one</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

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
  forgotRow: {
    alignItems: "flex-end",
    marginBottom: 16,
  },
  forgotLink: {
    color: C.accent,
    fontSize: 13,
    fontWeight: "600",
  },
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
