import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import AppLockOverlay from "../components/AppLockOverlay";
import { AppLockProvider } from "../context/AppLockContext";
import { AuthProvider } from "../context/AuthContext";
import { MqttProvider } from "../context/MqttContext";
import { NotificationProvider } from "../context/NotificationContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { UnitsProvider } from "../context/UnitsContext";

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
        <Stack.Screen
          name="units-settings"
          options={{
            headerShown: true,
            title: "Units & Tariff",
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: "700", fontSize: 18 },
            headerBackTitle: "",
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="iot-settings"
          options={{
            headerShown: true,
            title: "Sensor & IoT",
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: "700", fontSize: 18 },
            headerBackTitle: "",
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="data-settings"
          options={{
            headerShown: true,
            title: "Data & Export",
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: "700", fontSize: 18 },
            headerBackTitle: "",
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="notification-settings"
          options={{
            headerShown: true,
            title: "Notifications",
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: "700", fontSize: 18 },
            headerBackTitle: "",
            presentation: "card",
          }}
        />
        <Stack.Screen
          name="privacy-settings"
          options={{
            headerShown: true,
            title: "Privacy & Security",
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: "700", fontSize: 18 },
            headerBackTitle: "",
            presentation: "card",
          }}
        />
      </Stack>

      {/* Sits above the navigator so a lock covers whatever screen the user
          left, without unwinding where they were. */}
      <AppLockOverlay />
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
          {/* Below auth: the lock only applies to a signed-in app. */}
          <AppLockProvider>
            {/* Below auth: the tariff it pulls is per-account. */}
            <UnitsProvider>
              <MqttProvider>
                {/* Innermost: the banner engine gates its /alerts fetch on auth. */}
                <NotificationProvider>
                  <RootLayoutNav />
                </NotificationProvider>
              </MqttProvider>
            </UnitsProvider>
          </AppLockProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
