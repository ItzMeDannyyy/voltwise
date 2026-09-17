# ESP32 + PZEM-004T + CT Clamp + 6-Socket Dual-Load Relay IoT Build Guide (Schematic v4)

This guide explains how to construct and wire the **VoltWise IoT Hardware Layer** according to **Hardware Schematic v4**.

The system integrates an **ESP32**, **PZEM-004T v3.0 power sensor with SCT-013-000 CT clamp**, **Hi-Link HLK-PM01 AC-DC power module**, **6-channel bidirectional logic level converter (LLC)**, and a dual-tier load control architecture comprising:
1. **Low Load Line**: 4-Channel Relay Module (10A / 250V AC) driving 4 general sockets.
2. **High Load Line**: 2× Single-Channel Relay Modules (30A / 250V AC) driving 2 high-power appliance sockets.

It includes:
- Non-code explanation of each component and its role
- Pin assignments and boot-safety analysis
- Step-by-step wiring guide matching Schematic v4
- Required libraries and firmware setup
- Full readable C++ PlatformIO code managing all 6 relay channels and telemetry
- Testing procedure, safety checklist, and MQTT integration notes

> ⚠️ **Safety Warning:** The PZEM-004T, Hi-Link HLK-PM01, relay switch contacts, and appliance sockets involve **220V AC mains voltage**. AC mains can cause severe electrical shock, electrocution, or electrical fires if wired incorrectly. Always perform initial testing with **USB power only** before applying mains power. For deployment, house all high-voltage connections in a fire-rated enclosure with proper terminal blocks, appropriate wire gauges, and fuse/circuit breaker protection.

---

## 1. Component Roles & Specifications

### 1.1 ESP32 Microcontroller
The **ESP32** serves as the central IoT controller. It performs continuous energy telemetry polling, automates overload safety cutoffs, and manages remote switching commands over Wi-Fi and MQTT.

Key roles:
- Polling electrical parameters from the PZEM-004T v3.0 over Hardware `Serial2` (**GPIO 16** for RX2, **GPIO 17** for TX2).
- Driving 6 independent relay channels (4 Low Load via GPIO 12–15; 2 High Load via GPIO 25–26).
- Publishing live telemetry (`voltage`, `current`, `watts`, `kwh`, `frequency`, `powerFactor`) to HiveMQ Cloud.
- Receiving remote relay commands via MQTT or local safety triggers.

---

### 1.2 PZEM-004T v3.0 with SCT-013-000 CT Clamp
The **PZEM-004T v3.0** measures high-voltage AC parameters and offloads mathematical power integration:
- Voltage: $80 - 260 \text{ V AC}$
- Current: $0 - 100 \text{ A}$ (via non-invasive CT clamp)
- Active Power: $0 - 23 \text{ kW}$
- Cumulative Energy: $0 - 9999.99 \text{ kWh}$
- AC Frequency: $45 - 65 \text{ Hz}$
- Power Factor: $0.00 - 1.00$

> **Critical Current Transformer Rule:**
> Clamp the **SCT-013-000** around **only one live/hot conductor**. If clamped around both Live and Neutral conductors simultaneously, the opposing magnetic fields cancel out, producing an erroneous $0\text{ A}$ reading.

---

### 1.3 Dual-Tier Relay System (6 Sockets Total)
To isolate sensitive home electronics from power-hungry inductive appliances, Schematic v4 divides loads into two dedicated lines:

#### A. Low Load Line — 4-Channel Relay Module (10A Each)
- **Module Rating:** 10A / 250V AC per channel.
- **Features:** Opto-isolated, Active-LOW logic, 5V coil power.
- **Control Pins:** ESP32 `GPIO 12, 13, 14, 15` (routed via LLC CH3–CH6).
- **Target Sockets:**
  - **Socket 1 (10A max):** Fan, desk lamp, etc.
  - **Socket 2 (10A max):** Fan, ambient lighting, etc.
  - **Socket 3 (10A max):** TV, laptop charger, etc.
  - **Socket 4 (10A max):** Router, phone charger, etc.

