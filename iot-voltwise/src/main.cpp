#include <Arduino.h>
#include <PZEM004Tv30.h>
#include <math.h>
#include <time.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#include "secrets.h" // WiFi + HiveMQ credentials + DEVICE_UID (copy from secrets.h.example)

// =========================
// Pin Configuration
// =========================

// PZEM UART pins
const int PZEM_RX_PIN = 16; // ESP32 RX2 receives from PZEM TX
const int PZEM_TX_PIN = 17; // ESP32 TX2 sends to PZEM RX

// Relay pins (2-channel relay module)
// Pin 25: Low Voltage / Low Load line (e.g. 10A relays: Outlets, Smart TV, Rice Cooker, Chargers, Lights)
// Pin 26: High Voltage / High Load line (e.g. 30A relays: Aircon, Refrigerator, Heavy loads)
const int RELAY_LOW_PIN  = 25;
const int RELAY_HIGH_PIN = 26;

const int NUM_RELAYS = 2;

const int RELAY_PINS[NUM_RELAYS] = {
  RELAY_LOW_PIN,
  RELAY_HIGH_PIN
};

// Most relay modules are active LOW.
// If your relay turns ON when you write HIGH, change this to false.
const bool RELAY_ACTIVE_LOW = true;

// Safety threshold example.
// Change this based on your actual circuit/load rating.
// Can be dynamically enabled/disabled and configured via MQTT topic voltwise/<uid>/safety/set.
bool safetyCutoffEnabled = true;
float maxAllowedPowerWatts = 3000.0;
const float MAX_ALLOWED_POWER_WATTS = 3000.0;

// Read sensor every 2 seconds
const unsigned long SENSOR_READ_INTERVAL_MS = 2000;

// Diagnostic mode: prints each raw reading + the PZEM slave address so you can
// tell a dead UART link from a partial/AC-power problem. Set to false once the
// sensor is confirmed working.
const bool DIAGNOSTIC_MODE = true;

// How many times to re-attempt a read before declaring failure.
const int SENSOR_READ_RETRIES = 3;

// Shutdown countdown: once current above this threshold is detected, a
// countdown starts and power is cut when it reaches zero. The threshold is
// above the PZEM's noise floor so a truly idle line doesn't trigger it.
// Can be dynamically enabled/disabled and configured via MQTT topic voltwise/<uid>/countdown/set.
// Disabled by default so continuous loads (refrigerators, fans) run without artificial interruption.
bool shutdownCountdownEnabled = false;
unsigned long shutdownCountdownSeconds = 1800; // Default: 30 minutes when enabled
float currentDetectThresholdAmps = 0.05;
const float CURRENT_DETECT_THRESHOLD_AMPS = 0.05;
const unsigned long SHUTDOWN_COUNTDOWN_SECONDS = 30;


// =========================
// Network Configuration
// =========================

// Topics are compile-time concatenations of the device UID from secrets.h.
// Contract shared with backend (MQTT_DEVICE_UID) and app (EXPO_PUBLIC_MQTT_DEVICE_UID).
#define TOPIC_TELEMETRY       "voltwise/" DEVICE_UID "/telemetry"
#define TOPIC_RELAY_STATE     "voltwise/" DEVICE_UID "/relay/state"
#define TOPIC_RELAY_SET       "voltwise/" DEVICE_UID "/relay/set"
#define TOPIC_SAFETY_STATE    "voltwise/" DEVICE_UID "/safety/state"
#define TOPIC_SAFETY_SET      "voltwise/" DEVICE_UID "/safety/set"
#define TOPIC_COUNTDOWN_STATE "voltwise/" DEVICE_UID "/countdown/state"
#define TOPIC_COUNTDOWN_SET   "voltwise/" DEVICE_UID "/countdown/set"
#define TOPIC_STATUS          "voltwise/" DEVICE_UID "/status"


// Re-issue WiFi.begin() this often while disconnected.
const unsigned long WIFI_RETRY_INTERVAL_MS = 15000;

// MQTT reconnect backoff: start at 5 s, double up to 60 s, reset on success.
const unsigned long MQTT_BACKOFF_MIN_MS = 5000;
const unsigned long MQTT_BACKOFF_MAX_MS = 60000;

// mbedTLS rejects certificates when the clock is wrong, and a fresh ESP32
// boots thinking it is 1970 — so NTP must succeed before any TLS connect.
// Any time after ~Nov 2023 counts as "synced".
const time_t MIN_VALID_EPOCH = 1700000000;

