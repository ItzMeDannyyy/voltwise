# ESP32 + PZEM-004T + CT Clamp + 4-Channel Relay IoT Build Guide

This guide explains how to use an **ESP32**, **PZEM-004T v3.0 sensor with CT clamp**, **4-channel relay module**, **Hi-Link AC-DC power module**, and **logic level converter**.

It includes:

- Non-code explanation of each component
- Step-by-step wiring guide
- Recommended ESP32 pin assignments
- Required libraries and their purpose
- Readable C++ code using function prototypes

> ⚠️ **Safety warning:** The PZEM, Hi-Link, relay contact side, and appliance/load wiring involve **AC mains voltage**. AC mains can kill you or cause fire if wired incorrectly. Do your first tests with **USB power and low-voltage loads only**. For real household wiring, use a proper enclosure, fuse, wire gauge, terminal blocks, and help from someone qualified.

---

## 1. What Each Component Does

### 1.1 ESP32

The **ESP32** is the brain of your IoT device. It reads data from the PZEM sensor, decides whether a load is normal or abnormal, then controls the relay module.

In your project, the ESP32 handles:

- Reading voltage, current, power, energy, frequency, and power factor
- Turning relays ON/OFF
- Later, sending data to your backend, mobile app, or MQTT broker

The ESP32 has multiple UART serial ports. For the PZEM-004T, a common setup uses `Serial2` with GPIO16 and GPIO17.

---

### 1.2 PZEM-004T v3.0 with CT Clamp

The **PZEM-004T v3.0** is the AC power monitoring sensor. It measures:

- Voltage
- Current
- Active power
- Energy in kWh
- Frequency
- Power factor

The **CT clamp** is the current transformer. It senses current without cutting the wire.

Important rule:

> Clamp around only **one live/hot wire**, not both live and neutral together.

If you clamp around both live and neutral wires, the magnetic fields cancel each other and the current reading may become zero or incorrect.

The PZEM must also be connected properly to its AC measurement side to read voltage and power correctly.

---

### 1.3 4-Channel Relay Module

The **relay module** allows the ESP32 to control appliances or loads.

Each relay channel usually has:

- `IN1`, `IN2`, `IN3`, `IN4` — control pins from ESP32
- `VCC` — usually 5V
- `GND` — common ground
- `COM` — common relay terminal
- `NO` — normally open
- `NC` — normally closed

For most loads, use **NO**. This means the appliance is OFF by default and only turns ON when the relay is activated.

Many relay modules are **active-LOW**:

```cpp
LOW  = relay ON
HIGH = relay OFF
```

That is why the code below makes the relay behavior configurable.

---

### 1.4 Hi-Link AC-DC Power Module

The **Hi-Link module** converts AC mains voltage into low-voltage DC, usually 5V.

In your setup, it can power:

- ESP32 through the `VIN` or `5V` pin
- Relay module 5V input
- PZEM logic side 5V
- Logic level converter high-voltage side

Do **not** connect 5V to the ESP32 `3V3` pin. Use the ESP32 `VIN` or `5V` pin if your board supports it.

For real deployment, the Hi-Link side should have:

- Fuse
- Proper enclosure
- Safe spacing between AC and DC
- Terminal blocks
- Correct wire gauge
- No exposed copper

---

### 1.5 Logic Level Converter

The ESP32 uses **3.3V logic**. Some modules use **5V logic**.

The logic level converter protects the ESP32 and helps convert:

```text
ESP32 3.3V signal <-> 5V module signal
```

Use it especially between:

- ESP32 UART pins and PZEM UART pins
- ESP32 relay control pins and relay `IN1-IN4`, if your relay module does not reliably accept 3.3V signals

Some modules may work with 3.3V signals, but level shifting is safer and more reliable.

---

## 2. Recommended ESP32 Pin Assignment

For a common ESP32 DevKit:

| Purpose | ESP32 Pin | Connects To                     |
| ------- | --------: | ------------------------------- |
| PZEM RX |    GPIO16 | PZEM TX through level converter |
| PZEM TX |    GPIO17 | PZEM RX through level converter |
| Relay 1 |    GPIO25 | Relay IN1                       |
| Relay 2 |    GPIO26 | Relay IN2                       |
| Relay 3 |    GPIO27 | Relay IN3                       |
| Relay 4 |    GPIO33 | Relay IN4                       |
| 5V      |  VIN / 5V | Hi-Link 5V output               |
| GND     |       GND | Common ground                   |
| 3.3V    |       3V3 | Level converter LV              |
| 5V      |        5V | Level converter HV              |

Avoid ESP32 strapping pins for relay control:

```text
GPIO0, GPIO2, GPIO5, GPIO12, GPIO15
```

These pins can affect ESP32 boot behavior.

Also avoid GPIO34 to GPIO39 for relays because they are input-only pins.

