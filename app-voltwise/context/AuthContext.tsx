import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { DeviceEventEmitter } from "react-native";
import {
  api,
  clientDescriptor,
  setAuthToken,
  AUTH_UNAUTHORIZED_EVENT,
  AuthUser,
  AuthResponse,
} from "../lib/api";
import { saveToken, getToken, deleteToken } from "../lib/auth-storage";

// ---- Types ----

interface UpdateProfileDto {
  name?: string;
  email?: string;
  currency?: string;
  currentPassword?: string;
  newPassword?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isBootstrapping: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (firstName: string, lastName: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (dto: UpdateProfileDto) => Promise<void>;
}

// ---- Context ----

const AuthContext = createContext<AuthContextValue | null>(null);

// ---- Provider ----

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  // Ref to prevent double-signout from the event listener racing with unmount.
  const signingOut = useRef(false);

  /**
   * Persist a token in memory + secure storage + the api module so that
   * subsequent requests carry the Authorization header automatically.
   */
  const applyToken = useCallback((t: string) => {
    setAuthToken(t);
    setToken(t);
  }, []);

  /**
   * Clear all auth state. Safe to call multiple times.
   */
  const clearAuth = useCallback(async () => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
    await deleteToken();
  }, []);

  // On mount: restore a persisted token and verify it with GET /auth/me.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const storedToken = await getToken();
        if (!storedToken) return;

        applyToken(storedToken);
        const me = await api.get<AuthUser>("/auth/me");

        if (!cancelled) {
          setUser(me);
        }
      } catch {
        // Token invalid or expired — start fresh.
        if (!cancelled) {
          await clearAuth();
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for 401 events from the API layer and auto sign-out.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(AUTH_UNAUTHORIZED_EVENT, async () => {
      if (signingOut.current) return;
      signingOut.current = true;
      await clearAuth();
      signingOut.current = false;
    });
    return () => sub.remove();
  }, [clearAuth]);

  // ---- Auth actions ----

  const signIn = useCallback(
    async (email: string, password: string) => {
      // `client` names this device in the account's session list — see
      // Settings → Privacy & Security.
      const { token: t, user: u } = await api.post<AuthResponse>("/auth/login", {
        email,
        password,
        client: clientDescriptor(),
      });
      await saveToken(t);
      applyToken(t);
      setUser(u);
    },
    [applyToken]
  );

  const signUp = useCallback(
    async (firstName: string, lastName: string, email: string, password: string) => {
      const { token: t, user: u } = await api.post<AuthResponse>("/auth/register", {
        firstName,
        lastName,
        email,
        password,
        client: clientDescriptor(),
      });
      await saveToken(t);
      applyToken(t);
      setUser(u);
    },
    [applyToken]
  );

  const signOut = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    await clearAuth();
    signingOut.current = false;
  }, [clearAuth]);

  const updateProfile = useCallback(
    async (dto: UpdateProfileDto) => {
      const updated = await api.patch<AuthUser>("/auth/me", dto);
      setUser(updated);
    },
    []
  );

  const value: AuthContextValue = {
    user,
    token,
    isBootstrapping,
    isAuthenticated: user !== null,
    signIn,
    signUp,
    signOut,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---- Hook ----

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() must be used inside <AuthProvider>.");
  }
  return ctx;
}