// ISRG Root X1 — the Let's Encrypt root CA that signs HiveMQ Cloud's
// certificate chain. Valid until 2035.
static const char HIVEMQ_ROOT_CA[] PROGMEM = R"CERT(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)CERT";


// =========================
// PZEM Object
// =========================

PZEM004Tv30 pzem(Serial2, PZEM_RX_PIN, PZEM_TX_PIN);


// =========================
// Network Objects
// =========================

WiFiClientSecure secureClient;
PubSubClient mqtt(secureClient);


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
void applyRelays(bool on, const char* reason);
void applyLineRelay(const char* line, bool on, const char* reason);
void setRelay(int relayNumber, bool turnOn);
void writeRelayPin(int pin, bool turnOn);

PowerReadings readPowerSensor();
bool readingsAreValid(PowerReadings readings);
void printReadings(PowerReadings readings);
void handlePowerSafety(PowerReadings readings);
void printDiagnostics(PowerReadings readings);

void updateShutdownCountdown(PowerReadings readings);
void tickShutdownCountdown();

int getRelayOnState();
int getRelayOffState();

const char* getWifiStatusString(wl_status_t status);
const char* getRssiQuality(int rssi);
void maintainWifi();
void maintainTimeSync();
void maintainMqtt();
void onMqttMessage(char* topic, byte* payload, unsigned int length);
void publishTelemetry(PowerReadings readings);
void publishRelayState();
void publishSafetyState();
void publishCountdownState();



// =========================
// Relay / Safety State
// =========================

bool relaysAreOn = false;
bool highLineOn = false;
bool lowLineOn = false;
const char* relayReason = "boot";    // "boot" | "remote" | "overpower" | "countdown"

bool countdownActive = false;
bool powerShutDown = false;          // latched until reboot or a remote ON command
unsigned long countdownEndTime = 0;
long lastPrintedSecond = -1;

// Set by a remote ON command: suppresses the shutdown countdown from re-arming
// until current drops below the detect threshold once. Without this, current
// still flowing through the just-restored relays would immediately restart the
// 30 s countdown and cut the power the user asked for. The over-power safety
// is NEVER suppressed by this flag.
bool remoteOverride = false;


// =========================
// Network State
// =========================

bool wifiWasConnected = false;
bool wifiConnecting = false;
int wifiAttemptCount = 0;
unsigned long lastWifiAttempt = 0;
unsigned long lastWifiProgressPrint = 0;

bool ntpStarted = false;
bool timeSynced = false;
unsigned long lastMqttAttempt = 0;
unsigned long mqttBackoffMs = MQTT_BACKOFF_MIN_MS;


// =========================
// Main Setup
// =========================

void setup() {
  Serial.begin(115200);

  setupRelays();

  // Loads are wired through COM + NO, so the relays must be energized for
  // power to flow. The countdown / over-power safety opens them to cut power.
  // Turn them on BEFORE the (multi-second) WiFi/TLS bring-up so power flows
  // immediately and the relays don't chatter during boot.
  applyRelays(true, "boot");

  Serial.println();
  Serial.println("ESP32 + PZEM-004T + 2-Channel Relay Started");
  Serial.println("Relay mapping: Pin 25 = Low Power Line, Pin 26 = High Power Line");
  Serial.println("All relays are ON at startup (power flowing).");

  WiFi.mode(WIFI_STA);

  secureClient.setCACert(HIVEMQ_ROOT_CA);
  // secureClient.setInsecure(); // TLS debugging ONLY: skips cert validation.

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  // Default buffer is 256 B and publish() silently drops anything larger
  // (topic + JSON payload); 512 gives comfortable headroom.
  mqtt.setBufferSize(512);
  mqtt.setKeepAlive(30);
  mqtt.setSocketTimeout(10);
}


// =========================
// Main Loop
// =========================