---

## 3. Step-by-Step Connection Guide

### Step 1: Power Side

Connect:

```text
Hi-Link 5V OUT+  -> ESP32 VIN / 5V
Hi-Link 5V OUT+  -> Relay VCC
Hi-Link 5V OUT+  -> PZEM 5V
Hi-Link 5V OUT+  -> Logic Level Converter HV

Hi-Link GND OUT- -> ESP32 GND
Hi-Link GND OUT- -> Relay GND
Hi-Link GND OUT- -> PZEM GND
Hi-Link GND OUT- -> Logic Level Converter GND

ESP32 3V3       -> Logic Level Converter LV
```

For first testing, power the ESP32 by USB instead of Hi-Link. Add the Hi-Link only when the low-voltage side is already working.

---

### Step 2: PZEM UART Wiring

Using the logic level converter:

```text
PZEM TX -> HV1
LV1     -> ESP32 GPIO16

ESP32 GPIO17 -> LV2
HV2          -> PZEM RX

PZEM 5V  -> 5V
PZEM GND -> GND
```

Remember:

```text
ESP32 RX receives from PZEM TX
ESP32 TX sends to PZEM RX
```

So TX and RX cross each other.

---

### Step 3: CT Clamp Wiring

The CT clamp plugs into the PZEM CT connector.

Then clamp it around the **live/hot wire only** of the line you want to measure.

```text
Correct:
[ CT clamp around LIVE only ]

Wrong:
[ CT clamp around LIVE + NEUTRAL together ]
```

---

### Step 4: PZEM AC Measurement Wiring

This is the dangerous part.

The PZEM AC input terminals connect to the AC line and neutral so the module can measure voltage. The CT clamp measures current.

For a real panel, do not leave this exposed on a breadboard. Use proper terminals and enclosure.

---

### Step 5: Relay Low-Voltage Control Wiring

```text
ESP32 GPIO25 -> Relay IN1
ESP32 GPIO26 -> Relay IN2
ESP32 GPIO27 -> Relay IN3
ESP32 GPIO33 -> Relay IN4

Relay VCC -> 5V
Relay GND -> GND
```

If the relay does not trigger reliably from ESP32 3.3V pins, route `IN1-IN4` through the logic level converter or use a proper transistor/opto driver board.

---

### Step 6: Relay AC Load Wiring

For each controlled load:

```text
AC Live/Hot -> Relay COM
Relay NO    -> Load Live/Hot
AC Neutral  -> Load Neutral
```

Use **NO** so the appliance is OFF when the relay is inactive.

Do not switch only neutral. Switch the live/hot conductor.

---

## 4. Libraries You Need

### 4.1 Required Library: `PZEM004Tv30`

This is the important library for your PZEM sensor.

It lets you call simple functions like:

```cpp
pzem.voltage();
pzem.current();
pzem.power();
pzem.energy();
pzem.frequency();
pzem.pf();
```

Without this library, you would need to manually implement the PZEM serial communication protocol.

---

### 4.2 Built-in Arduino / ESP32 Library

```cpp
#include <Arduino.h>
```

This gives you:

- `pinMode()`
- `digitalWrite()`
- `Serial`
- `millis()`
- `delay()`
- ESP32 Arduino functions

---

### 4.3 Optional Libraries Later

For your full VoltWise IoT system later:

| Library         | Purpose                          |
| --------------- | -------------------------------- |
| `WiFi.h`        | Connect ESP32 to Wi-Fi           |
| `HTTPClient.h`  | Send sensor readings to REST API |
| `PubSubClient`  | Send data through MQTT           |
| `ArduinoJson`   | Format readings as JSON          |
| `Preferences.h` | Save settings like thresholds    |

For now, you only need the PZEM library to read the sensor and normal Arduino functions to control relays.

---

## 5. PlatformIO Setup

Your `platformio.ini` can look like this:

```ini
[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
monitor_speed = 115200

lib_deps =
    mandulaj/PZEM-004T-v30
```

---

## 6. Full Readable ESP32 Code with Function Prototypes

This code does four things:

1. Reads PZEM values.
2. Prints voltage, current, power, energy, frequency, and power factor.
3. Initializes 4 relays safely OFF.
4. Turns all relays OFF if power goes above your configured threshold.

