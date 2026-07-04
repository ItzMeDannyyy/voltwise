import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import ConfirmModal from "../components/ConfirmModal";

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

const CURRENCIES = ["PHP", "USD", "EUR", "GBP", "JPY", "SGD", "AUD", "CAD"];

export default function ProfileScreen() {
  const { user, signOut, updateProfile } = useAuth();
  const router = useRouter();

  // Pre-populate editable fields from the user object.
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [currency, setCurrency] = useState(user?.currency ?? "PHP");

  // Change-password section
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  // UI state
  const [editing, setEditing] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Has the user changed anything since entering edit mode?
  const isDirty =
    name.trim() !== (user?.name ?? "") ||
    email.trim() !== (user?.email ?? "") ||
    currency !== (user?.currency ?? "PHP") ||
    currentPassword.length > 0 ||
    newPassword.length > 0;

  /** Reset all editable fields back to the persisted user values. */
  function resetFields() {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setCurrency(user?.currency ?? "PHP");
    setCurrentPassword("");
    setNewPassword("");
  }

  function enterEdit() {
    resetFields();
    setError(null);
    setSuccess(null);
    setEditing(true);
  }

  /** Cancel-edit pressed: prompt to save when dirty, otherwise just exit. */
  function requestCancelEdit() {
    if (isDirty) {
      setShowSaveModal(true);
    } else {
      setEditing(false);
      setError(null);
      setSuccess(null);
    }
  }

  /** Discard branch of the save modal — revert and leave edit mode. */
  function discardAndExit() {
    resetFields();
    setError(null);
    setShowSaveModal(false);
    setEditing(false);
  }

  /**
   * Validate + persist the profile. Returns true on success so the modal flow
   * can react. On success we drop out of edit mode; on failure we stay in edit
   * mode with the error banner so the user can correct and retry.
   */
  async function handleSave(): Promise<boolean> {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return false;
    }
    if (newPassword && newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return false;
    }
    if (newPassword && !currentPassword) {
      setError("Current password is required to set a new password.");
      return false;
    }

    // Snapshot previous user for optimistic rollback.
    const previousUser = {
      name: user?.name ?? "",
      email: user?.email ?? "",
      currency: user?.currency ?? "PHP",
    };

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const dto: Record<string, string> = {
        name: name.trim(),
        email: trimmedEmail,
        currency,
      };
      if (newPassword) {
        dto.currentPassword = currentPassword;
        dto.newPassword = newPassword;
      }

      await updateProfile(dto);

      // Clear the password fields on success and exit edit mode.
      setCurrentPassword("");
      setNewPassword("");
      setSuccess("Profile updated successfully.");
      setEditing(false);
      return true;
    } catch (err: unknown) {
      // Rollback optimistic local state.
      setName(previousUser.name);
      setEmail(previousUser.email);
      setCurrency(previousUser.currency);

      const msg =
        err instanceof Error ? err.message : "Update failed. Please try again.";
      if (msg.includes("401") || msg.toLowerCase().includes("unauthorized")) {
        setError("Incorrect current password.");
      } else {
        setError(msg);
      }
      return false;
    } finally {
      setSaving(false);
    }
  }

  /** Save branch of the save modal. */
  async function handleConfirmSave() {
    await handleSave();
    // Close the prompt regardless; a failed save keeps editing=true + error.
    setShowSaveModal(false);
  }

  async function handleConfirmSignOut() {
    setSigningOut(true);
    await signOut();
    setShowLogoutModal(false);
    // The auth gate in (tabs)/_layout.tsx also redirects, but be explicit.
    router.replace("/(auth)/login");
  }

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar / identity header */}
          <View style={styles.avatarSection}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>
                {(user?.name ?? user?.email ?? "?").charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.displayName}>
              {user?.name || "No name set"}
            </Text>
            <Text style={styles.displayEmail}>{user?.email}</Text>
          </View>

          {/* Feedback banners */}
          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="warning-outline" size={16} color={C.red} />
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          )}
          {success && (
            <View style={styles.successBanner}>
              <Ionicons name="checkmark-circle-outline" size={16} color={C.accent} />
              <Text style={styles.successBannerText}>{success}</Text>
            </View>
          )}

          {/* Edit / cancel toggle — sits above the Edit Profile card */}
          <View style={styles.editToggleRow}>
            <Text style={styles.editToggleHint}>
              {editing ? "Editing profile" : "View only"}
            </Text>
            <TouchableOpacity
              style={[styles.editToggleBtn, editing && styles.editToggleBtnActive]}
              onPress={editing ? requestCancelEdit : enterEdit}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={editing ? "Cancel editing profile" : "Edit profile"}
            >
              <Ionicons
                name={editing ? "close" : "pencil"}
                size={18}
                color={editing ? C.red : "#1a1f2e"}
              />
            </TouchableOpacity>
          </View>

          {/* Edit profile card */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Edit Profile</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Name</Text>
              {editing ? (
                <TextInput
                  style={styles.input}
                  placeholder="Your name"
                  placeholderTextColor={C.inactive}
                  value={name}
                  onChangeText={(t) => { setName(t); setError(null); setSuccess(null); }}
                  autoCapitalize="words"
                  textContentType="name"
                />
              ) : (
                <Text style={styles.readonlyValue}>{name || "—"}</Text>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              {editing ? (
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={C.inactive}
                  value={email}
                  onChangeText={(t) => { setEmail(t); setError(null); setSuccess(null); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                />
              ) : (
                <Text style={styles.readonlyValue}>{email || "—"}</Text>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Currency</Text>
              {editing ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.currencyPicker}
                >
                  {CURRENCIES.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.currencyChip,
                        currency === c && styles.currencyChipActive,
                      ]}
                      onPress={() => { setCurrency(c); setError(null); setSuccess(null); }}
                    >
                      <Text
                        style={[
                          styles.currencyChipText,
                          currency === c && styles.currencyChipTextActive,
                        ]}
                      >
                        {c}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.readonlyValue}>{currency}</Text>
              )}
            </View>
          </View>

          {/* Change password card — only while editing */}
          {editing && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Change Password</Text>
              <Text style={styles.sectionSub}>Leave blank to keep your current password.</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Current Password</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.inputInner}
                    placeholder="••••••••"
                    placeholderTextColor={C.inactive}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    secureTextEntry={!showCurrentPw}
                    textContentType="password"
                  />
                  <TouchableOpacity
                    onPress={() => setShowCurrentPw((v) => !v)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={showCurrentPw ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={C.inactive}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>New Password</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={styles.inputInner}
                    placeholder="Min. 6 characters"
                    placeholderTextColor={C.inactive}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showNewPw}
                    textContentType="newPassword"
                  />
                  <TouchableOpacity
                    onPress={() => setShowNewPw((v) => !v)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={showNewPw ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={C.inactive}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* Save button — only while editing */}
          {editing && (
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSave}
              activeOpacity={0.8}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#1a1f2e" />
              ) : (
                <Text style={styles.saveBtnText}>Save changes</Text>
              )}
            </TouchableOpacity>
          )}

          {/* Sign out */}
          <TouchableOpacity
            style={[styles.signOutBtn, signingOut && styles.saveBtnDisabled]}
            onPress={() => setShowLogoutModal(true)}
            activeOpacity={0.8}
            disabled={signingOut}
          >
            <Ionicons name="log-out-outline" size={18} color={C.red} />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Save-changes confirmation (cancel-edit with unsaved changes) */}
      <ConfirmModal
        visible={showSaveModal}
        icon="save-outline"
        title="Save changes?"
        message="You have unsaved changes. Would you like to save them?"
        confirmText="Save"
        cancelText="Discard"
        loading={saving}
        onConfirm={handleConfirmSave}
        onCancel={discardAndExit}
        onDismiss={() => setShowSaveModal(false)}
      />

      {/* Sign-out confirmation */}
      <ConfirmModal
        visible={showLogoutModal}
        icon="log-out-outline"
        title="Sign out"
        message="Are you sure you want to sign out?"
        confirmText="Sign out"
        cancelText="Cancel"
        destructive
        loading={signingOut}
        onConfirm={handleConfirmSignOut}
        onCancel={() => setShowLogoutModal(false)}
      />
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
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  avatarSection: {
    alignItems: "center",
    marginBottom: 24,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarInitial: {
    color: "#1a1f2e",
    fontSize: 30,
    fontWeight: "800",
  },
  displayName: {
    color: C.text,
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 2,
  },
  displayEmail: {
    color: C.sub,
    fontSize: 14,
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
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,212,170,0.1)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(0,212,170,0.3)",
    padding: 12,
    marginBottom: 16,
  },
  successBannerText: {
    color: C.accent,
    fontSize: 14,
    flex: 1,
  },
  editToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  editToggleHint: {
    color: C.sub,
    fontSize: 13,
    fontWeight: "600",
  },
  editToggleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  editToggleBtnActive: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.4)",
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 16,
  },
  sectionTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  sectionSub: {
    color: C.sub,
    fontSize: 13,
    marginBottom: 16,
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
  readonlyValue: {
    color: C.text,
    fontSize: 15,
    fontWeight: "500",
    paddingVertical: 13,
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
  currencyPicker: {
    gap: 8,
    paddingVertical: 2,
  },
  currencyChip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: C.bg,
  },
  currencyChipActive: {
    borderColor: C.accent,
    backgroundColor: "rgba(0,212,170,0.12)",
  },
  currencyChipText: {
    color: C.sub,
    fontSize: 13,
    fontWeight: "600",
  },
  currencyChipTextActive: {
    color: C.accent,
  },
  saveBtn: {
    backgroundColor: C.accent,
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: "#1a1f2e",
    fontSize: 16,
    fontWeight: "700",
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    height: 52,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.3)",
    backgroundColor: "rgba(239,68,68,0.08)",
  },
  signOutText: {
    color: C.red,
    fontSize: 16,
    fontWeight: "700",
  },
});
