import { ActivityIndicator, StyleSheet, View, Text } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../context/AuthContext";

const C = {
  bg: "#1a1f2e",
  accent: "#00d4aa",
  sub: "#6b7280",
};
console.log("test");

/**
 * Entry point for the app.
 *
 * While the AuthProvider is restoring a persisted session (bootstrapping), we
 * show a themed splash/loading indicator. Once settled:
 *   - Unauthenticated → send to the login screen.
 *   - Authenticated   → send into the tabs.
 *
 * This lives at the root so expo-router always lands here first.
 */
export default function Index() {
  const { isBootstrapping, isAuthenticated } = useAuth();

  if (isBootstrapping) {
    return (
      <View style={styles.splash}>
        <Text style={styles.logo}>VoltWise</Text>
        <ActivityIndicator size="large" color={C.accent} style={styles.spinner} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Redirect href="/(tabs)/dashboard" />;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  logo: {
    color: C.accent,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: 1,
  },
  spinner: {
    marginTop: 8,
  },
});