```cpp
#include <Arduino.h>
#include <PZEM004Tv30.h>
#include <math.h>

// =========================
// Pin Configuration
// =========================

// PZEM UART pins
const int PZEM_RX_PIN = 16; // ESP32 RX2 receives from PZEM TX
const int PZEM_TX_PIN = 17; // ESP32 TX2 sends to PZEM RX

// Relay pins
const int RELAY_1_PIN = 25;
const int RELAY_2_PIN = 26;
const int RELAY_3_PIN = 27;
const int RELAY_4_PIN = 33;

const int RELAY_PINS[4] = {
  RELAY_1_PIN,
  RELAY_2_PIN,
  RELAY_3_PIN,
  RELAY_4_PIN
};

// Most 4-channel relay modules are active LOW.
// If your relay turns ON when you write HIGH, change this to false.
const bool RELAY_ACTIVE_LOW = true;

// Safety threshold example.
// Change this based on your actual circuit/load rating.
const float MAX_ALLOWED_POWER_WATTS = 1000.0;

// Read sensor every 2 seconds
const unsigned long SENSOR_READ_INTERVAL_MS = 2000;


// =========================
// PZEM Object
// =========================

PZEM004Tv30 pzem(Serial2, PZEM_RX_PIN, PZEM_TX_PIN);


// =========================
// Data Structure
// =========================

struct PowerReadings {
  float voltage;
  float current;
  float power;
  float energy;
  float frequency;
  float powerFactor;
};


// =========================
// Function Prototypes
// =========================

void setupRelays();
void turnAllRelaysOff();
void setRelay(int relayNumber, bool turnOn);

PowerReadings readPowerSensor();
bool readingsAreValid(PowerReadings readings);
void printReadings(PowerReadings readings);
void handlePowerSafety(PowerReadings readings);

int getRelayOnState();
int getRelayOffState();


// =========================
// Main Setup
// =========================

void setup() {
  Serial.begin(115200);

  setupRelays();
  turnAllRelaysOff();

  Serial.println();
  Serial.println("ESP32 + PZEM-004T + 4-Channel Relay Started");
  Serial.println("All relays are OFF at startup.");
}


// =========================
// Main Loop
// =========================

void loop() {
  static unsigned long lastSensorReadTime = 0;

  unsigned long currentTime = millis();

  if (currentTime - lastSensorReadTime >= SENSOR_READ_INTERVAL_MS) {
    lastSensorReadTime = currentTime;

    PowerReadings readings = readPowerSensor();

    if (readingsAreValid(readings)) {
      printReadings(readings);
      handlePowerSafety(readings);
    } else {
      Serial.println("Sensor reading failed. Check PZEM wiring, AC input, RX/TX, and GND.");
    }

    Serial.println("----------------------------------");
  }
}


// =========================
// Relay Functions
// =========================

void setupRelays() {
  for (int i = 0; i < 4; i++) {
    pinMode(RELAY_PINS[i], OUTPUT);
    digitalWrite(RELAY_PINS[i], getRelayOffState());
  }
}


void turnAllRelaysOff() {
  for (int i = 0; i < 4; i++) {
    digitalWrite(RELAY_PINS[i], getRelayOffState());
  }

  Serial.println("All relays turned OFF.");
}


void setRelay(int relayNumber, bool turnOn) {
  if (relayNumber < 1 || relayNumber > 4) {
    Serial.println("Invalid relay number. Use 1 to 4 only.");
    return;
  }

  int relayIndex = relayNumber - 1;

  if (turnOn) {
    digitalWrite(RELAY_PINS[relayIndex], getRelayOnState());
    Serial.print("Relay ");
    Serial.print(relayNumber);
    Serial.println(" ON");
  } else {
    digitalWrite(RELAY_PINS[relayIndex], getRelayOffState());
    Serial.print("Relay ");
    Serial.print(relayNumber);
    Serial.println(" OFF");
  }
}


int getRelayOnState() {
  if (RELAY_ACTIVE_LOW) {
    return LOW;
  }

  return HIGH;
}


int getRelayOffState() {
  if (RELAY_ACTIVE_LOW) {
    return HIGH;
  }

  return LOW;
}


// =========================
// PZEM Sensor Functions
// =========================

PowerReadings readPowerSensor() {
  PowerReadings readings;

  readings.voltage = pzem.voltage();
  readings.current = pzem.current();
  readings.power = pzem.power();
  readings.energy = pzem.energy();
  readings.frequency = pzem.frequency();
  readings.powerFactor = pzem.pf();

  return readings;
}


bool readingsAreValid(PowerReadings readings) {
  if (isnan(readings.voltage)) {
    return false;
  }

  if (isnan(readings.current)) {
    return false;
  }

  if (isnan(readings.power)) {
    return false;
  }

  if (isnan(readings.energy)) {
    return false;
  }

  if (isnan(readings.frequency)) {
    return false;
  }

  if (isnan(readings.powerFactor)) {
    return false;
  }

  return true;
}


void printReadings(PowerReadings readings) {
  Serial.print("Voltage: ");
  Serial.print(readings.voltage);
  Serial.println(" V");

  Serial.print("Current: ");
  Serial.print(readings.current);
  Serial.println(" A");

  Serial.print("Power: ");
  Serial.print(readings.power);
  Serial.println(" W");

  Serial.print("Energy: ");
  Serial.print(readings.energy, 3);
  Serial.println(" kWh");

  Serial.print("Frequency: ");
  Serial.print(readings.frequency);
  Serial.println(" Hz");

  Serial.print("Power Factor: ");
  Serial.println(readings.powerFactor);
}


// =========================
// Safety / Control Logic
// =========================

void handlePowerSafety(PowerReadings readings) {
  if (readings.power > MAX_ALLOWED_POWER_WATTS) {
    Serial.println("WARNING: Power exceeded threshold!");
    Serial.println("Turning all relays OFF for safety.");

    turnAllRelaysOff();
  }
}
```