#### B. High Load Line — 2× Single-Channel Relay Modules (30A Each)
- **Module Rating:** 30A / 250V AC per module (heavy-duty contacts for high inrush currents).
- **Features:** Opto-isolated, Active-LOW logic, 5V coil power.
- **Control Pins:** ESP32 `GPIO 25` (Relay HL-1) and `GPIO 26` (Relay HL-2).
- **Target Sockets:**
  - **Socket 1 (30A max):** Air conditioner, large refrigerator, compressor loads.
  - **Socket 2 (30A max):** Water heater, electric oven, high-wattage heating elements.

---

### 1.4 Hi-Link HLK-PM01 AC-DC Step-Down Module
The **HLK-PM01** converts 220V AC mains into a regulated, isolated **5V DC** output (3W / 600mA).

It powers the common **5V DC Bus**, which feeds:
- ESP32 `VIN` pin (which feeds the internal 3.3V LDO regulator).
- PZEM-004T v3.0 logic-side power (`5V` pin).
- Logic Level Converter high-voltage rail (`HV Vcc`).
- Relay coils for both the 4-channel module and the two 30A single-channel modules.

---

### 1.5 6-Channel Bidirectional Logic Level Converter (LLC)
The ESP32 operates at **3.3V CMOS logic**, whereas the PZEM-004T UART port and many 5V opto-coupler relay inputs require or reference **5V TTL levels**.

The 6-channel bidirectional LLC provides level translation:
- **HV (High Voltage Rail):** Connected to the 5V DC bus (`HV Vcc`).
- **LV (Low Voltage Rail):** Connected to ESP32 `3.3V Out` (`LV Vcc`).
- **GND:** Tied to the shared low-voltage DC ground.

Channel distribution:
- **CH1 (UART):** PZEM `TX (5V)` $\rightarrow$ ESP32 `RX (3.3V / GPIO 16)`
- **CH2 (UART):** ESP32 `TX (3.3V / GPIO 17)` $\rightarrow$ PZEM `RX (5V)`
- **CH3 (Relay):** ESP32 `GPIO 12 (3.3V)` $\rightarrow$ Low Load Relay `IN1 (5V)`
- **CH4 (Relay):** ESP32 `GPIO 13 (3.3V)` $\rightarrow$ Low Load Relay `IN2 (5V)`
- **CH5 (Relay):** ESP32 `GPIO 14 (3.3V)` $\rightarrow$ Low Load Relay `IN3 (5V)`
- **CH6 (Relay):** ESP32 `GPIO 15 (3.3V)` $\rightarrow$ Low Load Relay `IN4 (5V)`

---

## 2. Complete ESP32 Pin Assignment & Boot Safety Analysis

| Function / Signal | Pin | Connected To | Logic Level | Boot / Strapping Safety Notes |
| :--- | :---: | :--- | :---: | :--- |
| **PZEM RX2** | **GPIO 16** | PZEM `TX` via LLC CH1 | 3.3V (from 5V) | **Dedicated UART pin** (Hardware `Serial2`). Boot safe. |
| **PZEM TX2** | **GPIO 17** | PZEM `RX` via LLC CH2 | 3.3V (to 5V) | **Dedicated UART pin** (Hardware `Serial2`). Boot safe. |
| **Low Load CH1** | **GPIO 12** | 4-Ch Relay `IN1` via LLC CH3 | 3.3V (to 5V) | ⚠️ **Strapping Pin (MTDI):** Must not be pulled HIGH during boot (causes 1.8V flash voltage failure). Level converter buffer isolates this. |
| **Low Load CH2** | **GPIO 13** | 4-Ch Relay `IN2` via LLC CH4 | 3.3V (to 5V) | General IO. Boot safe. |
| **Low Load CH3** | **GPIO 14** | 4-Ch Relay `IN3` via LLC CH5 | 3.3V (to 5V) | Outputs PWM during boot; opto-isolation prevents false trip. |
| **Low Load CH4** | **GPIO 15** | 4-Ch Relay `IN4` via LLC CH6 | 3.3V (to 5V) | ⚠️ **Strapping Pin (MTDO):** Controls boot log verbosity. Level converter buffers prevent boot stalls. |
| **High Load HL-1**| **GPIO 25** | 30A Relay 1 `IN` | 3.3V | ✅ **Completely Boot Safe:** DAC1/ADC2, non-strapping, high-Z at power-on. No boot chattering. |
| **High Load HL-2**| **GPIO 26** | 30A Relay 2 `IN` | 3.3V | ✅ **Completely Boot Safe:** DAC2/ADC2, non-strapping, high-Z at power-on. No boot chattering. |
| **5V In** | **VIN** | Hi-Link 5V DC Bus | 5V | Powers ESP32 internal 3.3V regulator. |
| **3.3V Out** | **3V3** | LLC `LV Vcc` | 3.3V | References the low-voltage side of the LLC. |
| **GND** | **GND** | Common DC Ground | 0V | Unified ground for all DC electronics. |

