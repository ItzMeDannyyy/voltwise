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
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import ConfirmModal from "../components/ConfirmModal";

/* ─── Design tokens ──────────────────────────────────────────────── */
const C = {
  bg: "#0f1320",
  surface: "#161c2d",
  card: "#1e2538",
  cardBorder: "#2a3350",
  accent: "#00d4aa",
  accentDim: "rgba(0,212,170,0.12)",
  accentBorder: "rgba(0,212,170,0.35)",
  text: "#f0f4ff",
  sub: "#7b8db0",
  muted: "#4a5578",
  red: "#ff5a5a",
  redDim: "rgba(255,90,90,0.1)",
  redBorder: "rgba(255,90,90,0.3)",
  purple: "#a78bfa",
  gold: "#fbbf24",
};

/* ─── Helpers ────────────────────────────────────────────────────── */
function getInitials(name: string, email: string): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(" ");
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0][0].toUpperCase();
  }
  return (email ?? "?").charAt(0).toUpperCase();
}

function getMemberTag(email: string | undefined): string {
  if (!email) return "Member";
  const domain = email.split("@")[1] ?? "";
  if (domain.includes("admin")) return "Admin";
  return "Member";
}

/* ─── Sub-components ─────────────────────────────────────────────── */
function InfoPill({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={pill.wrap}>
      <View style={pill.iconBox}>
        <Ionicons name={icon} size={16} color={C.accent} />
      </View>
      <View style={pill.text}>
        <Text style={pill.label}>{label}</Text>
        <Text style={pill.value} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const pill = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    padding: 14,
    marginBottom: 10,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.accentDim,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1 },
  label: {
    color: C.sub,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  value: { color: C.text, fontSize: 15, fontWeight: "600" },
});

