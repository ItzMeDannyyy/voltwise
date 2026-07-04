import { Stack, Redirect } from "expo-router";
import { useAuth } from "../../context/AuthContext";

/**
 * Layout for the unauthenticated (auth) route group.
 * No headers — login/register manage their own chrome.
 *
 * Acts as the auth gate for this group: as soon as a sign-in/sign-up flips the
 * auth state, this re-renders and redirects into the tabs. This is what makes
 * the "tap Sign in → land on dashboard" flow work without an app reload.
 */
export default function AuthLayout() {
  const { isAuthenticated, isBootstrapping } = useAuth();

  if (!isBootstrapping && isAuthenticated) {
    return <Redirect href="/(tabs)/dashboard" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