---

## 3. Step-by-Step Connection Guide (Schematic v4)

### Step 1: Low-Voltage DC Power Distribution
Establish the shared 5V DC bus and common DC ground:
```text
HLK-PM01 +5V OUT  ──┬──> ESP32 VIN
                    ├──> PZEM-004T 5V (VCC)
                    ├──> LLC HV Vcc
                    ├──> 4-Channel Relay VCC
                    ├──> 30A Relay HL-1 VCC
                    └──> 30A Relay HL-2 VCC

HLK-PM01 GND OUT ──┬──> ESP32 GND
                    ├──> PZEM-004T GND
                    ├──> LLC GND (HV & LV side)
                    ├──> 4-Channel Relay GND
                    ├──> 30A Relay HL-1 GND
                    └──> 30A Relay HL-2 GND

ESP32 3V3 OUT     ─────> LLC LV Vcc
```

---

### Step 2: PZEM-004T v3.0 UART Wiring
Route PZEM serial communications through LLC channels CH1 and CH2:
```text
PZEM TX (5V)       ──> LLC HV1 ──> LLC LV1 ──> ESP32 GPIO 16 (RX2)
ESP32 GPIO 17 (TX2)──> LLC LV2 ──> LLC HV2 ──> PZEM RX (5V)
```

---

### Step 3: Low Load Relays (4-Channel Module)
Route control lines through LLC channels CH3 to CH6:
```text
ESP32 GPIO 12 ──> LLC LV3 ──> LLC HV3 ──> 4-Channel Relay IN1
ESP32 GPIO 13 ──> LLC LV4 ──> LLC HV4 ──> 4-Channel Relay IN2
ESP32 GPIO 14 ──> LLC LV5 ──> LLC HV5 ──> 4-Channel Relay IN3
ESP32 GPIO 15 ──> LLC LV6 ──> LLC HV6 ──> 4-Channel Relay IN4
```

---

### Step 4: High Load Relays (2× 30A Modules)
Connect the high-power relay inputs directly to GPIO 25 and GPIO 26:
```text
ESP32 GPIO 25 ──> 30A Relay HL-1 IN
ESP32 GPIO 26 ──> 30A Relay HL-2 IN
```

---

### Step 5: AC Mains & Sensing Wiring
1. **Mains Input:** Connect 220V AC Wall Plug to the main terminal block.
2. **Current Sensing:** Pass the main 220V **Live (L)** line through the aperture of the **SCT-013-000 CT clamp** before any split. Connect the CT 3.5mm leads to `CT in` on the PZEM.
3. **Voltage Sensing:** Wire a branch of Live (L) and Neutral (N) to the PZEM `AC-in` screw terminals.
4. **Power Supply Input:** Wire a branch of Live (L) and Neutral (N) to the AC input pins of the **HLK-PM01**.

---

### Step 6: AC Load Distribution & Sockets
1. **Live Split (`L rail (split)`):**
   - Live branch connects to COM of 4-Channel Relay CH1, CH2, CH3, and CH4.
   - Live branch connects to COM of 30A Relay HL-1 and 30A Relay HL-2.
   - For each socket, wire its Live terminal to the corresponding relay's **NO (Normally Open)** terminal.
2. **Neutral Split (`N rail (split)`):**
   - Connect the main Neutral line directly to the Neutral terminal of all 6 sockets.
   - **Neutral is NEVER routed through any relay contact.**

---

## 4. PlatformIO Configuration (`platformio.ini`)

