import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

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

function formatWatts(watts: number): string {
  if (watts >= 1000) {
    return `${watts.toLocaleString("en-US")}W`;
  }
  return `${watts}W`;
}

export default function DevicesScreen() {
  const [devices, setDevices] = useState<Device[]>(INITIAL_DEVICES);
  const [search, setSearch] = useState("");

  const filtered = devices.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.room.toLowerCase().includes(search.toLowerCase())
  );

  function handleToggle(id: string, value: boolean) {
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const original = INITIAL_DEVICES.find((o) => o.id === id)!;
        if (!value) {
          return { ...d, enabled: false, status: "OFF", watts: 0 };
        }
        return { ...d, enabled: true, status: original.status === "OFF" ? "ACTIVE" : original.status, watts: original.watts };
      })
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.title}>Devices</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => Alert.alert("Coming soon", "Add device feature coming soon!")}
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
});
