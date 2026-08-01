import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { api, ApiDevice, ApiDeviceReading, resolveAssetUrl } from "../../lib/api";
import { PullToRefresh, PullToRefreshList } from "../../components/pull-to-refresh";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";

// ─── Palette ─────────────────────────────────────────────────────────────────

const C = {
  bg: "#1a1f2e",
  card: "#242b3d",
  accent: "#00d4aa",
  text: "#ffffff",
  sub: "#9ca3af",
  border: "#2d3448",
  yellow: "#f59e0b",
  red: "#ef4444",
  green: "#10b981",
};

// ─── Types ───────────────────────────────────────────────────────────────────

type DeviceStatus = "ACTIVE" | "IDLE" | "OFF";
type ViewMode = "banner" | "photo";

interface Device {
  id: string;
  name: string;
  room: string;
  category: string | null;
  imageUri: string | null;
  status: DeviceStatus;
  watts: number;
  enabled: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<DeviceStatus, string> = {
  ACTIVE: C.accent,
  IDLE: C.yellow,
  OFF: C.red,
};

function formatWatts(watts: number): string {
  return watts >= 1000 ? `${(watts / 1000).toFixed(1)}kW` : `${watts}W`;
}

const SCREEN_WIDTH = Dimensions.get("window").width;

// ─── Component ───────────────────────────────────────────────────────────────

export default function DevicesScreen() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("banner");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [liveReadings, setLiveReadings] = useState<Partial<Record<string, ApiDeviceReading | null>>>({});
  const [loadingReadings, setLoadingReadings] = useState<Partial<Record<string, boolean>>>({});
  const [modalVisible, setModalVisible] = useState(false);
  const [formName, setFormName] = useState("");
  const [formRoom, setFormRoom] = useState("");
  const [formWatts, setFormWatts] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formPhotoUri, setFormPhotoUri] = useState<string | null>(null);
  const [formEnabled, setFormEnabled] = useState(true);

  const originalsRef = useRef<Record<string, { status: DeviceStatus; watts: number }>>({});
  const accordionHeightsRef = useRef<Partial<Record<string, number>>>({});
  const accordionAnimsRef = useRef<Partial<Record<string, Animated.Value>>>({});

  function getAnim(id: string): Animated.Value {
    if (!accordionAnimsRef.current[id]) {
      accordionAnimsRef.current[id] = new Animated.Value(0);
    }
    return accordionAnimsRef.current[id]!;
  }

  // ── Deep link: ?openAdd=1 auto-opens the add-device form ─────────────────
  // Used by the "New load detected" prompt to jump straight into registering
  // the appliance that just switched on.

  const { openAdd } = useLocalSearchParams<{ openAdd?: string }>();
  const router = useRouter();

  useEffect(() => {
    if (!openAdd) return;
    setModalVisible(true);
    // Clear the param so navigating back to this tab doesn't re-open the form.
    router.setParams({ openAdd: undefined });
  }, [openAdd, router]);

  // ── Load devices ──────────────────────────────────────────────────────────

  // Fetch the device list — shared by the initial load and pull-to-refresh.
  const fetchDevices = useCallback(async () => {
    const data = await api.get<ApiDevice[]>("/devices");
    // An empty list is real data (fresh account) — render the empty state,
    // don't fall back to anything.
    const list = data ?? [];
    setDevices(list);
    originalsRef.current = Object.fromEntries(
      list.map((d) => [d.id, { status: d.status, watts: d.watts }])
    );
  }, []);

  useEffect(() => {
    fetchDevices()
      .catch(() => setLoadError(true))
      .finally(() => setLoadingDevices(false));
  }, [fetchDevices]);

  const { refreshing, onRefresh } = usePullToRefresh(fetchDevices);

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = devices.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.room.toLowerCase().includes(search.toLowerCase())
  );

  // ── Toggle on/off ─────────────────────────────────────────────────────────

  function handleToggle(id: string, value: boolean) {
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        if (!value) return { ...d, enabled: false, status: "OFF" as DeviceStatus, watts: 0 };
        const original = originalsRef.current[id] ?? { status: "ACTIVE" as DeviceStatus, watts: d.watts };
        return {
          ...d,
          enabled: true,
          status: original.status === "OFF" ? "ACTIVE" : original.status,
          watts: original.watts,
        };
      })
    );
    api
      .patch<ApiDevice>(`/devices/${id}`, { enabled: value })
      .then((updated) => {
        if (!updated) return;
        originalsRef.current[id] = { status: updated.status, watts: updated.watts };
        setDevices((prev) => prev.map((d) => (d.id === id ? updated : d)));
      })
      .catch(() => {});
  }

  // ── Live reading fetch ────────────────────────────────────────────────────

  async function fetchLiveReading(deviceId: string) {
    if (loadingReadings[deviceId] || liveReadings[deviceId] !== undefined) return;
    setLoadingReadings((prev) => ({ ...prev, [deviceId]: true }));
    try {
      const data = await api.get<ApiDeviceReading | null>(`/devices/${deviceId}/readings/latest`);
      setLiveReadings((prev) => ({ ...prev, [deviceId]: data }));
    } catch {
      setLiveReadings((prev) => ({ ...prev, [deviceId]: null }));
    } finally {
      setLoadingReadings((prev) => ({ ...prev, [deviceId]: false }));
    }
  }

  // ── Accordion toggle ──────────────────────────────────────────────────────

  function handleAccordionToggle(deviceId: string) {
    const isExpanding = expandedId !== deviceId;

    // Collapse any currently open card (different from tapped)
    if (expandedId && expandedId !== deviceId) {
      Animated.spring(getAnim(expandedId), {
        toValue: 0,
        useNativeDriver: false,
        tension: 200,
        friction: 25,
      }).start();
    }

    if (isExpanding) {
      setExpandedId(deviceId);
      fetchLiveReading(deviceId);
      const targetHeight = accordionHeightsRef.current[deviceId] ?? 130;
      Animated.spring(getAnim(deviceId), {
        toValue: targetHeight,
        useNativeDriver: false,
        tension: 200,
        friction: 25,
      }).start();
    } else {
      setExpandedId(null);
      Animated.spring(getAnim(deviceId), {
        toValue: 0,
        useNativeDriver: false,
        tension: 200,
        friction: 25,
      }).start();
    }
  }

  // ── View mode switch ──────────────────────────────────────────────────────

  function switchViewMode(mode: ViewMode) {
    if (expandedId) {
      Animated.spring(getAnim(expandedId), {
        toValue: 0,
        useNativeDriver: false,
        tension: 200,
        friction: 25,
      }).start();
      setExpandedId(null);
    }
    setViewMode(mode);
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  function resetForm() {
    setFormName("");
    setFormRoom("");
    setFormWatts("");
    setFormCategory("");
    setFormPhotoUri(null);
    setFormEnabled(true);
  }

  function handleAddDevice() {
    const name = formName.trim();
    if (!name) {
      Alert.alert("Name required", "Please enter a device name.");
      return;
    }
    const watts = Math.max(0, parseInt(formWatts, 10) || 0);
    const status: DeviceStatus = formEnabled ? (watts > 0 ? "ACTIVE" : "IDLE") : "OFF";
    const id = `${Date.now()}`;
    const room = formRoom.trim() || "Unassigned";
    const category = formCategory.trim() || null;

    originalsRef.current[id] = {
      status: status === "OFF" ? "ACTIVE" : status,
      watts,
    };

    const newDevice: Device = {
      id,
      name,
      room,
      category,
      imageUri: formPhotoUri,
      status,
      watts: formEnabled ? watts : 0,
      enabled: formEnabled,
    };

    const photoUri = formPhotoUri;
    setDevices((prev) => [newDevice, ...prev]);
    resetForm();
    setModalVisible(false);

    api
      .post<ApiDevice>("/devices", { name, room, watts, enabled: formEnabled, category })
      .then(async (created) => {
        if (!created) return;
        originalsRef.current[created.id] = { status: created.status, watts: created.watts };

        // The photo is a local file — send it as multipart so the backend can
        // store it in its uploads bucket and hand back a served URL.
        let finalDevice = created;
        if (photoUri) {
          try {
            finalDevice = await uploadDevicePhoto(created.id, photoUri);
          } catch {
            // Device exists either way; keep showing the local photo for now.
            finalDevice = { ...created, imageUri: photoUri };
          }
        }
        setDevices((prev) => prev.map((d) => (d.id === id ? finalDevice : d)));
      })
      .catch(() => {});
  }

  // ── Photo upload ──────────────────────────────────────────────────────────

  async function uploadDevicePhoto(deviceId: string, uri: string): Promise<ApiDevice> {
    const filename = uri.split("/").pop() ?? "photo.jpg";
    const extension = filename.split(".").pop()?.toLowerCase();
    const mimeType =
      extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";

    const form = new FormData();
    // React Native's FormData takes a { uri, name, type } file descriptor.
    form.append("photo", { uri, name: filename, type: mimeType } as unknown as Blob);
    return api.upload<ApiDevice>(`/devices/${deviceId}/photo`, form);
  }

  // ── Camera / gallery ──────────────────────────────────────────────────────

  async function handleTakePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Camera access is needed to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setFormPhotoUri(result.assets[0].uri);
    }
  }

  async function handlePickFromGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Photo library access is needed to pick an image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setFormPhotoUri(result.assets[0].uri);
    }
  }

  // ── Render: banner card ───────────────────────────────────────────────────

  function renderBannerCard(device: Device) {
    const isExpanded = expandedId === device.id;
    const reading = liveReadings[device.id];
    const isLoading = loadingReadings[device.id] ?? false;

    const elecMetrics =
      reading && typeof reading === "object"
        ? [
            { label: "Voltage", value: `${reading.voltage?.toFixed(1) ?? "—"} V` },
            { label: "Current", value: `${reading.current?.toFixed(2) ?? "—"} A` },
            { label: "Frequency", value: `${reading.frequency?.toFixed(1) ?? "—"} Hz` },
            { label: "Power Factor", value: reading.powerFactor?.toFixed(2) ?? "—" },
            { label: "kWh Today", value: `${reading.todayKwh.toFixed(3)} kWh` },
            { label: "Watts Live", value: `${reading.watts.toFixed(0)} W` },
            { label: "Cost Today", value: `₱${reading.costToday.toFixed(2)}` },
          ]
        : [];

    return (
      <TouchableOpacity
        key={device.id}
        activeOpacity={0.85}
        onPress={() => handleAccordionToggle(device.id)}
        style={styles.bannerCard}
      >
        {/* Left status bar */}
        <View style={[styles.statusBar, { backgroundColor: STATUS_COLORS[device.status] }]} />

        <View style={styles.bannerCardContent}>
          {/* Top row: info + controls */}
          <View style={styles.bannerCardMain}>
            <View style={styles.bannerCardInfo}>
              <Text style={styles.deviceName} numberOfLines={1}>
                {device.name}
              </Text>
              <Text style={styles.deviceRoom}>{device.room}</Text>
              <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[device.status] + "22" }]}>
                <Text style={[styles.statusPillText, { color: STATUS_COLORS[device.status] }]}>
                  {device.status}
                </Text>
              </View>
            </View>
            <View style={styles.bannerCardRight}>
              <Text style={styles.watts}>{formatWatts(device.watts)}</Text>
              <Switch
                value={device.enabled}
                onValueChange={(val) => handleToggle(device.id, val)}
                trackColor={{ false: C.border, true: C.accent }}
                thumbColor={C.text}
                ios_backgroundColor={C.border}
              />
            </View>
          </View>

          {/* Accordion panel */}
          <Animated.View style={[styles.accordionWrapper, { maxHeight: getAnim(device.id) }]}>
            <View
              style={styles.accordionContent}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                if (accordionHeightsRef.current[device.id] === h) return;
                accordionHeightsRef.current[device.id] = h;
                if (isExpanded) {
                  getAnim(device.id).setValue(h);
                }
              }}
            >
              <View style={styles.accordionDivider} />
              {isLoading ? (
                <View style={styles.accordionLoadingRow}>
                  <ActivityIndicator size="small" color={C.accent} />
                  <Text style={styles.accordionLoadingText}>Loading live data…</Text>
                </View>
              ) : reading && typeof reading === "object" ? (
                <View style={styles.metricsGrid}>
                  {elecMetrics.map((m) => (
                    <View key={m.label} style={styles.metricCell}>
                      <Text style={styles.metricLabel}>{m.label}</Text>
                      <Text style={styles.metricValue}>{m.value}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.noDataText}>No live data available</Text>
              )}
            </View>
          </Animated.View>
        </View>
      </TouchableOpacity>
    );
  }

  // ── Render: photo card ────────────────────────────────────────────────────

  function renderPhotoCard({ item: device }: { item: Device }) {
    return (
      <View style={styles.photoCard}>
        {device.imageUri ? (
          <Image source={{ uri: resolveAssetUrl(device.imageUri)! }} style={styles.photoCardImage} />
        ) : (
          <View style={styles.photoCardPlaceholder}>
            <Ionicons name="flash-outline" size={36} color={C.sub} />
          </View>
        )}
        <View style={styles.photoCardBody}>
          <Text style={styles.deviceName} numberOfLines={1}>
            {device.name}
          </Text>
          <Text style={styles.deviceRoom}>{device.room}</Text>
          <View style={styles.photoCardMeta}>
            <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[device.status] + "22" }]}>
              <Text style={[styles.statusPillText, { color: STATUS_COLORS[device.status] }]}>
                {device.status}
              </Text>
            </View>
            <Text style={styles.watts}>{formatWatts(device.watts)}</Text>
          </View>
        </View>
      </View>
    );
  }

  // ── Render: loading / empty states ────────────────────────────────────────

  function renderListState() {
    if (loadingDevices) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={styles.emptyStateText}>Loading devices…</Text>
        </View>
      );
    }
    if (loadError) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="cloud-offline-outline" size={40} color={C.sub} />
          <Text style={styles.emptyStateTitle}>{"Couldn't reach the server"}</Text>
          <Text style={styles.emptyStateText}>
            Check your connection, then come back to this tab to retry.
          </Text>
        </View>
      );
    }
    if (devices.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="flash-outline" size={40} color={C.sub} />
          <Text style={styles.emptyStateTitle}>No devices yet</Text>
          <Text style={styles.emptyStateText}>Tap + Add to register your first device.</Text>
        </View>
      );
    }
    // Devices exist but the search matched nothing.
    return (
      <View style={styles.emptyState}>
        <Ionicons name="search-outline" size={40} color={C.sub} />
        <Text style={styles.emptyStateText}>{`No devices match "${search}".`}</Text>
      </View>
    );
  }

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.inner}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Devices</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => switchViewMode("banner")}
              style={[styles.viewToggleBtn, viewMode === "banner" && styles.viewToggleActive]}
            >
              <Ionicons name="list-outline" size={20} color={viewMode === "banner" ? C.accent : C.sub} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => switchViewMode("photo")}
              style={[styles.viewToggleBtn, viewMode === "photo" && styles.viewToggleActive]}
            >
              <Ionicons name="grid-outline" size={20} color={viewMode === "photo" ? C.accent : C.sub} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.addBtnText}>+ Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color={C.sub} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search devices..."
            placeholderTextColor={C.sub}
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
          />
        </View>

        {/* Banner mode — vertical accordion list */}
        {viewMode === "banner" &&
          (filtered.length === 0 ? (
            renderListState()
          ) : (
            <PullToRefresh
              refreshing={refreshing}
              onRefresh={onRefresh}
              contentContainerStyle={styles.list}
              indicatorColor={C.accent}
              indicatorBackground={C.card}
            >
              {filtered.map((device) => renderBannerCard(device))}
              <View style={{ height: 16 }} />
            </PullToRefresh>
          ))}

        {/* Photo mode — 2-column image grid */}
        {viewMode === "photo" &&
          (filtered.length === 0 ? (
            renderListState()
          ) : (
            <PullToRefreshList
              refreshing={refreshing}
              onRefresh={onRefresh}
              indicatorColor={C.accent}
              indicatorBackground={C.card}
              data={filtered}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={styles.photoRow}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={renderPhotoCard}
              ListFooterComponent={<View style={{ height: 16 }} />}
            />
          ))}
      </View>

      {/* Add Device Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { resetForm(); setModalVisible(false); }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Device</Text>
                <TouchableOpacity
                  onPress={() => { resetForm(); setModalVisible(false); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={24} color={C.sub} />
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Air Conditioner"
                placeholderTextColor={C.sub}
                value={formName}
                onChangeText={setFormName}
              />

              <Text style={styles.fieldLabel}>Room</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Bedroom"
                placeholderTextColor={C.sub}
                value={formRoom}
                onChangeText={setFormRoom}
              />

              <Text style={styles.fieldLabel}>Power (Watts)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 1200"
                placeholderTextColor={C.sub}
                value={formWatts}
                onChangeText={(t) => setFormWatts(t.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
              />

              <Text style={styles.fieldLabel}>Category</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Appliance, Lighting"
                placeholderTextColor={C.sub}
                value={formCategory}
                onChangeText={setFormCategory}
              />

              <Text style={styles.fieldLabel}>Photo</Text>
              <View style={styles.photoSection}>
                {formPhotoUri ? (
                  <View style={styles.photoThumbnailWrapper}>
                    <Image source={{ uri: formPhotoUri }} style={styles.photoThumbnail} />
                    <TouchableOpacity
                      style={styles.photoRemoveBtn}
                      onPress={() => setFormPhotoUri(null)}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Ionicons name="close-circle" size={22} color={C.red} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Text style={styles.photoPlaceholderText}>No image</Text>
                  </View>
                )}
                <View style={styles.photoBtnRow}>
                  <TouchableOpacity style={styles.cameraBtn} onPress={handleTakePhoto} activeOpacity={0.8}>
                    <Ionicons name="camera-outline" size={18} color={C.accent} />
                    <Text style={styles.cameraBtnText}>Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.cameraBtn} onPress={handlePickFromGallery} activeOpacity={0.8}>
                    <Ionicons name="images-outline" size={18} color={C.accent} />
                    <Text style={styles.cameraBtnText}>Gallery</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.enabledRow}>
                <Text style={styles.fieldLabel}>Enabled</Text>
                <Switch
                  value={formEnabled}
                  onValueChange={setFormEnabled}
                  trackColor={{ false: C.border, true: C.accent }}
                  thumbColor={C.text}
                  ios_backgroundColor={C.border}
                />
              </View>

              <TouchableOpacity style={styles.submitBtn} onPress={handleAddDevice} activeOpacity={0.8}>
                <Text style={styles.submitBtnText}>Add Device</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PHOTO_CARD_WIDTH = (SCREEN_WIDTH - 32 - 8) / 2;

const styles = StyleSheet.create({
  // Root
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    color: C.text,
    fontSize: 28,
    fontWeight: "700",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  viewToggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: C.border,
  },
  viewToggleActive: {
    borderColor: C.accent,
    backgroundColor: C.accent + "18",
  },
  addBtn: {
    backgroundColor: C.accent,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addBtnText: {
    color: "#1a1f2e",
    fontSize: 14,
    fontWeight: "700",
  },

  // Search
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    marginBottom: 16,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    height: 48,
  },

  // Shared list container
  list: {
    gap: 12,
  },

  // Loading / empty states
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingBottom: 64,
    paddingHorizontal: 24,
  },
  emptyStateTitle: {
    color: C.text,
    fontSize: 17,
    fontWeight: "700",
  },
  emptyStateText: {
    color: C.sub,
    fontSize: 14,
    textAlign: "center",
  },

  // Banner card
  bannerCard: {
    flexDirection: "row",
    backgroundColor: C.card,
    borderRadius: 16,
    overflow: "hidden",
  },
  statusBar: {
    width: 4,
    alignSelf: "stretch",
  },
  bannerCardContent: {
    flex: 1,
    padding: 16,
  },
  bannerCardMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bannerCardInfo: {
    flex: 1,
    gap: 4,
  },
  deviceName: {
    color: C.text,
    fontSize: 16,
    fontWeight: "700",
  },
  deviceRoom: {
    color: C.sub,
    fontSize: 13,
  },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  bannerCardRight: {
    alignItems: "flex-end",
    gap: 8,
  },
  watts: {
    color: C.text,
    fontSize: 16,
    fontWeight: "700",
  },

  // Accordion
  accordionWrapper: {
    overflow: "hidden",
  },
  accordionContent: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  accordionDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 12,
  },
  accordionLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 8,
  },
  accordionLoadingText: {
    color: C.sub,
    fontSize: 13,
  },
  noDataText: {
    color: C.sub,
    fontSize: 13,
    paddingBottom: 8,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 4,
  },
  metricCell: {
    width: "47%",
    backgroundColor: C.bg,
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
  metricLabel: {
    color: C.sub,
    fontSize: 11,
    fontWeight: "500",
  },
  metricValue: {
    color: C.text,
    fontSize: 15,
    fontWeight: "700",
  },

  // Photo mode
  photoRow: {
    gap: 8,
  },
  photoCard: {
    flex: 1,
    width: PHOTO_CARD_WIDTH,
    backgroundColor: C.card,
    borderRadius: 16,
    overflow: "hidden",
  },
  photoCardImage: {
    width: "100%",
    height: 140,
    resizeMode: "cover",
  },
  photoCardPlaceholder: {
    width: "100%",
    height: 140,
    backgroundColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  photoCardBody: {
    padding: 12,
    gap: 2,
  },
  photoCardMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "88%",
  },
  modalScroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: {
    color: C.text,
    fontSize: 22,
    fontWeight: "700",
  },
  fieldLabel: {
    color: C.sub,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    height: 48,
    color: C.text,
    fontSize: 15,
  },
  photoSection: {
    gap: 12,
    alignItems: "flex-start",
  },
  photoThumbnailWrapper: {
    position: "relative",
  },
  photoThumbnail: {
    width: 120,
    height: 120,
    borderRadius: 8,
  },
  photoRemoveBtn: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: C.bg,
    borderRadius: 12,
  },
  photoPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: C.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  photoPlaceholderText: {
    color: C.sub,
    fontSize: 13,
    fontWeight: "500",
  },
  photoBtnRow: {
    flexDirection: "row",
    gap: 8,
  },
  cameraBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cameraBtnText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: "600",
  },
  enabledRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    paddingVertical: 4,
  },
  submitBtn: {
    backgroundColor: C.accent,
    borderRadius: 14,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  submitBtnText: {
    color: "#1a1f2e",
    fontSize: 16,
    fontWeight: "700",
  },
});