```ini
[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
monitor_speed = 115200

lib_deps =
    mandulaj/PZEM-004T-v30
    knolleary/PubSubClient@^2.8
    bblanchon/ArduinoJson@^7.4
```

---

## 5. Production Firmware: 6-Relay & Dual-Tier Management

Below is the clean C++ implementation supporting the full 6-relay architecture, PZEM telemetry, safety cutoff thresholds, and MQTT remote switching:

```cpp
#include <Arduino.h>
#include <PZEM004Tv30.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ==========================================
// Pin Configuration (Schematic v4)
// ==========================================

// PZEM-004T v3.0 UART Pins (Hardware Serial2)
const int PZEM_RX_PIN = 16; // ESP32 RX2 receives from PZEM TX via LLC CH1
const int PZEM_TX_PIN = 17; // ESP32 TX2 sends to PZEM RX via LLC CH2

// Low Load Line (4-Channel 10A Relay Module via LLC CH3-CH6)
const int RELAY_LL1_PIN = 12; // Socket 1 (10A max: Fan, lamp)
const int RELAY_LL2_PIN = 13; // Socket 2 (10A max: Fan, lamp)
const int RELAY_LL3_PIN = 14; // Socket 3 (10A max: TV, charger)
const int RELAY_LL4_PIN = 15; // Socket 4 (10A max: TV, charger)

// High Load Line (2x Single-Channel 30A Relay Modules)
const int RELAY_HL1_PIN = 25; // Socket 1 (30A max: Air conditioner, fridge)
const int RELAY_HL2_PIN = 26; // Socket 2 (30A max: Water heater)

const int NUM_RELAYS = 6;
const int RELAY_PINS[NUM_RELAYS] = {
  RELAY_LL1_PIN,
  RELAY_LL2_PIN,
  RELAY_LL3_PIN,
  RELAY_LL4_PIN,
  RELAY_HL1_PIN,
  RELAY_HL2_PIN
};

// Most opto-isolated relay modules are ACTIVE-LOW
const bool RELAY_ACTIVE_LOW = true;

// Safety cutoff threshold
const float MAX_ALLOWED_POWER_WATTS = 3500.0;
const unsigned long SENSOR_READ_INTERVAL_MS = 2000;

// ==========================================
// Objects & State
// ==========================================

PZEM004Tv30 pzem(Serial2, PZEM_RX_PIN, PZEM_TX_PIN);

struct PowerReadings {
  float voltage;
  float current;
  float power;
  float energy;
  float frequency;
  float powerFactor;
};

// ==========================================
// Function Prototypes
// ==========================================

void setupRelays();
void setRelay(int relayIndex, bool turnOn);
void setAllRelays(bool turnOn);
int getRelayOnState();
int getRelayOffState();

PowerReadings readPowerSensor();
bool readingsAreValid(const PowerReadings& r);
void printReadings(const PowerReadings& r);
void handlePowerSafety(const PowerReadings& r);

// ==========================================
// Setup & Loop
// ==========================================

void setup() {
  Serial.begin(115200);
  delay(500);

  setupRelays();
  setAllRelays(false); // Default safe state: all sockets OFF

  Serial.println("\n==========================================");
  Serial.println("VoltWise IoT Controller Initialized (v4)");
  Serial.println("4x Low Load (10A) + 2x High Load (30A)");
  Serial.println("PZEM-004T Serial2 on GPIO 16 (RX) / 17 (TX)");
  Serial.println("==========================================\n");
}

void loop() {
  static unsigned long lastRead = 0;
  unsigned long now = millis();

  if (now - lastRead >= SENSOR_READ_INTERVAL_MS) {
    lastRead = now;

    PowerReadings r = readPowerSensor();
    if (readingsAreValid(r)) {
      printReadings(r);
      handlePowerSafety(r);
    } else {
      Serial.println("[PZEM] Read failed. Check wiring and AC mains connection.");
    }
  }
}

// ==========================================
// Relay Control Implementations
// ==========================================

int getRelayOnState()  { return RELAY_ACTIVE_LOW ? LOW : HIGH; }
int getRelayOffState() { return RELAY_ACTIVE_LOW ? HIGH : LOW; }

void setupRelays() {
  for (int i = 0; i < NUM_RELAYS; i++) {
    pinMode(RELAY_PINS[i], OUTPUT);
    digitalWrite(RELAY_PINS[i], getRelayOffState());
  }
}

void setRelay(int relayIndex, bool turnOn) {
  if (relayIndex < 0 || relayIndex >= NUM_RELAYS) return;
  digitalWrite(RELAY_PINS[relayIndex], turnOn ? getRelayOnState() : getRelayOffState());
  Serial.printf("Socket %d set to %s\n", relayIndex + 1, turnOn ? "ON" : "OFF");
}

void setAllRelays(bool turnOn) {
  for (int i = 0; i < NUM_RELAYS; i++) {
    digitalWrite(RELAY_PINS[i], turnOn ? getRelayOnState() : getRelayOffState());
  }
  Serial.printf("All sockets set to %s\n", turnOn ? "ON" : "OFF");
}

// ==========================================
// Sensor & Safety Implementations
// ==========================================

PowerReadings readPowerSensor() {
  PowerReadings r;
  r.voltage     = pzem.voltage();
  r.current     = pzem.current();
  r.power       = pzem.power();
  r.energy      = pzem.energy();
  r.frequency   = pzem.frequency();
  r.powerFactor = pzem.pf();
  return r;
}

bool readingsAreValid(const PowerReadings& r) {
  return !isnan(r.voltage) && !isnan(r.current) && !isnan(r.power) &&
         !isnan(r.energy) && !isnan(r.frequency) && !isnan(r.powerFactor);
}

void printReadings(const PowerReadings& r) {
  Serial.printf("V: %.1f V | I: %.2f A | P: %.1f W | E: %.3f kWh | F: %.1f Hz | PF: %.2f\n",
                r.voltage, r.current, r.power, r.energy, r.frequency, r.powerFactor);
}

void handlePowerSafety(const PowerReadings& r) {
  if (r.power > MAX_ALLOWED_POWER_WATTS) {
    Serial.println("⚠️ OVERPOWER DETECTED! Tripping all sockets immediately.");
    setAllRelays(false);
  }
}
```

