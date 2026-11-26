import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
  DeviceEventEmitter,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import {
  Camera,
  ChevronDown,
  ChevronUp,
  CloudOff,
  ImageIcon,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wifi,
  X,
  Zap,
} from "../../components/LucideIcons";
import ConfirmModal from "../../components/ConfirmModal";
import {
  api,
  ApiDevice,
  ApiDeviceReading,
  resolveAssetUrl,
  DEVICES_CHANGED_EVENT,
  emitDevicesChanged,
} from "../../lib/api";
import {
  DEMO_DEVICES,
  DEMO_HIGH_LINE_IDS,
  demoDeviceReading,
  isDemoDevicePowered,
} from "../../lib/demo-data";
import { PullToRefresh, PullToRefreshList } from "../../components/pull-to-refresh";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";
import { useTheme } from "../../context/ThemeContext";
import { useUnits } from "../../context/UnitsContext";
import { useMqtt } from "../../context/MqttContext";
import { useDemoData } from "../../context/DemoDataContext";
import { usePowerControl } from "../../context/PowerControlContext";
import { linkHealth } from "../../lib/iot-prefs";
import { useThemedStyles } from "../../components/themed";
import type { ThemeColors } from "../../constants/theme";

// ─── Types ───────────────────────────────────────────────────────────────────

type DeviceStatus = "ACTIVE" | "IDLE" | "OFF" | "UNPOWERED";
type ViewMode = "banner" | "photo";
type FormField = "name" | "room" | "watts" | "category" | null;

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

function getStatusColors(colors: ThemeColors): Record<DeviceStatus, string> {
  return {
    ACTIVE: colors.accent,
    IDLE: colors.yellow,
    OFF: colors.red,
    UNPOWERED: colors.sub,
  };
}

