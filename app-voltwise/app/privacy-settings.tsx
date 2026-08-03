import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import ConfirmModal from "../components/ConfirmModal";
import DeleteAccountModal from "../components/DeleteAccountModal";
import { PullToRefresh } from "../components/pull-to-refresh";
import { ScreenContainer, useThemedStyles } from "../components/themed";
import { useAppLock } from "../context/AppLockContext";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import { useTheme } from "../context/ThemeContext";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { api, type ApiSession, type RevokeResult, type SecurityOverview } from "../lib/api";
import {
  LOCK_AVAILABILITY_HINTS,
  LOCK_DELAYS,
  LOCK_DELAY_HINTS,
  LOCK_DELAY_LABELS,
  type LockDelay,
} from "../lib/applock-prefs";
import {
  formatExpiry,
  formatLastSeen,
  formatPasswordAge,
  formatSignedIn,
  sortSessions,
} from "../lib/session-format";
import type { ThemeColors } from "../constants/theme";

/**
 * Privacy & Security — who can get into this account, and from where.
 *
 * The screen is deliberately split by *where the control actually lives*,
 * because that is what decides the consequence of touching it:
 *
 *  - The app lock is this handset's business. It never leaves the device, and
 *    resetting the device's data turns it off.
 *  - Sessions are the account's business. Revoking one reaches out and stops a
 *    phone on the other side of the country from loading the dashboard, which
 *    is a much bigger action than it looks like from a settings row.
 *  - OS permissions are neither: they belong to the operating system, so this
 *    screen only reports them and hands off to the system settings app. It
 *    never claims to have granted or revoked anything itself.
 *
 * Everything server-side is read through one /security/overview call, and both
 * revoke endpoints return a fresh overview — so a mutation leaves the screen
 * holding true state without a follow-up fetch that could race it.
 */

const isWeb = Platform.OS === "web";

/** OS permission status, in the vocabulary all three sources agree on. */
type PermissionStatus = "granted" | "denied" | "undetermined" | "unsupported";

const PERMISSION_LABELS: Record<PermissionStatus, string> = {
  granted: "Allowed",
  denied: "Blocked",
  undetermined: "Not asked",
  unsupported: "N/A",
};

/** Icon for a session row, by the platform the client reported. */
function platformIcon(platform: string): keyof typeof Ionicons.glyphMap {
  if (platform === "android") return "phone-portrait-outline";
  if (platform === "ios") return "phone-portrait-outline";
  if (platform === "web") return "desktop-outline";
  return "help-circle-outline";
}