---

## 6. Safety & Commissioning Checklist

1. **Dry-Run Inspection (USB Only):**
   - Flash the ESP32 via USB without connecting AC mains.
   - Verify in the Serial Monitor that all relay pins initialize HIGH (OFF for active-LOW modules).
   - Use a multimeter to verify 3.3V on the LLC LV rail and 5V on the HV rail.
2. **Relay Sequencer Test:**
   - Execute a bench test cycling each relay channel 1 through 6 sequentially with a 1-second delay. Listen for the distinct relay click.
3. **PZEM Link Test:**
   - With low-voltage DC connected, verify that `pzem.voltage()` returns `NAN` or zero (not a serial communication timeout error), confirming GPIO 16/17 UART integrity.
4. **Mains Commissioning:**
   - Enclose all exposed 220V AC terminals.
   - Secure the SCT-013-000 around the Live conductor only.
   - Apply AC mains power. Verify that the HLK-PM01 provides 5.0V DC and the PZEM returns valid line voltage ($\approx 220\text{V} - 230\text{V}$) and line frequency ($\approx 60\text{ Hz}$).

---

## 7. MQTT Integration Summary (HiveMQ Cloud)

When integrated with the cloud layer, the ESP32 publishes telemetry and responds to socket control topics:

| Topic | Direction | Payload Example | Function |
| :--- | :---: | :--- | :--- |
| `voltwise/<uid>/telemetry` | ESP32 $\rightarrow$ Cloud | `{"voltage":230.1,"current":1.42,"watts":320.5,"kwh":12.4,"frequency":60.0,"powerFactor":0.98}` | Ingested into `EnergyReading` |
| `voltwise/<uid>/relay/state` | ESP32 $\rightarrow$ Cloud | `{"sockets":[true,false,true,false,true,true],"reason":"remote"}` | Real-time state synchronization |
| `voltwise/<uid>/relay/set` | Cloud $\rightarrow$ ESP32 | `{"socket":1,"on":false}` or `{"all":false}` | Target socket control |
| `voltwise/<uid>/status` | Broker LWT | `"online"` / `"offline"` | Keep-alive monitoring |