---

## 7. How to Test Safely

### Test 1: ESP32 Only

Upload the code. Open Serial Monitor:

```bash
pio device monitor
```

Expected:

```text
ESP32 + PZEM-004T + 4-Channel Relay Started
All relays are OFF at startup.
```

---

### Test 2: Relay Only with No AC Load

Temporarily add this inside `setup()` after `turnAllRelaysOff();`:

```cpp
setRelay(1, true);
delay(1000);
setRelay(1, false);
```

You should hear relay 1 click ON then OFF.

Remove this after testing.

---

### Test 3: PZEM Reading

With PZEM correctly wired and AC measurement side safely connected, Serial Monitor should show something like:

```text
Voltage: 230.10 V
Current: 0.25 A
Power: 45.50 W
Energy: 0.001 kWh
Frequency: 60.00 Hz
Power Factor: 0.89
```

In the Philippines, mains frequency is commonly around 60Hz, so values near that are expected.

---

### Test 4: Combined Logic

If measured power goes above:

```cpp
const float MAX_ALLOWED_POWER_WATTS = 1000.0;
```

The ESP32 will call:

```cpp
turnAllRelaysOff();
```

That is the basic idea for abnormal load protection.

---

## 8. Common Mistakes to Avoid

### Mistake 1: TX/RX Not Crossed

Correct:

```text
ESP32 RX <- PZEM TX
ESP32 TX -> PZEM RX
```

Wrong:

```text
ESP32 RX -> PZEM RX
ESP32 TX -> PZEM TX
```

---

### Mistake 2: No Common Ground

The ESP32, relay module, PZEM logic side, and level converter need a shared low-voltage ground.

---

### Mistake 3: CT Clamp Around Both Wires

Clamp only one conductor. If you clamp both live and neutral, the reading becomes wrong.

---

### Mistake 4: Using NC Instead of NO

For safer default OFF behavior, use:

```text
COM + NO
```

not:

```text
COM + NC
```

---

### Mistake 5: Using Dangerous ESP32 Pins

Avoid these for relay outputs:

```text
GPIO0, GPIO2, GPIO5, GPIO12, GPIO15
```

They affect ESP32 boot mode.

Also avoid GPIO34 to GPIO39 because they are input-only.

---

## 9. Best Project Structure for Your IoT Firmware

For PlatformIO:

```text
iot-voltwise/
├── include/
│   └── README
├── lib/
│   └── README
├── src/
│   └── main.cpp
├── test/
│   └── README
└── platformio.ini
```

For now, keep everything in `src/main.cpp`.

Later, when your code grows, you can split it like this:

```text
src/
├── main.cpp
├── PowerSensor.cpp
├── RelayControl.cpp
└── NetworkService.cpp

include/
├── PowerSensor.h
├── RelayControl.h
└── NetworkService.h
```

But for learning, one readable `main.cpp` is okay.

---

## 10. ==Basic W==iring Summary]]

```text
ESP32 GPIO16  <- Level Converter LV1 <- HV1 <- PZEM TX
ESP32 GPIO17  -> Level Converter LV2 -> HV2 -> PZEM RX

ESP32 GPIO25  -> Relay IN1
ESP32 GPIO26  -> Relay IN2
ESP32 GPIO27  -> Relay IN3
ESP32 GPIO33  -> Relay IN4

ESP32 VIN/5V  <- Hi-Link 5V OUT+
ESP32 GND     <- Hi-Link GND OUT-

Relay VCC     <- 5V
Relay GND     <- GND

PZEM 5V       <- 5V
PZEM GND      <- GND

Level Converter LV  <- ESP32 3.3V
Level Converter HV  <- 5V
Level Converter GND <- GND
```

---

## 11. Minimum Includes for Current Stage

The most important libraries for your current stage are only:

```cpp
#include <Arduino.h>
#include <PZEM004Tv30.h>
```

Everything else can come later when you connect it to your backend or mobile app.

---

## 12. Final Notes

Start in this order:

1. Upload ESP32 code first.
2. Test relay clicks with no AC load.
3. Test PZEM reading separately.
4. Combine relay and PZEM logic.
5. Add Wi-Fi/MQTT/API only after the hardware works.

This keeps debugging easier and safer.
