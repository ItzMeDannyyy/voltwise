import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../context/AuthContext";

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="profile"
          options={{
            headerShown: true,
            title: "Profile",
            headerStyle: { backgroundColor: "#1a1f2e" },
            headerTintColor: "#ffffff",
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
            headerStyle: { backgroundColor: "#1a1f2e" },
            headerTintColor: "#ffffff",
            headerTitleStyle: { fontWeight: "700", fontSize: 18 },
            headerBackTitle: "",
            presentation: "card",
          }}
        />
      </Stack>
    </AuthProvider>
  );
}