const STATUS_LABELS: Record<DeviceStatus, string> = {
  ACTIVE: "Active",
  IDLE: "Standby",
  OFF: "Off",
  UNPOWERED: "Circuit off",
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const MASTER_OFF_LABEL = "Master relay open";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DevicesScreen() {
  const { colors, fontScale } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { formatPower, formatEnergy, formatCostOf } = useUnits();
  const { demoData } = useDemoData();
  const STATUS_COLORS = getStatusColors(colors);

  const [devices, setDevices] = useState<Device[]>([]);
  const [demoDevices, setDemoDevices] = useState<Device[]>(DEMO_DEVICES);
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("banner");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [liveReadings, setLiveReadings] = useState<Partial<Record<string, ApiDeviceReading | null>>>({});
  const [loadingReadings, setLoadingReadings] = useState<Partial<Record<string, boolean>>>({});
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [deviceToDelete, setDeviceToDelete] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState("");
  const [formRoom, setFormRoom] = useState("");
  const [formWatts, setFormWatts] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formPhotoUri, setFormPhotoUri] = useState<string | null>(null);
  const [formNameError, setFormNameError] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<FormField>(null);

  const [now, setNow] = useState(() => Date.now());
  const [enterOpacity] = useState(() => new Animated.Value(0));
  const [enterTranslate] = useState(() => new Animated.Value(8));

  const { relayState, connected, configured, deviceOnline, telemetryAt } = useMqtt();
  const { highOn, lowOn } = usePowerControl();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(enterOpacity, {
        toValue: 1,
        duration: 380,
        useNativeDriver: true,
      }),
      Animated.timing(enterTranslate, {
        toValue: 0,
        duration: 380,
        useNativeDriver: true,
      }),
    ]).start();

    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(tick);
  }, [enterOpacity, enterTranslate]);

  const powerAvailable =
    linkHealth({
      configured,
      appConnected: connected,
      deviceOnline,
      telemetryAt,
      now,
    }) === "live" && relayState?.on === true;

  const masterPowerOff = demoData ? false : !powerAvailable;
  const listDevices = demoData ? demoDevices : devices;
  const nextTempIdRef = useRef(1);

  const [prevDemoData, setPrevDemoData] = useState(demoData);
  if (demoData !== prevDemoData) {
    setPrevDemoData(demoData);
    if (demoData) {
      setDemoDevices(DEMO_DEVICES);
    }
  }

  // ── Deep link: ?openAdd=1 auto-opens the add-device form ─────────────────

  const { openAdd, initialName, initialWatts } = useLocalSearchParams<{
    openAdd?: string;
    initialName?: string;
    initialWatts?: string;
  }>();
  const router = useRouter();
  const [handledOpenAdd, setHandledOpenAdd] = useState<string | undefined>(undefined);
  if (openAdd && openAdd !== handledOpenAdd) {
    setHandledOpenAdd(openAdd);
    setEditingDevice(null);
    setFormNameError(null);
    if (initialName) setFormName(initialName);
    if (initialWatts) setFormWatts(initialWatts);
    setModalVisible(true);
  }
  if (!openAdd && handledOpenAdd !== undefined) {
    setHandledOpenAdd(undefined);
  }

  useEffect(() => {
    if (!openAdd) return;
    router.setParams({
      openAdd: undefined,
      initialName: undefined,
      initialWatts: undefined,
    });
  }, [openAdd, router]);

  // ── Load devices ──────────────────────────────────────────────────────────

  const fetchDevices = useCallback(async (reconcile = false) => {
    const data = reconcile
      ? await api.post<ApiDevice[]>("/devices/reconcile-power")
      : await api.get<ApiDevice[]>("/devices");
    setDevices(data ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get<ApiDevice[]>("/devices")
      .then((data) => {
        if (!cancelled) setDevices(data ?? []);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingDevices(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(DEVICES_CHANGED_EVENT, () => {
      fetchDevices().catch(() => {});
    });
    return () => sub.remove();
  }, [fetchDevices]);

  const refreshDevices = useCallback(() => fetchDevices(true), [fetchDevices]);
  const { refreshing, onRefresh } = usePullToRefresh(refreshDevices);

  // ── Filtered list & derived summary ───────────────────────────────────────

  const filtered = listDevices.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.room.toLowerCase().includes(search.toLowerCase()) ||
      (d.category ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function effectiveStatus(device: Device): DeviceStatus {
    if (demoData) {
      if (!isDemoDevicePowered(device.id, { highOn, lowOn })) {
        return "UNPOWERED";
      }
      return device.status;
    }
    return masterPowerOff ? "UNPOWERED" : device.status;
  }

  function effectiveWatts(device: Device): number {
    if (demoData) {
      if (!isDemoDevicePowered(device.id, { highOn, lowOn })) {
        return 0;
      }
      return device.watts;
    }
    return masterPowerOff ? 0 : device.watts;
  }

  const activeCount = listDevices.filter((d) => effectiveStatus(d) === "ACTIVE").length;
  const totalDrawWatts = listDevices.reduce((sum, d) => sum + effectiveWatts(d), 0);

  // ── Live reading fetch ────────────────────────────────────────────────────

  async function fetchLiveReading(deviceId: string) {
    if (demoData) return;
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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (isExpanding) {
      setExpandedId(deviceId);
      fetchLiveReading(deviceId);
    } else {
      setExpandedId(null);
    }
  }

  function switchViewMode(mode: ViewMode) {
    if (expandedId) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
    setFormNameError(null);
    setFocusedField(null);
    setEditingDevice(null);
  }

  function openAddModal() {
    resetForm();
    setModalVisible(true);
  }

  function openEditModal(device: Device) {
    setEditingDevice(device);
    setFormName(device.name);
    setFormRoom(device.room === "Unassigned" ? "" : device.room);
    setFormWatts(device.watts ? String(device.watts) : "");
    setFormCategory(device.category ?? "");
    setFormPhotoUri(device.imageUri ? resolveAssetUrl(device.imageUri) : null);
    setFormNameError(null);
    setModalVisible(true);
  }

  async function handleSaveDevice() {
    if (!editingDevice) return;
    const name = formName.trim();
    if (!name) {
      setFormNameError("Write the appliance name (for example, Bedroom Aircon).");
      return;
    }
    const room = formRoom.trim() || "Unassigned";
    const category = formCategory.trim() || null;
    const watts = Math.max(0, parseInt(formWatts, 10) || 0);

    setSaving(true);
    const photoUri = formPhotoUri;

    if (demoData) {
      setDemoDevices((prev) =>
        prev.map((d) =>
          d.id === editingDevice.id
            ? { ...d, name, room, category, watts, imageUri: photoUri ?? d.imageUri }
            : d
        )
      );
      setEditingDevice(null);
      setModalVisible(false);
      resetForm();
      setSaving(false);
      return;
    }

    try {
      let updated = await api.patch<ApiDevice>(`/devices/${editingDevice.id}`, {
        name,
        room,
        category,
        watts,
      });

      if (photoUri && photoUri !== editingDevice.imageUri && !photoUri.startsWith("http")) {
        try {
          updated = await uploadDevicePhoto(editingDevice.id, photoUri);
        } catch {}
      }

      setDevices((prev) =>
        prev.map((d) => (d.id === editingDevice.id ? { ...d, ...updated } : d))
      );

      if (Platform.OS === "ios" || Platform.OS === "android") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      emitDevicesChanged();
      setEditingDevice(null);
      setModalVisible(false);
      resetForm();
    } catch (err: any) {
      Alert.alert("Could not save appliance", err?.message ?? "Try saving again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDevice(device: Device) {
    setDeleting(true);
    if (demoData) {
      setDemoDevices((prev) => prev.filter((d) => d.id !== device.id));
      setDeviceToDelete(null);
      setModalVisible(false);
      setEditingDevice(null);
      setDeleting(false);
      return;
    }

    try {
      await api.delete(`/devices/${device.id}`);
      setDevices((prev) => prev.filter((d) => d.id !== device.id));

      if (Platform.OS === "ios" || Platform.OS === "android") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      emitDevicesChanged();
      setDeviceToDelete(null);
      setModalVisible(false);
      setEditingDevice(null);
    } catch (err: any) {
      Alert.alert("Could not remove appliance", err?.message ?? "Try again.");
    } finally {
      setDeleting(false);
    }
  }

  function handleAddDevice() {
    const name = formName.trim();
    if (!name) {
      setFormNameError("Write the appliance name (for example, Bedroom Aircon).");
      return;
    }
    const watts = Math.max(0, parseInt(formWatts, 10) || 0);
    const status: DeviceStatus = watts > 0 ? "ACTIVE" : "IDLE";
    nextTempIdRef.current += 1;
    const id = `local-${nextTempIdRef.current}`;
    const room = formRoom.trim() || "Unassigned";
    const category = formCategory.trim() || null;

    const newDevice: Device = {
      id,
      name,
      room,
      category,
      imageUri: formPhotoUri,
      status,
      watts,
      enabled: true,
    };

    const photoUri = formPhotoUri;
    resetForm();
    setModalVisible(false);

    if (demoData) {
      setDemoDevices((prev) => [newDevice, ...prev]);
      return;
    }

    setDevices((prev) => [newDevice, ...prev]);

    api
      .post<ApiDevice>("/devices", { name, room, watts, enabled: true, category })
      .then(async (created) => {
        if (!created) return;
        let finalDevice = created;
        if (photoUri) {
          try {
            finalDevice = await uploadDevicePhoto(created.id, photoUri);
          } catch {
            finalDevice = { ...created, imageUri: photoUri };
          }
        }
        setDevices((prev) => prev.map((d) => (d.id === id ? finalDevice : d)));
        emitDevicesChanged();
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
    form.append("photo", { uri, name: filename, type: mimeType } as unknown as Blob);
    return api.upload<ApiDevice>(`/devices/${deviceId}/photo`, form);
  }

  async function handleTakePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera blocked", "Allow camera access in Settings to photograph an appliance.");
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
      Alert.alert("Photo library blocked", "Allow photo access in Settings to choose an image.");
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
    const status = effectiveStatus(device);
    const watts = effectiveWatts(device);
    const statusColor = STATUS_COLORS[status];
    const isUnpowered =
      masterPowerOff || (demoData && !isDemoDevicePowered(device.id, { highOn, lowOn }));
    const reading = demoData
      ? demoDeviceReading(device.id, undefined, { highOn, lowOn })
      : liveReadings[device.id];
    const isLoading = demoData ? false : loadingReadings[device.id] ?? false;

    const metaParts = [
      device.room,
      device.category || null,
      demoData
        ? DEMO_HIGH_LINE_IDS.has(device.id)
          ? "High load line"
          : "Low load line"
        : null,
    ].filter(Boolean);

    const elecMetrics =
      reading && typeof reading === "object"
        ? [
            { label: "Voltage", value: `${reading.voltage?.toFixed(1) ?? "—"} V` },
            { label: "Current", value: `${reading.current?.toFixed(2) ?? "—"} A` },
            { label: "Frequency", value: `${reading.frequency?.toFixed(1) ?? "—"} Hz` },
            { label: "Power factor", value: reading.powerFactor?.toFixed(2) ?? "—" },
            { label: "Energy today", value: formatEnergy(reading.todayKwh, 3) },
            { label: "Cost today", value: formatCostOf(reading.todayKwh) },
          ]
        : [];

    return (
      <Pressable
        key={device.id}
        onPress={() => handleAccordionToggle(device.id)}
        onLongPress={() => openEditModal(device)}
        style={({ pressed }) => [
          styles.bannerCard,
          isExpanded && styles.bannerCardExpanded,
          pressed && styles.cardPressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        accessibilityLabel={`${device.name}, ${STATUS_LABELS[status]}, ${formatPower(watts)}`}
      >
        <View style={[styles.statusBar, { backgroundColor: statusColor }]} />

        <View style={styles.bannerCardContent}>
          <View style={styles.bannerCardMain}>
            <View style={styles.bannerCardInfo}>
              <View style={styles.deviceTitleRow}>
                <Text style={styles.deviceName} numberOfLines={1}>
                  {device.name}
                </Text>
              </View>

              <Text style={styles.deviceRoom} numberOfLines={1}>
                {metaParts.join(" · ")}
              </Text>

              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: statusColor + "14",
                      borderColor: statusColor + "40",
                    },
                  ]}
                >
                  <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                  <Text style={[styles.statusPillText, { color: statusColor }]}>
                    {STATUS_LABELS[status]}
                  </Text>
                </View>

                {isUnpowered && (
                  <Text style={styles.masterOffInline} numberOfLines={1}>
                    {masterPowerOff
                      ? MASTER_OFF_LABEL
                      : DEMO_HIGH_LINE_IDS.has(device.id)
                        ? "High line open"
                        : "Low line open"}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.bannerCardRight}>
              <Text style={styles.watts}>{formatPower(watts)}</Text>
              <View style={styles.chevronBadge}>
                {isExpanded ? (
                  <ChevronUp size={15 * fontScale} color={colors.sub} strokeWidth={2} />
                ) : (
                  <ChevronDown size={15 * fontScale} color={colors.sub} strokeWidth={2} />
                )}
              </View>
            </View>
          </View>

          {/* Accordion panel */}
          {isExpanded && (
            <View style={styles.accordionContent}>
              <View style={styles.accordionDivider} />
              {isLoading ? (
                <View style={styles.accordionLoadingRow}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={styles.accordionLoadingText}>Reading latest meter snapshot…</Text>
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
                <Text style={styles.noDataText}>
                  No per-appliance telemetry recorded yet. Whole-home readings remain active on the Dashboard.
                </Text>
              )}

              <View style={styles.deviceActionsRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.editDeviceBtn,
                    pressed && styles.btnPressed,
                  ]}
                  onPress={() => openEditModal(device)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${device.name}`}
                >
                  <Pencil size={14 * fontScale} color={colors.text} strokeWidth={2} />
                  <Text style={styles.editDeviceBtnText}>Edit details</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.deleteDeviceBtn,
                    pressed && styles.btnPressed,
                  ]}
                  onPress={() => setDeviceToDelete(device)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${device.name}`}
                >
                  <Trash2 size={14 * fontScale} color={colors.red} strokeWidth={2} />
                  <Text style={styles.deleteDeviceBtnText}>Remove</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </Pressable>
    );
  }

  // ── Render: photo card ────────────────────────────────────────────────────

  function renderPhotoCard({ item: device }: { item: Device }) {
    const status = effectiveStatus(device);
    const statusColor = STATUS_COLORS[status];

    return (
      <Pressable
        style={({ pressed }) => [styles.photoCard, pressed && styles.cardPressed]}
        onPress={() => openEditModal(device)}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${device.name}`}
      >
        <Pressable
          style={styles.photoCardEditBtn}
          onPress={() => openEditModal(device)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${device.name}`}
        >
          <Pencil size={12 * fontScale} color={colors.white} strokeWidth={2.2} />
        </Pressable>

        {device.imageUri ? (
          <Image
            source={{ uri: resolveAssetUrl(device.imageUri)! }}
            style={styles.photoCardImage}
            accessibilityLabel={device.name}
          />
        ) : (
          <View style={styles.photoCardPlaceholder}>
            <Zap size={28 * fontScale} color={colors.sub} strokeWidth={1.7} />
          </View>
        )}

        <View style={styles.photoCardBody}>
          <Text style={styles.photoDeviceName} numberOfLines={1}>
            {device.name}
          </Text>
          <Text style={styles.deviceRoom} numberOfLines={1}>
            {device.room}
          </Text>
          <View style={styles.photoCardMeta}>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: statusColor + "14",
                  borderColor: statusColor + "40",
                },
              ]}
            >
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusPillText, { color: statusColor }]}>
                {STATUS_LABELS[status]}
              </Text>
            </View>
            <Text style={styles.photoWatts}>{formatPower(effectiveWatts(device))}</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  // ── Render: loading / empty states ────────────────────────────────────────

  function renderListState() {
    if (loadingDevices && !demoData) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.emptyStateText}>Loading registered appliances…</Text>
        </View>
      );
    }
    if (loadError && !demoData) {
      return (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconTile}>
            <CloudOff size={24 * fontScale} color={colors.sub} strokeWidth={1.8} />
          </View>
          <Text style={styles.emptyStateTitle}>Server unreachable</Text>
          <Text style={styles.emptyStateText}>
            Check that your backend is online, then pull down to reload your appliance list.
          </Text>
        </View>
      );
    }
    if (listDevices.length === 0) {
      return (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconTile}>
            <Zap size={24 * fontScale} color={colors.accent} strokeWidth={1.8} />
          </View>
          <Text style={styles.emptyStateTitle}>No appliances registered</Text>
          <Text style={styles.emptyStateText}>
            Add the appliances on your household circuits to track rated wattage and room breakdowns.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.emptyCtaBtn, pressed && styles.btnPressed]}
            onPress={openAddModal}
            accessibilityRole="button"
          >
            <Plus size={16 * fontScale} color={colors.bg} strokeWidth={2.3} />
            <Text style={styles.emptyCtaText}>Register first appliance</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIconTile}>
          <Search size={22 * fontScale} color={colors.sub} strokeWidth={1.8} />
        </View>
        <Text style={styles.emptyStateTitle}>No matching appliances</Text>
        <Text style={styles.emptyStateText}>
          {`Nothing in your inventory matched "${search}".`}
        </Text>
      </View>
    );
  }

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Animated.View
        style={[
          styles.inner,
          {
            opacity: enterOpacity,
            transform: [{ translateY: enterTranslate }],
          },
        ]}
      >
        {/* Header block */}
        <View style={styles.header}>
          <View style={styles.headerTextCol}>
            <Text style={styles.eyebrow}>
              {demoData ? "Sample household inventory" : "Household load inventory"}
            </Text>
            <Text style={styles.title}>Appliances</Text>
            <Text style={styles.subtitle}>
              {listDevices.length === 0
                ? "0 registered loads"
                : `${activeCount} active of ${listDevices.length} · ${formatPower(totalDrawWatts)} live`}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              style={({ pressed }) => [styles.provisionBtn, pressed && styles.btnPressed]}
              onPress={() => router.push("/iot-provision" as any)}
              accessibilityRole="button"
              accessibilityLabel="Provision ESP32 Wi-Fi"
            >
              <Wifi size={16 * fontScale} color={colors.accent} strokeWidth={2} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.addBtn, pressed && styles.btnPressed]}
              onPress={openAddModal}
              accessibilityRole="button"
              accessibilityLabel="Add appliance"
            >
              <Plus size={16 * fontScale} color={colors.bg} strokeWidth={2.4} />
              <Text style={styles.addBtnText}>Add load</Text>
            </Pressable>
          </View>
        </View>

        {/* Search + View switcher toolbar */}
        <View style={styles.toolbarRow}>
          <View
            style={[
              styles.searchContainer,
              searchFocused && styles.searchContainerFocused,
            ]}
          >
            <Search size={16 * fontScale} color={colors.sub} strokeWidth={2} />
            <TextInput
              style={styles.searchInput}
              placeholder="Filter by name, room, or category"
              placeholderTextColor={colors.inactive}
              value={search}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onChangeText={setSearch}
              accessibilityLabel="Filter appliances"
            />
            {search.length > 0 && (
              <Pressable
                onPress={() => setSearch("")}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <X size={15 * fontScale} color={colors.sub} strokeWidth={2} />
              </Pressable>
            )}
          </View>

          <View style={styles.viewSegment}>
            <Pressable
              onPress={() => switchViewMode("banner")}
              style={[
                styles.viewToggleBtn,
                viewMode === "banner" && styles.viewToggleActive,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: viewMode === "banner" }}
              accessibilityLabel="List view"
            >
              <List
                size={17 * fontScale}
                color={viewMode === "banner" ? colors.text : colors.sub}
                strokeWidth={2}
              />
            </Pressable>
            <Pressable
              onPress={() => switchViewMode("photo")}
              style={[
                styles.viewToggleBtn,
                viewMode === "photo" && styles.viewToggleActive,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: viewMode === "photo" }}
              accessibilityLabel="Grid view"
            >
              <LayoutGrid
                size={16 * fontScale}
                color={viewMode === "photo" ? colors.text : colors.sub}
                strokeWidth={2}
              />
            </Pressable>
          </View>
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
              indicatorColor={colors.accent}
            >
              {filtered.map((device) => renderBannerCard(device))}
              <View style={{ height: 24 }} />
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
              indicatorColor={colors.accent}
              data={filtered}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={styles.photoRow}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              renderItem={renderPhotoCard}
              ListFooterComponent={<View style={{ height: 24 }} />}
            />
          ))}
      </Animated.View>

      {/* Add / Edit Appliance Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          resetForm();
          setModalVisible(false);
        }}
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
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalEyebrow}>
                    {editingDevice ? "Update load record" : "New household load"}
                  </Text>
                  <Text style={styles.modalTitle}>
                    {editingDevice ? "Edit appliance" : "Register appliance"}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    resetForm();
                    setModalVisible(false);
                  }}
                  style={styles.closeBtn}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Close form"
                >
                  <X size={18 * fontScale} color={colors.sub} strokeWidth={2} />
                </Pressable>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Appliance name</Text>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === "name" && styles.inputFocused,
                    formNameError ? styles.inputError : null,
                  ]}
                  placeholder="Air Conditioner"
                  placeholderTextColor={colors.inactive}
                  value={formName}
                  onFocus={() => setFocusedField("name")}
                  onBlur={() => setFocusedField((f) => (f === "name" ? null : f))}
                  onChangeText={(t) => {
                    setFormName(t);
                    if (formNameError) setFormNameError(null);
                  }}
                  accessibilityLabel="Appliance name"
                />
                {formNameError && <Text style={styles.fieldError}>{formNameError}</Text>}
              </View>

              <View style={styles.twoColRow}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Room</Text>
                  <TextInput
                    style={[styles.input, focusedField === "room" && styles.inputFocused]}
                    placeholder="Bedroom"
                    placeholderTextColor={colors.inactive}
                    value={formRoom}
                    onFocus={() => setFocusedField("room")}
                    onBlur={() => setFocusedField((f) => (f === "room" ? null : f))}
                    onChangeText={setFormRoom}
                    accessibilityLabel="Room"
                  />
                </View>

                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Rated power (W)</Text>
                  <TextInput
                    style={[styles.input, focusedField === "watts" && styles.inputFocused]}
                    placeholder="1200"
                    placeholderTextColor={colors.inactive}
                    value={formWatts}
                    onFocus={() => setFocusedField("watts")}
                    onBlur={() => setFocusedField((f) => (f === "watts" ? null : f))}
                    onChangeText={(t) => setFormWatts(t.replace(/[^0-9]/g, ""))}
                    keyboardType="number-pad"
                    accessibilityLabel="Rated power in watts"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Category (optional)</Text>
                <TextInput
                  style={[styles.input, focusedField === "category" && styles.inputFocused]}
                  placeholder="Cooling, Kitchen, Lighting"
                  placeholderTextColor={colors.inactive}
                  value={formCategory}
                  onFocus={() => setFocusedField("category")}
                  onBlur={() => setFocusedField((f) => (f === "category" ? null : f))}
                  onChangeText={setFormCategory}
                  accessibilityLabel="Category"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Appliance photo (optional)</Text>
                <View style={styles.photoSection}>
                  {formPhotoUri ? (
                    <View style={styles.photoThumbnailWrapper}>
                      <Image
                        source={{ uri: formPhotoUri }}
                        style={styles.photoThumbnail}
                        accessibilityLabel="Selected appliance photo"
                      />
                      <Pressable
                        style={styles.photoRemoveBtn}
                        onPress={() => setFormPhotoUri(null)}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel="Remove photo"
                      >
                        <X size={14 * fontScale} color={colors.white} strokeWidth={2.4} />
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <ImageIcon size={20 * fontScale} color={colors.sub} strokeWidth={1.8} />
                    </View>
                  )}

                  <View style={styles.photoBtnCol}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.cameraBtn,
                        pressed && styles.btnPressed,
                      ]}
                      onPress={handleTakePhoto}
                      accessibilityRole="button"
                    >
                      <Camera size={16 * fontScale} color={colors.text} strokeWidth={2} />
                      <Text style={styles.cameraBtnText}>Take photo</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.cameraBtn,
                        pressed && styles.btnPressed,
                      ]}
                      onPress={handlePickFromGallery}
                      accessibilityRole="button"
                    >
                      <ImageIcon size={16 * fontScale} color={colors.text} strokeWidth={2} />
                      <Text style={styles.cameraBtnText}>Choose from library</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.submitBtn,
                  pressed && !saving && styles.btnPressed,
                  saving && styles.btnDisabled,
                ]}
                onPress={editingDevice ? handleSaveDevice : handleAddDevice}
                disabled={saving}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator size="small" color={colors.bg} />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {editingDevice ? "Save appliance changes" : "Save appliance"}
                  </Text>
                )}
              </Pressable>

              {editingDevice && (
                <Pressable
                  style={({ pressed }) => [
                    styles.modalDeleteBtn,
                    pressed && styles.btnPressed,
                  ]}
                  onPress={() => setDeviceToDelete(editingDevice)}
                  accessibilityRole="button"
                >
                  <Trash2 size={16 * fontScale} color={colors.red} strokeWidth={2} />
                  <Text style={styles.modalDeleteBtnText}>Remove appliance from inventory</Text>
                </Pressable>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {deviceToDelete && (
        <ConfirmModal
          visible={true}
          loading={deleting}
          destructive={true}
          iconNode={<Trash2 size={19 * fontScale} color={colors.red} strokeWidth={2} />}
          title={`Remove ${deviceToDelete.name}?`}
          message="Deletes this appliance and its per-device history from your household inventory."
          confirmText="Remove appliance"
          cancelText="Keep it"
          onConfirm={() => handleDeleteDevice(deviceToDelete)}
          onCancel={() => setDeviceToDelete(null)}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PHOTO_CARD_WIDTH = (SCREEN_WIDTH - 40 - 10) / 2;

function createStyles(colors: ThemeColors, fontScale: number) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    inner: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 12,
    },

    // Header
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 16,
      gap: 12,
    },
    headerTextCol: {
      flex: 1,
    },
    eyebrow: {
      color: colors.accent,
      fontSize: 12.5 * fontScale,
      fontWeight: "500",
      marginBottom: 2,
    },
    title: {
      color: colors.text,
      fontSize: 26 * fontScale,
      fontWeight: "600",
      letterSpacing: -0.4,
      lineHeight: 32 * fontScale,
    },
    subtitle: {
      color: colors.sub,
      fontSize: 13.5 * fontScale,
      marginTop: 2,
    },
    headerActions: {
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
      marginTop: 4,
    },
    provisionBtn: {
      width: 40,
      height: 40,
      borderRadius: 8,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    addBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.accent,
      borderRadius: 8,
      height: 40,
      paddingHorizontal: 14,
    },
    addBtnText: {
      color: colors.bg,
      fontSize: 14 * fontScale,
      fontWeight: "600",
    },

    // Toolbar: Search + View toggle
    toolbarRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 14,
    },
    searchContainer: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.card,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      height: 44,
    },
    searchContainerFocused: {
      borderColor: colors.accent,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
      fontSize: 15 * fontScale,
      height: 44,
    },
    viewSegment: {
      flexDirection: "row",
      backgroundColor: colors.card,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 3,
      height: 44,
      alignItems: "center",
      gap: 2,
    },
    viewToggleBtn: {
      width: 36,
      height: 36,
      borderRadius: 6,
      alignItems: "center",
      justifyContent: "center",
    },
    viewToggleActive: {
      backgroundColor: colors.surface,
    },

    // Shared list
    list: {
      gap: 10,
    },

    // Empty / loading states
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingBottom: 56,
      paddingHorizontal: 24,
    },
    emptyIconTile: {
      width: 48,
      height: 48,
      borderRadius: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    emptyStateTitle: {
      color: colors.text,
      fontSize: 17 * fontScale,
      fontWeight: "600",
    },
    emptyStateText: {
      color: colors.sub,
      fontSize: 14 * fontScale,
      lineHeight: 20 * fontScale,
      textAlign: "center",
      maxWidth: 300,
    },
    emptyCtaBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.accent,
      borderRadius: 8,
      height: 44,
      paddingHorizontal: 16,
      marginTop: 8,
    },
    emptyCtaText: {
      color: colors.bg,
      fontSize: 14.5 * fontScale,
      fontWeight: "600",
    },

    // Banner card
    bannerCard: {
      flexDirection: "row",
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    bannerCardExpanded: {
      borderColor: colors.accentBorder,
    },
    cardPressed: {
      opacity: 0.92,
    },
    statusBar: {
      width: 3,
      alignSelf: "stretch",
    },
    bannerCardContent: {
      flex: 1,
      padding: 15,
    },
    bannerCardMain: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    bannerCardInfo: {
      flex: 1,
      gap: 3,
    },
    deviceTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    deviceName: {
      color: colors.text,
      fontSize: 16 * fontScale,
      fontWeight: "600",
      letterSpacing: -0.2,
    },
    deviceRoom: {
      color: colors.sub,
      fontSize: 13 * fontScale,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 5,
      flexWrap: "wrap",
    },
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      borderRadius: 6,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusPillText: {
      fontSize: 11.5 * fontScale,
      fontWeight: "600",
    },
    masterOffInline: {
      color: colors.sub,
      fontSize: 12 * fontScale,
    },
    bannerCardRight: {
      alignItems: "flex-end",
      gap: 8,
    },
    watts: {
      color: colors.text,
      fontSize: 16 * fontScale,
      fontWeight: "600",
    },
    chevronBadge: {
      width: 26,
      height: 26,
      borderRadius: 6,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },

    // Accordion
    accordionWrapper: {
      overflow: "hidden",
    },
    accordionContent: {
      paddingTop: 4,
      paddingBottom: 2,
    },
    accordionDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 12,
    },
    accordionLoadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingBottom: 8,
    },
    accordionLoadingText: {
      color: colors.sub,
      fontSize: 13 * fontScale,
    },
    noDataText: {
      color: colors.sub,
      fontSize: 13 * fontScale,
      lineHeight: 18 * fontScale,
      paddingBottom: 4,
    },
    metricsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    metricCell: {
      width: "48%",
      backgroundColor: colors.bg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 9,
      gap: 2,
    },
    metricLabel: {
      color: colors.sub,
      fontSize: 11.5 * fontScale,
    },
    metricValue: {
      color: colors.text,
      fontSize: 14.5 * fontScale,
      fontWeight: "600",
    },
    deviceActionsRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 8,
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    editDeviceBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    editDeviceBtnText: {
      color: colors.text,
      fontSize: 13 * fontScale,
      fontWeight: "500",
    },
    deleteDeviceBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.red + "40",
      backgroundColor: colors.red + "12",
    },
    deleteDeviceBtnText: {
      color: colors.red,
      fontSize: 13 * fontScale,
      fontWeight: "600",
    },

    // Photo mode
    photoRow: {
      gap: 10,
    },
    photoCard: {
      width: PHOTO_CARD_WIDTH,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    photoCardEditBtn: {
      position: "absolute",
      top: 8,
      right: 8,
      width: 28,
      height: 28,
      borderRadius: 6,
      backgroundColor: colors.overlayStrong,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2,
    },
    photoCardImage: {
      width: "100%",
      height: 132,
      resizeMode: "cover",
    },
    photoCardPlaceholder: {
      width: "100%",
      height: 132,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    photoCardBody: {
      padding: 12,
      gap: 2,
    },
    photoDeviceName: {
      color: colors.text,
      fontSize: 14.5 * fontScale,
      fontWeight: "600",
    },
    photoCardMeta: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 6,
    },
    photoWatts: {
      color: colors.text,
      fontSize: 13.5 * fontScale,
      fontWeight: "600",
    },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "flex-end",
    },
    modalCard: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderTopWidth: 1,
      borderColor: colors.border,
      maxHeight: "90%",
    },
    modalScroll: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 32,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 18,
      gap: 12,
    },
    modalEyebrow: {
      color: colors.accent,
      fontSize: 12.5 * fontScale,
      fontWeight: "500",
      marginBottom: 2,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 21 * fontScale,
      fontWeight: "600",
      letterSpacing: -0.3,
    },
    closeBtn: {
      width: 34,
      height: 34,
      borderRadius: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    twoColRow: {
      flexDirection: "row",
      gap: 12,
    },
    fieldGroup: {
      marginBottom: 14,
    },
    fieldLabel: {
      color: colors.text,
      fontSize: 13.5 * fontScale,
      fontWeight: "500",
      marginBottom: 6,
    },
    input: {
      backgroundColor: colors.bg,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      height: 48,
      color: colors.text,
      fontSize: 16 * fontScale,
    },
    inputFocused: {
      borderColor: colors.accent,
    },
    inputError: {
      borderColor: colors.red,
    },
    fieldError: {
      color: colors.red,
      fontSize: 12.5 * fontScale,
      marginTop: 5,
    },
    photoSection: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    photoThumbnailWrapper: {
      position: "relative",
    },
    photoThumbnail: {
      width: 88,
      height: 88,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    photoRemoveBtn: {
      position: "absolute",
      top: -6,
      right: -6,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.red,
      alignItems: "center",
      justifyContent: "center",
    },
    photoPlaceholder: {
      width: 88,
      height: 88,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
    },
    photoBtnCol: {
      flex: 1,
      gap: 8,
    },
    cameraBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      borderRadius: 8,
      height: 40,
      paddingHorizontal: 12,
    },
    cameraBtnText: {
      color: colors.text,
      fontSize: 13.5 * fontScale,
      fontWeight: "500",
    },
    submitBtn: {
      backgroundColor: colors.accent,
      borderRadius: 8,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 10,
    },
    submitBtnText: {
      color: colors.bg,
      fontSize: 15.5 * fontScale,
      fontWeight: "600",
    },
    modalDeleteBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 10,
      height: 46,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.red + "40",
      backgroundColor: colors.red + "12",
    },
    modalDeleteBtnText: {
      color: colors.red,
      fontSize: 14.5 * fontScale,
      fontWeight: "600",
    },
    btnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.99 }],
    },
    btnDisabled: {
      opacity: 0.55,
    },
  });
}
