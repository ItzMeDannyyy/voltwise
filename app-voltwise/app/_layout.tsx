import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider } from "../context/AuthContext";
import { MqttProvider } from "../context/MqttContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";

function RootLayoutNav() {
  const { colors, colorScheme } = useTheme();

  return (
    <>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="profile"
          options={{
            headerShown: true,
            title: "Profile",
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: "700", fontSize: 18 },
            headerBackTitle: "",
            // Allow presenting as a standard stack push (not a modal).
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            headerShown: true,
            title: "Settings",
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: "700", fontSize: 18 },
            headerBackTitle: "",
            presentation: "card",
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    // Required once at the root for any react-native-gesture-handler gesture
    // (incl. the PullToRefresh component) to receive touches.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <MqttProvider>
            <RootLayoutNav />
          </MqttProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