/* ─── Main screen ────────────────────────────────────────────────── */
export default function ProfileScreen() {
  const { user, signOut, updateProfile } = useAuth();
  const router = useRouter();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  const [editing, setEditing] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isDirty =
    name.trim() !== (user?.name ?? "") ||
    email.trim() !== (user?.email ?? "") ||
    currentPassword.length > 0 ||
    newPassword.length > 0;

  function resetFields() {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setCurrentPassword("");
    setNewPassword("");
  }

  function enterEdit() {
    resetFields();
    setError(null);
    setSuccess(null);
    setEditing(true);
  }

  function requestCancelEdit() {
    if (isDirty) {
      setShowSaveModal(true);
    } else {
      setEditing(false);
      setError(null);
      setSuccess(null);
    }
  }

  function discardAndExit() {
    resetFields();
    setError(null);
    setShowSaveModal(false);
    setEditing(false);
  }

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

    const previousUser = {
      name: user?.name ?? "",
      email: user?.email ?? "",
    };

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const dto: Record<string, string> = {
        name: name.trim(),
        email: trimmedEmail,
      };
      if (newPassword) {
        dto.currentPassword = currentPassword;
        dto.newPassword = newPassword;
      }

      await updateProfile(dto);

      setCurrentPassword("");
      setNewPassword("");
      setSuccess("Profile updated successfully.");
      setEditing(false);
      return true;
    } catch (err: unknown) {
      setName(previousUser.name);
      setEmail(previousUser.email);

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

  async function handleConfirmSave() {
    await handleSave();
    setShowSaveModal(false);
  }

  async function handleConfirmSignOut() {
    setSigningOut(true);
    await signOut();
    setShowLogoutModal(false);
    router.replace("/(auth)/login");
  }

  const initials = getInitials(user?.name ?? "", user?.email ?? "");
  const memberTag = getMemberTag(user?.email);

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
          {/* ── Hero avatar section ─────────────────────────────── */}
          <View style={styles.heroSection}>
            {/* Glow blob behind avatar */}
            <View style={styles.avatarGlow} />

            {/* Gradient ring */}
            <LinearGradient
              colors={["#00d4aa", "#a78bfa", "#00d4aa"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarRing}
            >
              <View style={styles.avatarInner}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            </LinearGradient>

            <Text style={styles.heroName}>{user?.name || "No name set"}</Text>
            <Text style={styles.heroEmail}>{user?.email}</Text>

            {/* Tag row */}
            <View style={styles.tagRow}>
              <View style={styles.tag}>
                <Ionicons name="flash" size={12} color={C.gold} />
                <Text style={[styles.tagText, { color: C.gold }]}>
                  VoltWise
                </Text>
              </View>
              <View style={[styles.tag, { borderColor: C.accentBorder, backgroundColor: C.accentDim }]}>
                <Ionicons name="person-circle-outline" size={12} color={C.accent} />
                <Text style={[styles.tagText, { color: C.accent }]}>
                  {memberTag}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Feedback banners ────────────────────────────────── */}
          {error && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={18} color={C.red} />
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          )}
          {success && (
            <View style={styles.successBanner}>
              <Ionicons
                name="checkmark-circle-outline"
                size={18}
                color={C.accent}
              />
              <Text style={styles.successBannerText}>{success}</Text>
            </View>
          )}

          {/* ── Account info (read-only pills) ──────────────────── */}
          {!editing && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Account Information</Text>
              <InfoPill
                icon="person-outline"
                label="Full Name"
                value={user?.name || "—"}
              />
              <InfoPill
                icon="mail-outline"
                label="Email Address"
                value={user?.email || "—"}
              />
              <InfoPill
                icon="location-outline"
                label="Region"
                value="Philippines"
              />
              <InfoPill
                icon="cash-outline"
                label="Currency"
                value="Philippine Peso (₱)"
              />
            </View>
          )}

          {/* ── Edit profile card ────────────────────────────────── */}
          {editing && (
            <>
              <View style={styles.editCard}>
                <View style={styles.editCardHeader}>
                  <LinearGradient
                    colors={[C.accentDim, "transparent"]}
                    style={styles.editCardHeaderAccent}
                  />
                  <Ionicons
                    name="create-outline"
                    size={20}
                    color={C.accent}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.editCardTitle}>Edit Profile</Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Full Name</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons
                      name="person-outline"
                      size={18}
                      color={C.muted}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Your full name"
                      placeholderTextColor={C.muted}
                      value={name}
                      onChangeText={(t) => {
                        setName(t);
                        setError(null);
                        setSuccess(null);
                      }}
                      autoCapitalize="words"
                      textContentType="name"
                    />
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Email Address</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons
                      name="mail-outline"
                      size={18}
                      color={C.muted}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="you@example.com"
                      placeholderTextColor={C.muted}
                      value={email}
                      onChangeText={(t) => {
                        setEmail(t);
                        setError(null);
                        setSuccess(null);
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      textContentType="emailAddress"
                    />
                  </View>
                </View>
              </View>

              {/* ── Change password card ─────────────────────────── */}
              <View style={styles.editCard}>
                <View style={styles.editCardHeader}>
                  <LinearGradient
                    colors={["rgba(167,139,250,0.15)", "transparent"]}
                    style={styles.editCardHeaderAccent}
                  />
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color={C.purple}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={[styles.editCardTitle, { color: C.purple }]}>
                    Change Password
                  </Text>
                </View>
                <Text style={styles.editCardSub}>
                  Leave blank to keep your current password.
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Current Password</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons
                      name="key-outline"
                      size={18}
                      color={C.muted}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="••••••••"
                      placeholderTextColor={C.muted}
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                      secureTextEntry={!showCurrentPw}
                      textContentType="password"
                    />
                    <TouchableOpacity
                      onPress={() => setShowCurrentPw((v) => !v)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons
                        name={
                          showCurrentPw ? "eye-off-outline" : "eye-outline"
                        }
                        size={20}
                        color={C.muted}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>New Password</Text>
                  <View style={styles.inputWrap}>
                    <Ionicons
                      name="lock-open-outline"
                      size={18}
                      color={C.muted}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Min. 6 characters"
                      placeholderTextColor={C.muted}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showNewPw}
                      textContentType="newPassword"
                    />
                    <TouchableOpacity
                      onPress={() => setShowNewPw((v) => !v)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons
                        name={showNewPw ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={C.muted}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </>
          )}

          {/* ── Action buttons ───────────────────────────────────── */}
          <View style={styles.actionsRow}>
            {editing ? (
              <>
                {/* Save */}
                <TouchableOpacity
                  style={[styles.primaryBtn, saving && styles.btnDisabled]}
                  onPress={handleSave}
                  activeOpacity={0.82}
                  disabled={saving}
                >
                  <LinearGradient
                    colors={["#00d4aa", "#00b894"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.primaryBtnGradient}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#0f1320" />
                    ) : (
                      <>
                        <Ionicons
                          name="checkmark-done-outline"
                          size={18}
                          color="#0f1320"
                        />
                        <Text style={styles.primaryBtnText}>Save Changes</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Cancel */}
                <TouchableOpacity
                  style={styles.ghostBtn}
                  onPress={requestCancelEdit}
                  activeOpacity={0.82}
                >
                  <Ionicons name="close-outline" size={18} color={C.sub} />
                  <Text style={styles.ghostBtnText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              /* Edit profile */
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={enterEdit}
                activeOpacity={0.82}
              >
                <LinearGradient
                  colors={["#00d4aa", "#00b894"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.primaryBtnGradient}
                >
                  <Ionicons name="pencil-outline" size={18} color="#0f1320" />
                  <Text style={styles.primaryBtnText}>Edit Profile</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Sign out ─────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.signOutBtn, signingOut && styles.btnDisabled]}
            onPress={() => setShowLogoutModal(true)}
            activeOpacity={0.8}
            disabled={signingOut}
          >
            <Ionicons name="log-out-outline" size={18} color={C.red} />
            <Text style={styles.signOutText}>
              {signingOut ? "Signing out…" : "Sign Out"}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Modals ────────────────────────────────────────────────── */}
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

/* ─── Styles ─────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
  },

  /* Hero */
  heroSection: {
    alignItems: "center",
    marginBottom: 28,
    position: "relative",
  },
  avatarGlow: {
    position: "absolute",
    top: 0,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(0,212,170,0.12)",
    transform: [{ scaleX: 1.6 }],
  },
  avatarRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    padding: 3,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarInner: {
    width: 94,
    height: 94,
    borderRadius: 47,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    color: C.accent,
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  heroName: {
    color: C.text,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  heroEmail: {
    color: C.sub,
    fontSize: 14,
    marginBottom: 14,
  },
  tagRow: {
    flexDirection: "row",
    gap: 8,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.35)",
    backgroundColor: "rgba(251,191,36,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "700",
  },

  /* Banners */
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.redDim,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.redBorder,
    padding: 14,
    marginBottom: 16,
  },
  errorBannerText: { color: C.red, fontSize: 14, flex: 1, fontWeight: "500" },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.accentDim,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.accentBorder,
    padding: 14,
    marginBottom: 16,
  },
  successBannerText: {
    color: C.accent,
    fontSize: 14,
    flex: 1,
    fontWeight: "500",
  },

  /* Section label */
  section: { marginBottom: 20 },
  sectionLabel: {
    color: C.sub,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },

  /* Edit cards */
  editCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.cardBorder,
    overflow: "hidden",
    marginBottom: 16,
  },
  editCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
    position: "relative",
  },
  editCardHeaderAccent: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
  },
  editCardTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: "700",
  },
  editCardSub: {
    color: C.sub,
    fontSize: 13,
    paddingHorizontal: 18,
    marginBottom: 12,
    marginTop: -4,
  },

  /* Fields */
  fieldGroup: {
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  fieldLabel: {
    color: C.sub,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.cardBorder,
    paddingHorizontal: 14,
    height: 52,
    gap: 10,
  },
  inputIcon: {},
  input: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    height: 52,
  },

  /* Actions */
  actionsRow: {
    gap: 10,
    marginBottom: 12,
  },
  primaryBtn: {
    borderRadius: 16,
    overflow: "hidden",
  },
  primaryBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 54,
  },
  primaryBtnText: {
    color: "#0f1320",
    fontSize: 16,
    fontWeight: "800",
  },
  btnDisabled: { opacity: 0.55 },

  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
    backgroundColor: C.card,
  },
  ghostBtnText: {
    color: C.sub,
    fontSize: 15,
    fontWeight: "600",
  },

  /* Sign out */
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.redBorder,
    backgroundColor: C.redDim,
    marginBottom: 4,
  },
  signOutText: {
    color: C.red,
    fontSize: 15,
    fontWeight: "700",
  },
});