export default function PrivacySettingsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { permission: notificationPermission, requestPermission } = useNotifications();
  const {
    prefs: lockPrefs,
    availability,
    methodLabel,
    isDormant,
    setEnabled: setLockEnabled,
    setDelay: setLockDelay,
    refreshAvailability,
  } = useAppLock();

  // ---- Server state ----
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ---- Local UI state ----
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);
  const [revokingAll, setRevokingAll] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lockError, setLockError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [cameraPermission, setCameraPermission] = useState<PermissionStatus>(
    isWeb ? "unsupported" : "undetermined"
  );
  const [photosPermission, setPhotosPermission] = useState<PermissionStatus>(
    isWeb ? "unsupported" : "undetermined"
  );

  // ---- Loading ----

  const fetchOverview = useCallback(async () => {
    try {
      const next = await api.get<SecurityOverview>("/security/overview");
      setOverview(next);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Server unreachable.");
    }
  }, []);

  /**
   * Read-only permission checks. Never requests anything: opening a settings
   * screen is not consent to be asked for the camera, and a prompt nobody
   * invited is how people learn to hit Deny.
   */
  const readPermissions = useCallback(async () => {
    if (isWeb) return;

    try {
      const camera = await ImagePicker.getCameraPermissionsAsync();
      setCameraPermission(camera.status as PermissionStatus);
    } catch {
      setCameraPermission("unsupported");
    }

    try {
      const photos = await ImagePicker.getMediaLibraryPermissionsAsync();
      setPhotosPermission(photos.status as PermissionStatus);
    } catch {
      setPhotosPermission("unsupported");
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchOverview(), readPermissions(), refreshAvailability()]);
  }, [fetchOverview, readPermissions, refreshAvailability]);

  const { refreshing, onRefresh } = usePullToRefresh(refreshAll);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  // ---- Actions ----

  const handleToggleLock = useCallback(
    async (value: boolean) => {
      setLockError(null);
      const failure = await setLockEnabled(value);
      if (failure !== null) setLockError(failure);
    },
    [setLockEnabled]
  );

  const handleRevoke = useCallback(async (session: ApiSession) => {
    setBusySessionId(session.id);
    setNotice(null);
    try {
      const result = await api.delete<RevokeResult>(`/security/sessions/${session.id}`);
      setOverview(result.overview);
      setNotice(`${session.label} has been signed out.`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "That device could not be signed out."
      );
    } finally {
      setBusySessionId(null);
    }
  }, []);

  const handleRevokeAll = useCallback(async () => {
    setConfirmRevokeAll(false);
    setRevokingAll(true);
    setNotice(null);
    try {
      const result = await api.post<RevokeResult>("/security/sessions/revoke-others");
      setOverview(result.overview);
      setNotice(
        result.revokedCount === 0
          ? "There were no other devices signed in."
          : `Signed out ${result.revokedCount} other device${result.revokedCount === 1 ? "" : "s"}.`
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "The other devices could not be signed out."
      );
    } finally {
      setRevokingAll(false);
    }
  }, []);

  /**
   * Deleting the account also destroys the session this request is using, so
   * the local sign-out afterwards is bookkeeping rather than security — the
   * token is already dead on the server. It still matters: without it the app
   * would sit on a screen whose data no longer exists.
   */
  const handleDeleteAccount = useCallback(
    async (password: string) => {
      setDeleting(true);
      setDeleteError(null);
      try {
        await api.delete("/security/account", { password });
        setDeleteOpen(false);
        await signOut();
        router.replace("/(auth)/login");
      } catch (error) {
        setDeleteError(
          error instanceof Error ? error.message : "The account could not be deleted."
        );
      } finally {
        setDeleting(false);
      }
    },
    [signOut, router]
  );

  const openSystemSettings = useCallback(() => {
    Linking.openSettings().catch(() => {
      setNotice("Open your device settings to change this permission.");
    });
  }, []);

  // ---- Derived ----

  const sessions = overview ? sortSessions(overview.sessions) : [];
  const otherCount = sessions.filter((session) => !session.current).length;
  const account = overview?.account ?? null;

  const permissionRows: {
    id: string;
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    hint: string;
    status: PermissionStatus;
    onPress?: () => void;
  }[] = [
    {
      id: "notifications",
      icon: "notifications-outline",
      title: "Notifications",
      hint: "Alert banners when a reading crosses a threshold",
      status: notificationPermission as PermissionStatus,
      onPress:
        notificationPermission === "undetermined"
          ? () => void requestPermission()
          : notificationPermission === "denied"
            ? openSystemSettings
            : undefined,
    },
    {
      id: "camera",
      icon: "camera-outline",
      title: "Camera",
      hint: "Only used when you photograph a device you are adding",
      status: cameraPermission,
      onPress: cameraPermission === "denied" ? openSystemSettings : undefined,
    },
    {
      id: "photos",
      icon: "images-outline",
      title: "Photos",
      hint: "Only used when you pick an existing photo for a device",
      status: photosPermission,
      onPress: photosPermission === "denied" ? openSystemSettings : undefined,
    },
  ];

  // ---- Render ----

  return (
    <ScreenContainer edges={["bottom"]}>
      <PullToRefresh
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={styles.scroll}
      >
        {/* ---- App lock (this device only) ---- */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>App lock</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.rowIcon}>
                <Ionicons
                  name={lockPrefs.enabled ? "lock-closed-outline" : "lock-open-outline"}
                  size={18}
                  color={lockPrefs.enabled ? colors.accent : colors.sub}
                />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Require unlock</Text>
                <Text style={styles.rowSubtitle}>
                  {availability === "ready"
                    ? methodLabel
                    : LOCK_AVAILABILITY_HINTS[availability]}
                </Text>
              </View>
              <Switch
                value={lockPrefs.enabled}
                onValueChange={(value) => void handleToggleLock(value)}
                disabled={availability !== "ready" && !lockPrefs.enabled}
                trackColor={{ false: colors.border, true: colors.accentBorder }}
                thumbColor={lockPrefs.enabled ? colors.accent : colors.inactive}
                accessibilityLabel="Require unlock to open VoltWise"
              />
            </View>

            {lockPrefs.enabled && (
              <View style={[styles.optionRow, styles.rowDivider]}>
                <View style={styles.optionLabelRow}>
                  <Ionicons name="time-outline" size={18} color={colors.sub} />
                  <Text style={styles.optionLabel}>Lock when I switch away</Text>
                </View>
                <View style={styles.segmentRow}>
                  {LOCK_DELAYS.map((delay) => {
                    const active = delay === lockPrefs.delay;
                    return (
                      <Pressable
                        key={delay}
                        style={[styles.segment, active && styles.segmentActive]}
                        onPress={() => setLockDelay(delay as LockDelay)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={LOCK_DELAY_LABELS[delay]}
                      >
                        <Text
                          style={[styles.segmentText, active && styles.segmentTextActive]}
                        >
                          {LOCK_DELAY_LABELS[delay]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.optionHint}>{LOCK_DELAY_HINTS[lockPrefs.delay]}</Text>
              </View>
            )}

            {isDormant && (
              <View style={[styles.noticeRow, styles.rowDivider]}>
                <Ionicons name="warning-outline" size={16} color={colors.amber} />
                <Text style={[styles.noticeText, { color: colors.amber }]}>
                  The lock is switched on but this device can no longer verify you, so it is
                  not being applied. {LOCK_AVAILABILITY_HINTS[availability]}
                </Text>
              </View>
            )}

            {lockError !== null && (
              <View style={[styles.noticeRow, styles.rowDivider]}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.red} />
                <Text style={[styles.noticeText, { color: colors.red }]}>{lockError}</Text>
              </View>
            )}
          </View>

          <Text style={styles.footnote}>
            Stays on this device and never reaches your account. Signing out is always
            available from the lock screen, so a phone that stops recognising you can still
            reach the password.
          </Text>
        </View>

        {/* ---- Sessions (the account) ---- */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Signed-in devices</Text>
          <View style={styles.card}>
            {overview === null ? (
              <View style={styles.placeholderRow}>
                {loadError === null ? (
                  <>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={styles.placeholderText}>Loading your devices…</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="cloud-offline-outline" size={18} color={colors.sub} />
                    <Text style={styles.placeholderText}>{loadError}</Text>
                  </>
                )}
              </View>
            ) : (
              sessions.map((session, idx) => {
                const busy = busySessionId === session.id;
                return (
                  <View
                    key={session.id}
                    style={[styles.sessionRow, idx > 0 && styles.rowDivider]}
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons
                        name={platformIcon(session.platform)}
                        size={18}
                        color={session.current ? colors.accent : colors.sub}
                      />
                    </View>

                    <View style={styles.rowBody}>
                      <View style={styles.sessionTitleRow}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {session.label}
                        </Text>
                        {session.current && (
                          <View style={styles.currentBadge}>
                            <Text style={styles.currentBadgeText}>This device</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.rowSubtitle}>
                        {formatSignedIn(session.createdAt)}
                        {session.ipAddress !== null ? ` · ${session.ipAddress}` : ""}
                      </Text>
                      <Text style={styles.rowSubtitle}>
                        {formatLastSeen(session.lastSeenAt)} ·{" "}
                        {formatExpiry(session.expiresAt)}
                      </Text>
                    </View>

                    {!session.current &&
                      (busy ? (
                        <ActivityIndicator size="small" color={colors.red} />
                      ) : (
                        <Pressable
                          onPress={() => void handleRevoke(session)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Sign out ${session.label}`}
                        >
                          <Text style={styles.revokeText}>Sign out</Text>
                        </Pressable>
                      ))}
                  </View>
                );
              })
            )}

            {overview !== null && (
              <Pressable
                style={[
                  styles.row,
                  styles.rowDivider,
                  (otherCount === 0 || revokingAll) && styles.rowDisabled,
                ]}
                onPress={() => setConfirmRevokeAll(true)}
                disabled={otherCount === 0 || revokingAll}
                accessibilityRole="button"
                accessibilityLabel="Sign out everywhere else"
                accessibilityState={{ disabled: otherCount === 0, busy: revokingAll }}
              >
                <View style={styles.rowIcon}>
                  {revokingAll ? (
                    <ActivityIndicator size="small" color={colors.red} />
                  ) : (
                    <Ionicons name="log-out-outline" size={18} color={colors.red} />
                  )}
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: colors.red }]}>
                    Sign out everywhere else
                  </Text>
                  <Text style={styles.rowSubtitle}>
                    {otherCount === 0
                      ? "This is the only device signed in"
                      : `Ends ${otherCount} other session${otherCount === 1 ? "" : "s"} immediately`}
                  </Text>
                </View>
              </Pressable>
            )}
          </View>

          <Text style={styles.footnote}>
            Each sign-in opens its own session and expires on its own after seven days.
            Signing one out takes effect on the very next request that device makes — it
            does not wait for the session to run out.
          </Text>
        </View>

        {/* ---- OS permissions ---- */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Permissions on this device</Text>
          <View style={styles.card}>
            {permissionRows.map((row, idx) => (
              <Pressable
                key={row.id}
                style={[styles.row, idx > 0 && styles.rowDivider]}
                onPress={row.onPress}
                disabled={row.onPress === undefined}
                accessibilityRole={row.onPress ? "button" : undefined}
                accessibilityLabel={`${row.title}: ${PERMISSION_LABELS[row.status]}`}
              >
                <View style={styles.rowIcon}>
                  <Ionicons
                    name={row.icon}
                    size={18}
                    color={row.status === "granted" ? colors.accent : colors.sub}
                  />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{row.title}</Text>
                  <Text style={styles.rowSubtitle}>{row.hint}</Text>
                </View>
                <Text
                  style={[
                    styles.rowValue,
                    row.status === "granted" && { color: colors.green },
                    row.status === "denied" && { color: colors.red },
                  ]}
                >
                  {PERMISSION_LABELS[row.status]}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.footnote}>
            These belong to your phone, not to VoltWise — tap a blocked one to open your
            device settings. Nothing here is asked for until the feature that needs it is
            used.
          </Text>
        </View>

        {/* ---- Account safety ---- */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Account safety</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name="mail-outline" size={18} color={colors.sub} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Signed in as</Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                  {account?.email ?? user?.email ?? "—"}
                </Text>
              </View>
            </View>

            <Pressable
              style={[styles.row, styles.rowDivider]}
              onPress={() => router.push("/profile")}
              accessibilityRole="button"
              accessibilityLabel="Change your password on the profile screen"
            >
              <View style={styles.rowIcon}>
                <Ionicons name="key-outline" size={18} color={colors.sub} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>Password</Text>
                <Text style={styles.rowSubtitle}>
                  {account === null
                    ? "Change it from your profile"
                    : formatPasswordAge(account.passwordChangedAt, account.memberSince)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.sub} />
            </Pressable>
          </View>

          <Text style={styles.footnote}>
            Changing your password signs out every other device automatically, so whoever
            knew the old one is left outside.
          </Text>
        </View>

        {/* ---- Danger zone ---- */}
        <View style={styles.group}>
          <Text style={styles.groupHeading}>Danger zone</Text>
          <View style={[styles.card, styles.dangerCard]}>
            <Pressable
              style={styles.row}
              onPress={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Delete your account"
            >
              <View style={styles.rowIcon}>
                <Ionicons name="trash-outline" size={18} color={colors.red} />
              </View>
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: colors.red }]}>Delete account</Text>
                <Text style={styles.rowSubtitle}>
                  Erases your readings, devices, alerts and rate. Cannot be undone.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.red} />
            </Pressable>
          </View>

          <Text style={styles.footnote}>
            Want a copy first? Settings → Data &amp; Export downloads everything as CSV or
            JSON before you go.
          </Text>
        </View>

        {notice !== null && (
          <View style={styles.banner}>
            <Ionicons name="information-circle-outline" size={18} color={colors.accent} />
            <Text style={styles.bannerText}>{notice}</Text>
            <Pressable
              onPress={() => setNotice(null)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
            >
              <Ionicons name="close" size={18} color={colors.accent} />
            </Pressable>
          </View>
        )}

        <View style={{ height: 32 }} />
      </PullToRefresh>

      <ConfirmModal
        visible={confirmRevokeAll}
        icon="log-out-outline"
        destructive
        title="Sign out everywhere else?"
        message={`Ends ${otherCount} other session${otherCount === 1 ? "" : "s"}. Those devices will need the password again. This device stays signed in.`}
        confirmText="Sign them out"
        cancelText="Cancel"
        onConfirm={() => void handleRevokeAll()}
        onCancel={() => setConfirmRevokeAll(false)}
      />

      <DeleteAccountModal
        visible={deleteOpen}
        email={account?.email ?? user?.email ?? ""}
        busy={deleting}
        error={deleteError}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={(password) => void handleDeleteAccount(password)}
      />
    </ScreenContainer>
  );
}

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    scroll: {
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    group: {
      marginBottom: 24,
    },
    groupHeading: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      fontWeight: "700",
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: 10,
      marginLeft: 4,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    dangerCard: {
      borderColor: colors.red + "4d",
    },
    // ---- Rows ----
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    switchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    sessionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    rowDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    rowDisabled: {
      opacity: 0.55,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    rowBody: {
      flex: 1,
    },
    rowTitle: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "600",
      flexShrink: 1,
    },
    rowSubtitle: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 16 * fontScale,
      marginTop: 2,
    },
    rowValue: {
      color: colors.text,
      fontSize: 13 * fontScale,
      fontWeight: "700",
    },
    footnote: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 17 * fontScale,
      marginTop: 8,
      marginLeft: 4,
    },
    // ---- Sessions ----
    sessionTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    currentBadge: {
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      borderRadius: 8,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    currentBadgeText: {
      color: colors.accent,
      fontSize: 10 * fontScale,
      fontWeight: "800",
    },
    revokeText: {
      color: colors.red,
      fontSize: 13 * fontScale,
      fontWeight: "700",
    },
    placeholderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 20,
    },
    placeholderText: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      lineHeight: 18 * fontScale,
      flex: 1,
    },
    // ---- Options ----
    optionRow: {
      paddingHorizontal: 16,
      paddingVertical: 16,
      gap: 12,
    },
    optionLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    optionLabel: {
      color: colors.text,
      fontSize: 15 * fontScale,
      fontWeight: "600",
    },
    optionHint: {
      color: colors.sub,
      fontSize: 12 * fontScale,
      lineHeight: 16 * fontScale,
    },
    segmentRow: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 3,
      gap: 3,
    },
    segment: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    segmentActive: {
      backgroundColor: colors.accent,
    },
    segmentText: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      fontWeight: "600",
    },
    segmentTextActive: {
      color: colors.bg,
      fontWeight: "700",
    },
    // ---- Notices ----
    noticeRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    noticeText: {
      fontSize: 12 * fontScale,
      lineHeight: 17 * fontScale,
      flex: 1,
    },
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.accentSoft,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      padding: 14,
      marginBottom: 8,
    },
    bannerText: {
      color: colors.accent,
      fontSize: 13 * fontScale,
      lineHeight: 18 * fontScale,
      flex: 1,
    },
  });
}