void loop() {
  static unsigned long lastSensorReadTime = 0;

  unsigned long currentTime = millis();

  if (currentTime - lastSensorReadTime >= SENSOR_READ_INTERVAL_MS) {
    lastSensorReadTime = currentTime;

    // Retry a few times before giving up — a single dropped Modbus frame
    // shouldn't be reported as a hard failure.
    PowerReadings readings;
    bool valid = false;
    for (int attempt = 1; attempt <= SENSOR_READ_RETRIES; attempt++) {
      readings = readPowerSensor();
      if (readingsAreValid(readings)) {
        valid = true;
        break;
      }
      if (DIAGNOSTIC_MODE) {
        Serial.print("Read attempt ");
        Serial.print(attempt);
        Serial.println(" failed (NaN). Retrying...");
      }
    }

    if (valid) {
      printReadings(readings);
      publishTelemetry(readings);
      handlePowerSafety(readings);
      updateShutdownCountdown(readings);
    } else {
      Serial.println("Sensor reading failed. Check PZEM wiring, AC input, RX/TX, and GND.");
      if (DIAGNOSTIC_MODE) {
        printDiagnostics(readings);
      }
      // CRITICAL: Even if the PZEM sensor has no AC mains voltage connected (e.g. testing on USB),
      // we still publish baseline telemetry so the backend and mobile app recognize the device
      // as LIVE and ONLINE rather than displaying "Device offline".
      PowerReadings zeroReadings = { 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f };
      publishTelemetry(zeroReadings);
    }

    Serial.println("----------------------------------");
  }

  // Runs every loop pass (not just on sensor reads) so the countdown prints
  // once per second and the cutoff fires on time.
  tickShutdownCountdown();

  // Network upkeep is fully non-blocking: the sensor loop, safety cutoff, and
  // countdown all keep running while WiFi/MQTT are down.
  maintainWifi();
  maintainTimeSync();
  maintainMqtt();
}


// =========================
// Relay Functions
// =========================

// Drives a relay pin ON or OFF.
// Active-LOW relay modules connected to 3.3V ESP32 GPIOs leak current through the 5V
// optocoupler/LED circuit when driven HIGH (5V - 3.3V = 1.7V), causing the LED to stay
// dimly lit ("low light"). Setting the pin to INPUT (High-Impedance / tri-state) mode
// completely cuts the path to ground, reducing current to 0 and turning the LED 100% OFF.
void writeRelayPin(int pin, bool turnOn) {
  if (RELAY_ACTIVE_LOW) {
    if (turnOn) {
      pinMode(pin, OUTPUT);
      digitalWrite(pin, LOW);
    } else {
      digitalWrite(pin, HIGH);
      pinMode(pin, INPUT); // High-Z: completely cuts off any leakage current
    }
  } else {
    pinMode(pin, OUTPUT);
    digitalWrite(pin, turnOn ? HIGH : LOW);
  }
}


void setupRelays() {
  writeRelayPin(RELAY_LOW_PIN, false);
  writeRelayPin(RELAY_HIGH_PIN, false);
}


// Single choke point for relay changes: drives the pins, records the state +
// reason, and publishes the retained relay/state topic. Idempotent, so a QoS 1
// redelivery of the same command is harmless.
void applyRelays(bool on, const char* reason) {
  writeRelayPin(RELAY_LOW_PIN, on);
  writeRelayPin(RELAY_HIGH_PIN, on);

  relaysAreOn = on;
  highLineOn = on;
  lowLineOn = on;
  relayReason = reason;

  Serial.println("----------------------------------");
  Serial.print("All relays (Low Line Pin 25 & High Line Pin 26) turned ");
  Serial.print(on ? "ON" : "OFF");
  Serial.print(" (Reason: ");
  Serial.print(reason);
  Serial.println(").");
  Serial.println("----------------------------------");

  publishRelayState();
}


void applyLineRelay(const char* line, bool on, const char* reason) {
  if (strcmp(line, "high") == 0) {
    writeRelayPin(RELAY_HIGH_PIN, on);
    highLineOn = on;
    Serial.print("High Voltage Line (Pin 26) turned ");
    Serial.println(on ? "ON" : "OFF");
  } else if (strcmp(line, "low") == 0) {
    writeRelayPin(RELAY_LOW_PIN, on);
    lowLineOn = on;
    Serial.print("Low Voltage Line (Pin 25) turned ");
    Serial.println(on ? "ON" : "OFF");
  }

  relaysAreOn = highLineOn || lowLineOn;
  relayReason = reason;

  publishRelayState();
}


