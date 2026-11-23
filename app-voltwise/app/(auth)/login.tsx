import { useState, useEffect, useRef } from "react";
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
  ArrowRight,
  Eye,
  EyeOff,
  Server,
} from "../../components/LucideIcons";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useThemedStyles } from "../../components/themed";
import { API_BASE_URL, checkHealth } from "../../lib/api";
import type { ThemeColors } from "../../constants/theme";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getApiHost(url: string): string {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url);
  return match ? match[1] : url;
}

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const { colors, fontScale } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);

  // Inline validation errors — checked on submit per taste-skill Forms rule
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const passwordRef = useRef<TextInput>(null);
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

    let cancelled = false;
    checkHealth().then((ok) => {
      if (!cancelled) setServerReachable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [enterOpacity, enterTranslate]);

  function validate(): boolean {
    let valid = true;

    if (!email.trim()) {
      setEmailError("Write the email address for your account.");
      valid = false;
    } else if (!EMAIL_REGEX.test(email.trim())) {
      setEmailError("Write an email address with an @ and a domain.");
      valid = false;
    } else {
      setEmailError(null);
    }

    if (!password) {
      setPasswordError("Enter your account password.");
      valid = false;
    } else if (password.length < 6) {
      setPasswordError("Passwords are at least 6 characters long.");
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
      // Navigation is driven by the auth gate in app/index.tsx.
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Could not sign in. Try again.";
      if (msg.includes("401") || msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("invalid credentials")) {
        setError("Email or password did not match an account on this server.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  const apiHost = getApiHost(API_BASE_URL);
  const statusColor =
    serverReachable === null
      ? colors.sub
      : serverReachable
        ? colors.green
        : colors.amber;
  const statusText =
    serverReachable === null
      ? `Checking ${apiHost}`
      : serverReachable
        ? `API online · ${apiHost}`
        : `API unreachable · ${apiHost}`;

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
            {/* Top utility bar: left-aligned wordmark + live API status */}
            <View style={styles.topBar}>
              <Image
                source={require("../../assets/images/voltwise-logo/voltwise-logo-complete.png")}
                style={styles.brandLogo}
                resizeMode="contain"
                accessibilityLabel="VoltWise"
              />
              <View style={styles.statusChip}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={styles.statusChipText} numberOfLines={1}>
                  {serverReachable === null
                    ? "Checking"
                    : serverReachable
                      ? "API online"
                      : "API offline"}
                </Text>
              </View>
            </View>

            {/* Editorial heading block: names the category and one hard fact */}
            <View style={styles.headerBlock}>
              <Text style={styles.eyebrow}>Home mains monitor & relay control</Text>
              <Text style={styles.heading}>Sign in to VoltWise</Text>
              <Text style={styles.headingSub}>
                Read live PZEM-004T telemetry every 2 seconds, track daily kWh, and switch the household relay.
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

              {/* Email */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Email address</Text>
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
                  onBlur={() => setFocusedField((prev) => (prev === "email" ? null : prev))}
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
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Password</Text>
                  <Pressable
                    onPress={() => router.push("/(auth)/forgot-password")}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="link"
                    accessibilityLabel="Reset forgotten password"
                    style={({ pressed }) => [pressed && styles.linkPressed]}
                  >
                    <Text style={styles.forgotLink}>Reset password</Text>
                  </Pressable>
                </View>

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
                    placeholder="Enter your password"
                    placeholderTextColor={colors.inactive}
                    value={password}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField((prev) => (prev === "password" ? null : prev))}
                    onChangeText={(t) => {
                      setPassword(t);
                      if (passwordError) setPasswordError(null);
                      if (error) setError(null);
                    }}
                    secureTextEntry={!showPassword}
                    textContentType="password"
                    autoComplete="password"
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                    accessibilityLabel="Password"
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.eyeBtn}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff size={18 * fontScale} color={colors.sub} strokeWidth={1.9} />
                    ) : (
                      <Eye size={18 * fontScale} color={colors.sub} strokeWidth={1.9} />
                    )}
                  </Pressable>
                </View>
                {passwordError && <Text style={styles.fieldError}>{passwordError}</Text>}
              </View>

              {/* Primary action: verb + object */}
              <Pressable
                style={({ pressed }) => [
                  styles.submitBtn,
                  pressed && !loading && styles.submitBtnPressed,
                  loading && styles.submitBtnDisabled,
                ]}
                onPress={handleLogin}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Sign in to dashboard"
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.bg} />
                ) : (
                  <View style={styles.submitBtnInner}>
                    <Text style={styles.submitBtnText}>Sign in to dashboard</Text>
                    <ArrowRight size={17 * fontScale} color={colors.bg} strokeWidth={2.2} />
                  </View>
                )}
              </Pressable>
            </View>

            {/* Footer row: switch route + real endpoint diagnostics */}
            <View style={styles.footerBlock}>
              <View style={styles.switchRow}>
                <Text style={styles.switchText}>New household install?</Text>
                <Link href="/(auth)/register" asChild>
                  <Pressable
                    hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                    style={({ pressed }) => [styles.switchLinkBtn, pressed && styles.linkPressed]}
                    accessibilityRole="link"
                    accessibilityLabel="Create an account"
                  >
                    <Text style={styles.switchLink}>Create an account</Text>
                  </Pressable>
                </Link>
              </View>

              <View style={styles.endpointRow}>
                <Server size={12 * fontScale} color={colors.inactive} strokeWidth={2} />
                <Text style={styles.endpointText} numberOfLines={1}>
                  {statusText}
                </Text>
              </View>
            </View>
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
      justifyContent: "space-between",
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
    statusChip: {
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
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusChipText: {
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
    fieldGroup: {
      marginBottom: 16,
    },
    labelRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    label: {
      color: colors.text,
      fontSize: 13.5 * fontScale,
      fontWeight: "500",
      marginBottom: 6,
    },
    forgotLink: {
      color: colors.accent,
      fontSize: 13 * fontScale,
      fontWeight: "500",
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
    footerBlock: {
      marginTop: 24,
      gap: 14,
    },
    switchRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
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
    endpointRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 4,
    },
    endpointText: {
      color: colors.inactive,
      fontSize: 12 * fontScale,
      flex: 1,
    },
  });
}

