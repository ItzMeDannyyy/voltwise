import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api, ApiDevice } from "../../lib/api";

const C = {
  bg: "#1a1f2e",
  card: "#242b3d",
  accent: "#00d4aa",
  text: "#ffffff",
  sub: "#9ca3af",
  border: "#2d3448",
  yellow: "#f59e0b",
  red: "#ef4444",
};

type DeviceStatus = "ACTIVE" | "IDLE" | "OFF";

interface Device {
  id: string;
  icon: string;
  name: string;
  room: string;
  status: DeviceStatus;
  watts: number;
  enabled: boolean;
}

const INITIAL_DEVICES: Device[] = [
  { id: "1", icon: "❄️", name: "Air Conditioner", room: "Bedroom", status: "ACTIVE", watts: 1200, enabled: true },
  { id: "2", icon: "💡", name: "Living Room Lights", room: "Living Room", status: "ACTIVE", watts: 340, enabled: true },
  { id: "3", icon: "🖥️", name: "Smart TV", room: "Living Room", status: "IDLE", watts: 0, enabled: false },
  { id: "4", icon: "🍳", name: "Kitchen Appliances", room: "Kitchen", status: "ACTIVE", watts: 860, enabled: true },
  { id: "5", icon: "🧺", name: "Washing Machine", room: "Laundry", status: "OFF", watts: 0, enabled: false },
  { id: "6", icon: "🧊", name: "Refrigerator", room: "Kitchen", status: "ACTIVE", watts: 180, enabled: true },
  { id: "7", icon: "🚿", name: "Water Heater", room: "Bathroom", status: "ACTIVE", watts: 1500, enabled: true },
];

const STATUS_COLORS: Record<DeviceStatus, string> = {
  ACTIVE: C.accent,
  IDLE: C.yellow,
  OFF: C.red,
};

const ICON_OPTIONS = ["❄️", "💡", "🖥️", "🍳", "🧺", "🧊", "🚿", "🔌", "🌡️", "📺", "🔥", "💻"];

function formatWatts(watts: number): string {
  if (watts >= 1000) {
    return `${watts.toLocaleString("en-US")}W`;
  }
  return `${watts}W`;
}

export default function DevicesScreen() {
  const [devices, setDevices] = useState<Device[]>(INITIAL_DEVICES);
  const [search, setSearch] = useState("");

  // Remembers each device's "on" status/watts so toggling off then back on restores them.
  const originalsRef = useRef<Record<string, { status: DeviceStatus; watts: number }>>(
    Object.fromEntries(
      INITIAL_DEVICES.map((d) => [d.id, { status: d.status, watts: d.watts }])
    )
  );

  // Add-device modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [formIcon, setFormIcon] = useState(ICON_OPTIONS[0]);
  const [formName, setFormName] = useState("");
  const [formRoom, setFormRoom] = useState("");
  const [formWatts, setFormWatts] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);

  // Load the device registry from the backend on mount.
  useEffect(() => {
    let cancelled = false;
    api
      .get<ApiDevice[]>("/devices")
      .then((data) => {
        if (cancelled || !data?.length) return;
        setDevices(data);
        originalsRef.current = Object.fromEntries(
          data.map((d) => [d.id, { status: d.status, watts: d.watts }])
        );
      })
      .catch(() => {
        // Offline-first: keep the seeded INITIAL_DEVICES fallback.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = devices.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.room.toLowerCase().includes(search.toLowerCase())
  );

  function handleToggle(id: string, value: boolean) {
    // Optimistically update the UI, then persist to the backend.
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        if (!value) {
          return { ...d, enabled: false, status: "OFF", watts: 0 };
        }
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
      .catch(() => {
        // Keep the optimistic state if the request fails.
      });
  }

  function resetForm() {
    setFormIcon(ICON_OPTIONS[0]);
    setFormName("");
    setFormRoom("");
    setFormWatts("");
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

    // Store the "on" baseline so it can be restored after toggling off.
    originalsRef.current[id] = {
      status: status === "OFF" ? "ACTIVE" : status,
      watts,
    };

    const room = formRoom.trim() || "Unassigned";
    const newDevice: Device = {
      id,
      icon: formIcon,
      name,
      room,
      status,
      watts: formEnabled ? watts : 0,
      enabled: formEnabled,
    };

    // Optimistically add, then persist and reconcile with the server record.
    setDevices((prev) => [newDevice, ...prev]);
    resetForm();
    setModalVisible(false);

    api
      .post<ApiDevice>("/devices", { icon: formIcon, name, room, watts, enabled: formEnabled })
      .then((created) => {
        if (!created) return;
        originalsRef.current[created.id] = { status: created.status, watts: created.watts };
        setDevices((prev) => prev.map((d) => (d.id === id ? created : d)));
      })
      .catch(() => {
        // Keep the optimistic local device if the request fails.
      });
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.title}>Devices</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>

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

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        >
          {filtered.map((device) => (
            <View key={device.id} style={styles.card}>
              <View style={styles.iconBox}>
                <Text style={styles.iconEmoji}>{device.icon}</Text>
              </View>

              <View style={styles.info}>
                <Text style={styles.deviceName}>{device.name}</Text>
                <Text style={styles.deviceRoom}>{device.room}</Text>
                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: STATUS_COLORS[device.status] },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      { color: STATUS_COLORS[device.status] },
                    ]}
                  >
                    {device.status}
                  </Text>
                </View>
              </View>

              <View style={styles.right}>
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
          ))}
          <View style={{ height: 16 }} />
        </ScrollView>
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Device</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={24} color={C.sub} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Icon</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.iconPicker}
            >
              {ICON_OPTIONS.map((icon) => (
                <TouchableOpacity
                  key={icon}
                  style={[
                    styles.iconOption,
                    formIcon === icon && styles.iconOptionActive,
                  ]}
                  onPress={() => setFormIcon(icon)}
                >
                  <Text style={styles.iconEmoji}>{icon}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

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

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleAddDevice}
              activeOpacity={0.8}
            >
              <Text style={styles.submitBtnText}>Add Device</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
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
  list: {
    gap: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  iconEmoji: {
    fontSize: 22,
  },
  info: {
    flex: 1,
    gap: 2,
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
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  right: {
    alignItems: "flex-end",
    gap: 6,
  },
  watts: {
    color: C.text,
    fontSize: 16,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
  iconPicker: {
    gap: 10,
    paddingVertical: 2,
  },
  iconOption: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: C.card,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  iconOptionActive: {
    borderColor: C.accent,
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
  enabledRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
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