void setRelay(int relayNumber, bool turnOn) {
  if (relayNumber == 1) {
    applyLineRelay("low", turnOn, "manual");
  } else if (relayNumber == 2) {
    applyLineRelay("high", turnOn, "manual");
  } else {
    Serial.print("Invalid relay number: ");
    Serial.print(relayNumber);
    Serial.println(". Use 1 (Low Line / Pin 25) or 2 (High Line / Pin 26).");
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


// Prints each raw field individually plus the PZEM slave address so you can
// tell WHERE the failure is:
//   - Address reads 0x00 / 0xFF (or nan) AND every field nan  -> UART link is
//     dead: check TX<->RX crossover, level-converter power (HV/LV/GND), baud.
//   - Address reads a real value (e.g. 0xF8) but fields nan    -> UART is fine,
//     the PZEM just isn't powered by AC: check live mains on the voltage terminals.
//   - Only some fields nan                                      -> intermittent
//     wiring/noise: reseat connectors, shorten UART wires, add common ground.
void printDiagnostics(PowerReadings readings) {
  Serial.println(">>> DIAGNOSTICS <<<");

  uint8_t address = pzem.readAddress();
  Serial.print("PZEM slave address: 0x");
  Serial.println(address, HEX);
  Serial.println("  (default is 0xF8. 0x00/0xFF usually means no UART reply.)");

  Serial.print("  voltage     = "); Serial.println(readings.voltage);
  Serial.print("  current     = "); Serial.println(readings.current);
  Serial.print("  power       = "); Serial.println(readings.power);
  Serial.print("  energy      = "); Serial.println(readings.energy, 3);
  Serial.print("  frequency   = "); Serial.println(readings.frequency);
  Serial.print("  powerFactor = "); Serial.println(readings.powerFactor);

  if (address == 0x00 || address == 0xFF) {
    Serial.println("HINT: No UART reply. Check TX<->RX crossover, converter HV/LV/GND power, and baud (should be 9600).");
  } else {
    Serial.println("HINT: UART link OK. NaN fields mean the PZEM has no AC power -> check live mains on the voltage terminals.");
  }
}


// =========================
// Safety / Control Logic
// =========================

void handlePowerSafety(PowerReadings readings) {
  // If safety cutoff is toggled OFF by the user, do not trip
  if (!safetyCutoffEnabled) {
    return;
  }

  static int overpowerConsecutiveReads = 0;

  if (readings.power > maxAllowedPowerWatts) {
    overpowerConsecutiveReads++;
    // Inrush surge tolerance: require 2 consecutive reads (> 2-4 seconds) to trigger cutoff
    if (overpowerConsecutiveReads >= 2) {
      Serial.println("WARNING: Power sustained above threshold!");
      Serial.println("Turning all relays OFF for safety.");

      // Latch so nothing re-enables power automatically. A remote ON command
      // can clear the latch, but if the load is still over the limit this
      // safety simply fires again on the next reading.
      powerShutDown = true;
      countdownActive = false;
      applyRelays(false, "overpower");
    }
  } else {
    overpowerConsecutiveReads = 0;
  }
}



// =========================
// Shutdown Countdown
// =========================

// Called once per sensor read: starts the countdown when current appears,
// cancels it if the current disappears before time runs out.
// Dynamically enabled/disabled and configured via MQTT countdown/set.
void updateShutdownCountdown(PowerReadings readings) {
  if (!shutdownCountdownEnabled) {
    if (countdownActive) {
      countdownActive = false;
      Serial.println("Shutdown countdown disabled. Active countdown cancelled.");
    }
    return;
  }

  if (powerShutDown) {
    return;
  }

  bool currentDetected = readings.current >= currentDetectThresholdAmps;

  // After a remote ON, don't re-arm the countdown until the current has
  // dropped below the threshold once — see the remoteOverride comment above.
  if (remoteOverride) {
    if (!currentDetected) {
      remoteOverride = false;
      Serial.println("Current dropped below threshold. Remote override cleared; auto-shutdown re-armed.");
    }
    return;
  }

  if (currentDetected && !countdownActive) {
    countdownActive = true;
    countdownEndTime = millis() + shutdownCountdownSeconds * 1000UL;
    lastPrintedSecond = -1;

    Serial.print("Current detected (");
    Serial.print(readings.current);
    Serial.print(" A). Power will shut down in ");
    Serial.print(shutdownCountdownSeconds);
    Serial.println(" seconds!");
  } else if (!currentDetected && countdownActive) {
    countdownActive = false;
    Serial.println("Current no longer detected. Shutdown countdown cancelled.");
  }
}


// Called every loop pass: prints the remaining seconds once per second and
// cuts the relays when the countdown reaches zero.
void tickShutdownCountdown() {
  if (!shutdownCountdownEnabled || !countdownActive) {
    return;
  }

  long remainingMs = (long)(countdownEndTime - millis());

  if (remainingMs <= 0) {
    countdownActive = false;
    powerShutDown = true;

    Serial.println("Countdown finished. SHUTTING DOWN POWER!");
    applyRelays(false, "countdown");
    return;
  }

  long remainingSeconds = (remainingMs + 999) / 1000;  // round up

  if (remainingSeconds != lastPrintedSecond) {
    lastPrintedSecond = remainingSeconds;
    Serial.print("Shutting down power in ");
    Serial.print(remainingSeconds);
    Serial.println(" s...");
  }
}


// =========================
// WiFi / Time / MQTT
// =========================

// =========================
// WiFi / Time / MQTT
// =========================

const char* getWifiStatusString(wl_status_t status) {
  switch (status) {
    case WL_IDLE_STATUS:     return "IDLE (Changing state)";
    case WL_NO_SSID_AVAIL:   return "SSID NOT FOUND (Network unavailable)";
    case WL_SCAN_COMPLETED:  return "SCAN COMPLETED";
    case WL_CONNECTED:       return "CONNECTED";
    case WL_CONNECT_FAILED:  return "CONNECT FAILED (Invalid password or rejected)";
    case WL_CONNECTION_LOST: return "CONNECTION LOST";
    case WL_DISCONNECTED:    return "DISCONNECTED";
    default:                 return "UNKNOWN";
  }
}

const char* getRssiQuality(int rssi) {
  if (rssi >= -55) return "Excellent";
  if (rssi >= -67) return "Very Good";
  if (rssi >= -75) return "Good";
  if (rssi >= -85) return "Fair";
  return "Weak";
}

void maintainWifi() {
  wl_status_t status = WiFi.status();

  if (status == WL_CONNECTED) {
    if (!wifiWasConnected) {
      wifiWasConnected = true;
      wifiConnecting = false;
      wifiAttemptCount = 0;

      int rssi = WiFi.RSSI();
      Serial.println();
      Serial.println("==================================================");
      Serial.println(" >>> WiFi CONNECTED SUCCESSFULLY! <<<");
      Serial.println("==================================================");
      Serial.print  ("  SSID:        "); Serial.println(WiFi.SSID());
      Serial.print  ("  IP Address:  "); Serial.println(WiFi.localIP());
      Serial.print  ("  Subnet Mask: "); Serial.println(WiFi.subnetMask());
      Serial.print  ("  Gateway IP:  "); Serial.println(WiFi.gatewayIP());
      Serial.print  ("  Signal:      "); Serial.print(rssi); Serial.print(" dBm ("); Serial.print(getRssiQuality(rssi)); Serial.println(")");
      Serial.print  ("  MAC Address: "); Serial.println(WiFi.macAddress());
      Serial.println("==================================================");
      Serial.println();
    }
    return;
  }

  // Detect WiFi disconnection
  if (wifiWasConnected) {
    wifiWasConnected = false;
    wifiConnecting = false;
    lastWifiAttempt = 0; // Trigger immediate reconnect attempt

    Serial.println();
    Serial.println("==================================================");
    Serial.println(" !!! WiFi CONNECTION LOST! !!!");
    Serial.println("==================================================");
    Serial.print  ("  SSID:       "); Serial.println(WIFI_SSID);
    Serial.print  ("  Status:     "); Serial.println(getWifiStatusString(status));
    Serial.println("  Next Step:  Attempting reconnection...");
    Serial.println("==================================================");
    Serial.println();
  }

  unsigned long now = millis();

  // Handle active connection attempt timeout or explicit failure
  if (wifiConnecting) {
    bool timedOut = (now - lastWifiAttempt >= WIFI_RETRY_INTERVAL_MS);
    bool explicitFail = (status == WL_CONNECT_FAILED || status == WL_NO_SSID_AVAIL);

    if (timedOut || explicitFail) {
      wifiConnecting = false;

      Serial.println();
      Serial.println("==================================================");
      Serial.println(" !!! WiFi CONNECTION FAILED! !!!");
      Serial.println("==================================================");
      Serial.print  ("  SSID:       "); Serial.println(WIFI_SSID);
      Serial.print  ("  Attempt:    #"); Serial.print(wifiAttemptCount); Serial.println(" failed");
      Serial.print  ("  Status:     "); Serial.println(getWifiStatusString(status));
      if (status == WL_CONNECT_FAILED) {
        Serial.println("  Diagnosis:  Password may be incorrect or rejected by AP.");
      } else if (status == WL_NO_SSID_AVAIL) {
        Serial.println("  Diagnosis:  SSID not found. Check router or 2.4 GHz band.");
      } else {
        Serial.println("  Diagnosis:  Connection timed out after 15 seconds.");
      }
      Serial.print  ("  Next Step:  Retrying in ");
      Serial.print  (WIFI_RETRY_INTERVAL_MS / 1000);
      Serial.println(" seconds...");
      Serial.println("==================================================");
      Serial.println();

      lastWifiAttempt = now;
      return;
    }

    // Periodic progress reminder every 5s while waiting
    if (now - lastWifiProgressPrint >= 5000) {
      lastWifiProgressPrint = now;
      unsigned long elapsedSec = (now - lastWifiAttempt) / 1000;
      Serial.print("[WIFI] Still connecting to \"");
      Serial.print(WIFI_SSID);
      Serial.print("\"... (");
      Serial.print(elapsedSec);
      Serial.println("s elapsed)");
    }
    return;
  }

  // Backoff between retry attempts
  if (lastWifiAttempt != 0 && now - lastWifiAttempt < WIFI_RETRY_INTERVAL_MS) {
    return;
  }

  lastWifiAttempt = now;
  lastWifiProgressPrint = now;
  wifiConnecting = true;
  wifiAttemptCount++;

  Serial.println();
  Serial.println("==================================================");
  Serial.print  (" >>> Connecting to WiFi: \"");
  Serial.print  (WIFI_SSID);
  Serial.print  ("\" (Attempt #");
  Serial.print  (wifiAttemptCount);
  Serial.println(")... <<<");
  Serial.println("==================================================");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}


void maintainTimeSync() {
  if (timeSynced || WiFi.status() != WL_CONNECTED) {
    return;
  }

  static unsigned long ntpStartTime = 0;
  if (!ntpStarted) {
    ntpStarted = true;
    ntpStartTime = millis();
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    Serial.println("Syncing clock via NTP (required for TLS)...");
  }

  if (time(nullptr) > MIN_VALID_EPOCH) {
    timeSynced = true;
    Serial.println("Clock synced via NTP. TLS connections are now possible.");
    return;
  }

  // Fallback: If NTP takes more than 8 seconds (e.g. UDP port 123 blocked by router/hotspot),
  // set a known valid epoch time so TLS certificate validation succeeds and MQTT can connect.
  if (millis() - ntpStartTime > 8000) {
    timeSynced = true;
    struct timeval tv;
    tv.tv_sec = 1715000000; // May 2024 (well within ISRG Root X1 cert validity 2015-2035)
    tv.tv_usec = 0;
    settimeofday(&tv, NULL);
    Serial.println("NTP response delayed; applied fallback clock epoch for TLS.");
  }
}


void maintainMqtt() {
  if (WiFi.status() != WL_CONNECTED || !timeSynced) {
    return;
  }

  unsigned long now = millis();

  if (mqtt.connected()) {
    mqtt.loop();

    // Re-assert online status heartbeat every 15 seconds to ensure backend & app know device is live
    static unsigned long lastStatusHeartbeat = 0;
    if (now - lastStatusHeartbeat >= 15000) {
      lastStatusHeartbeat = now;
      mqtt.publish(TOPIC_STATUS, "online", true);
    }
    return;
  }

  if (lastMqttAttempt != 0 && now - lastMqttAttempt < mqttBackoffMs) {
    return;
  }
  lastMqttAttempt = now;

  Serial.println();
  Serial.println("==================================================");
  Serial.print  (" [MQTT] Connecting to broker ");
  Serial.print  (MQTT_HOST);
  Serial.println("...");
  Serial.println("==================================================");

  // LWT: the broker publishes retained "offline" on our status topic if this
  // client vanishes without a clean disconnect.
  bool connected = mqtt.connect(
    DEVICE_UID,
    MQTT_USERNAME,
    MQTT_PASSWORD,
    TOPIC_STATUS,
    1,      // willQoS
    true,   // willRetain
    "offline"
  );

  if (connected) {
    mqttBackoffMs = MQTT_BACKOFF_MIN_MS;
    Serial.println();
    Serial.println("==================================================");
    Serial.println(" >>> MQTT BROKER CONNECTED SUCCESSFULLY! <<<");
    Serial.print  ("  Device UID: "); Serial.println(DEVICE_UID);
    Serial.print  ("  Host:       "); Serial.println(MQTT_HOST);
    Serial.println("==================================================");

    // Publish online status (retained) so backend & app discover the device
    bool pubStatus = mqtt.publish(TOPIC_STATUS, "online", true);
    Serial.print("[MQTT] Published 'online' status: ");
    Serial.println(pubStatus ? "SUCCESS" : "FAILED");

    // Publish current relay state (retained) so app immediately knows lines are ON
    publishRelayState();

    // Publish current safety cutoff configuration (retained)
    publishSafetyState();

    // Publish current countdown configuration (retained)
    publishCountdownState();

    // Subscribe to remote relay control commands
    mqtt.subscribe(TOPIC_RELAY_SET, 1);
    Serial.print("[MQTT] Subscribed to command topic: ");
    Serial.println(TOPIC_RELAY_SET);

    // Subscribe to safety cutoff control commands
    mqtt.subscribe(TOPIC_SAFETY_SET, 1);
    Serial.print("[MQTT] Subscribed to safety topic: ");
    Serial.println(TOPIC_SAFETY_SET);

    // Subscribe to countdown control commands
    mqtt.subscribe(TOPIC_COUNTDOWN_SET, 1);
    Serial.print("[MQTT] Subscribed to countdown topic: ");
    Serial.println(TOPIC_COUNTDOWN_SET);
    Serial.println();

  } else {
    Serial.print("MQTT connect failed (state ");
    Serial.print(mqtt.state());
    Serial.print("). Retrying in ");
    Serial.print(mqttBackoffMs / 1000);
    Serial.println(" s.");

    mqttBackoffMs = min(mqttBackoffMs * 2, MQTT_BACKOFF_MAX_MS);
  }
}


// Handles remote relay commands published to voltwise/<uid>/relay/set.
// Payload: {"on": true|false, "line": "high"|"low"|"all"}.
// Pin 25 = Low Power Line, Pin 26 = High Power Line.
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  if (strcmp(topic, TOPIC_COUNTDOWN_SET) == 0) {
    JsonDocument doc;
    DeserializationError parseError = deserializeJson(doc, payload, length);
    if (!parseError && doc["enabled"].is<bool>()) {
      shutdownCountdownEnabled = doc["enabled"].as<bool>();
      if (doc["seconds"].is<unsigned long>()) {
        shutdownCountdownSeconds = doc["seconds"].as<unsigned long>();
      }
      if (!shutdownCountdownEnabled) {
        countdownActive = false;
      }
      Serial.println();
      Serial.println("==================================================");
      Serial.print  (" [MQTT] Shutdown Countdown Config Updated: ");
      Serial.println(shutdownCountdownEnabled ? "ENABLED" : "DISABLED");
      Serial.print  ("  Countdown Seconds: ");
      Serial.println(shutdownCountdownSeconds);
      Serial.println("==================================================");

      publishCountdownState();
    } else {
      Serial.println("Ignoring malformed countdown config command.");
    }
    return;
  }

  if (strcmp(topic, TOPIC_SAFETY_SET) == 0) {
    JsonDocument doc;
    DeserializationError parseError = deserializeJson(doc, payload, length);
    if (!parseError && doc["enabled"].is<bool>()) {
      safetyCutoffEnabled = doc["enabled"].as<bool>();
      if (doc["thresholdWatts"].is<float>()) {
        maxAllowedPowerWatts = doc["thresholdWatts"].as<float>();
      }
      if (doc["countdownEnabled"].is<bool>()) {
        shutdownCountdownEnabled = doc["countdownEnabled"].as<bool>();
        if (doc["countdownSeconds"].is<unsigned long>()) {
          shutdownCountdownSeconds = doc["countdownSeconds"].as<unsigned long>();
        }
        if (!shutdownCountdownEnabled) {
          countdownActive = false;
        }
        publishCountdownState();
      }
      Serial.println();
      Serial.println("==================================================");
      Serial.print  (" [MQTT] Safety Cutoff Config Updated: ");
      Serial.println(safetyCutoffEnabled ? "ENABLED" : "DISABLED");
      Serial.print  ("  Threshold Watts: ");
      Serial.println(maxAllowedPowerWatts);
      Serial.println("==================================================");

      publishSafetyState();
    } else {
      Serial.println("Ignoring malformed safety config command.");
    }
    return;
  }

  if (strcmp(topic, TOPIC_RELAY_SET) != 0) {
    return;
  }


  JsonDocument doc;
  DeserializationError parseError = deserializeJson(doc, payload, length);
  if (parseError || !doc["on"].is<bool>()) {
    Serial.println("Ignoring malformed relay command.");
    return;
  }

  bool turnOn = doc["on"].as<bool>();
  const char* line = doc["line"] | "all";

  Serial.println();
  Serial.println("==================================================");
  Serial.print  (" [MQTT] Remote Relay Command: ");
  Serial.print  (turnOn ? "TURN ON" : "TURN OFF");
  Serial.print  (" | Target Line: ");
  Serial.println(line);
  Serial.println("==================================================");

  if (turnOn) {
    // The user explicitly wants power back: clear the shutdown latch and stop
    // the countdown from instantly re-cutting it (see remoteOverride).
    powerShutDown = false;
    countdownActive = false;
    remoteOverride = true;
  } else if (strcmp(line, "all") == 0) {
    // Cut all power: latch shutdown so auto-restart doesn't turn it back on
    powerShutDown = true;
    countdownActive = false;
  }

  if (strcmp(line, "high") == 0) {
    // High Load Voltage line -> Pin 26
    applyLineRelay("high", turnOn, "remote");
  } else if (strcmp(line, "low") == 0) {
    // Low Load Voltage line -> Pin 25
    applyLineRelay("low", turnOn, "remote");
  } else {
    // "all" or Cut all power -> both Pin 25 and Pin 26
    applyRelays(turnOn, "remote");
  }
}


void publishTelemetry(PowerReadings readings) {
  if (!mqtt.connected()) {
    return;
  }

  JsonDocument doc;
  doc["voltage"] = isnan(readings.voltage) ? 0.0f : readings.voltage;
  doc["current"] = isnan(readings.current) ? 0.0f : readings.current;
  doc["watts"] = isnan(readings.power) ? 0.0f : readings.power;
  doc["kwh"] = isnan(readings.energy) ? 0.0f : readings.energy;
  doc["frequency"] = isnan(readings.frequency) ? 0.0f : readings.frequency;
  doc["powerFactor"] = isnan(readings.powerFactor) ? 0.0f : readings.powerFactor;
  doc["ms"] = millis(); // uptime, for debugging only — backend stamps real time

  char buffer[256];
  size_t length = serializeJson(doc, buffer, sizeof(buffer));

  if (!mqtt.publish(TOPIC_TELEMETRY, (const uint8_t*)buffer, length, false)) {
    Serial.println("Telemetry publish failed (check MQTT buffer size / connection).");
  }
}


void publishRelayState() {
  if (!mqtt.connected()) {
    return;
  }

  JsonDocument doc;
  doc["on"] = relaysAreOn;
  doc["highOn"] = highLineOn;
  doc["lowOn"] = lowLineOn;
  doc["reason"] = relayReason;

  char buffer[128];
  size_t length = serializeJson(doc, buffer, sizeof(buffer));

  // Retained: subscribers get the current relay state immediately on connect.
  if (!mqtt.publish(TOPIC_RELAY_STATE, (const uint8_t*)buffer, length, true)) {
    Serial.println("Relay state publish failed (check MQTT buffer size / connection).");
  }
}


void publishSafetyState() {
  if (!mqtt.connected()) {
    return;
  }

  JsonDocument doc;
  doc["enabled"] = safetyCutoffEnabled;
  doc["thresholdWatts"] = maxAllowedPowerWatts;

  char buffer[128];
  size_t length = serializeJson(doc, buffer, sizeof(buffer));

  // Retained: subscribers get the safety cutoff state immediately on connect.
  if (!mqtt.publish(TOPIC_SAFETY_STATE, (const uint8_t*)buffer, length, true)) {
    Serial.println("Safety state publish failed (check MQTT buffer size / connection).");
  }
}


void publishCountdownState() {
  if (!mqtt.connected()) {
    return;
  }

  JsonDocument doc;
  doc["enabled"] = shutdownCountdownEnabled;
  doc["seconds"] = shutdownCountdownSeconds;

  char buffer[128];
  size_t length = serializeJson(doc, buffer, sizeof(buffer));

  // Retained: subscribers get the countdown state immediately on connect.
  if (!mqtt.publish(TOPIC_COUNTDOWN_STATE, (const uint8_t*)buffer, length, true)) {
    Serial.println("Countdown state publish failed (check MQTT buffer size / connection).");
  }
}


