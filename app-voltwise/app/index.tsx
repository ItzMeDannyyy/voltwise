import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../context/AuthContext";

const C = {
  bg: "#1a1f2e",
  accent: "#00d4aa",
  sub: "#6b7280",
};

/**
 * Entry point for the app.
 *
 * While the AuthProvider is restoring a persisted session (bootstrapping), we
 * show the VoltWise logo as a themed splash/loading screen. Once settled:
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
        <Image
          source={require("../assets/images/voltwise-logo/voltwise-logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
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
    width: 150,
    height: 170,
  },
  spinner: {
    marginTop: 8,
  },
});
