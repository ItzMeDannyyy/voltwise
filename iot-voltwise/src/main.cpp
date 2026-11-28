#include <Arduino.h>
#include <PZEM004Tv30.h>
#include <math.h>
#include <time.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7789.h>
#include <Adafruit_ST7735.h>

#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include <esp_system.h>

#include "secrets.h" // WiFi + HiveMQ credentials + DEVICE_UID (copy from secrets.h.example)
#include "config_manager.h"
#include "provisioning_server.h"

// =========================
// Pin Configuration
// =========================

// Factory Reset / Setup trigger button pin (ESP32 BOOT button is GPIO 0)
const int RESET_BUTTON_PIN = 0;

// PZEM UART pins
const int PZEM_RX_PIN = 16; // ESP32 RX2 receives from PZEM TX
const int PZEM_TX_PIN = 17; // ESP32 TX2 sends to PZEM RX

// Relay pins (2-channel relay module)
// Pin 25: Low Voltage / Low Load line (e.g. 10A relays: Outlets, Smart TV, Rice Cooker, Chargers, Lights)
// Pin 26: High Voltage / High Load line (e.g. 30A relays: Aircon, Refrigerator, Heavy loads)
const int RELAY_LOW_PIN = 25;
const int RELAY_HIGH_PIN = 26;

// 7-Pin ST7789 TFT SPI LCD Display Pins (Top to Bottom: CS, DC, RST, SDA, SCL, VCC, GND)
const int OLED_CS_PIN = 5;   // 1. CS  -> GPIO 5
const int OLED_DC_PIN = 23;  // 2. DC  -> GPIO 23
const int OLED_RST_PIN = 4;  // 3. RST -> GPIO 4
const int OLED_SDA_PIN = 19; // 4. SDA -> GPIO 19 (SPI MOSI)
const int OLED_SCL_PIN = 18; // 5. SCL -> GPIO 18 (SPI SCK)
// 6. VCC -> ESP32 3V3
// 7. GND -> ESP32 GND

// Native panel dimensions (ST7789 240x320 portrait panel).
// In landscape mode (rotation 1 or 3), width becomes 320 and height becomes 240.
const int TFT_SCREEN_WIDTH = 240;
const int TFT_SCREEN_HEIGHT = 320;

// Most relay modules are active LOW.
// If your relay turns ON when you write HIGH, change this to false.
const bool RELAY_ACTIVE_LOW = true;

// Staggered Relay Power-Up Configuration
// When activating power (e.g. boot or remote "all" command), the Low Load Line (Pin 25)
// turns ON first. The High Load Line (Pin 26) turns ON after INTERVAL_TIME seconds to
// mitigate inrush current transients and prevent ESP32 brownout resets.
// Change 3 to 5 (or any desired seconds) as needed without breaking anything.
#define INTERVAL_TIME 3

// Smart Hybrid Network Power Configuration
// At boot, relays remain safely OFF while the ESP32 initializes and searches for Wi-Fi.
// If Wi-Fi connects within NETWORK_CONNECT_TIMEOUT_SEC, power is energized immediately (staggered).
// If no network connects after NETWORK_CONNECT_TIMEOUT_SEC, the system falls back to Autonomous Mode
// and energizes power anyway so appliances/house are never left without electricity.
#define NETWORK_CONNECT_TIMEOUT_SEC 15

// Safety threshold example.
// Change this based on your actual circuit/load rating.
// Can be dynamically enabled/disabled and configured via MQTT topic voltwise/<uid>/safety/set.
bool safetyCutoffEnabled = true;
float maxAllowedPowerWatts = 3000.0;

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

// =========================
// Network Configuration
// =========================

// Topics are dynamically constructed from the device UID (loaded from NVS or secrets.h).
String deviceUidStr;
String topicTelemetry;
String topicRelayState;
String topicRelaySet;
String topicSafetyState;
String topicSafetySet;
String topicCountdownState;
String topicCountdownSet;
String topicStatus;

void initTopics(const String &uid)
{
  deviceUidStr = uid;
  topicTelemetry = "voltwise/" + uid + "/telemetry";
  topicRelayState = "voltwise/" + uid + "/relay/state";
  topicRelaySet = "voltwise/" + uid + "/relay/set";
  topicSafetyState = "voltwise/" + uid + "/safety/state";
  topicSafetySet = "voltwise/" + uid + "/safety/set";
  topicCountdownState = "voltwise/" + uid + "/countdown/state";
  topicCountdownSet = "voltwise/" + uid + "/countdown/set";
  topicStatus = "voltwise/" + uid + "/status";
}

// Wi-Fi Connection Attempt Configuration
// State 1: Stored credentials exist -> 3 attempts x at least 5 seconds = 15 seconds total before offline fallback.
const int MAX_WIFI_BOOT_ATTEMPTS = 3;
const unsigned long WIFI_BOOT_ATTEMPT_TIMEOUT_MS = 5000;    // 5 seconds per boot attempt
const unsigned long WIFI_OFFLINE_RETRY_INTERVAL_MS = 60000; // 60s quiet background retry in offline mode

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
// 1.3" 240x240 ST7789 TFT LCD Display Object (7-Pin Hardware SPI: SDA=19, SCL=18, DC=23, RST=4, CS=5)
// =========================

Adafruit_ST7789 tft = Adafruit_ST7789(&SPI, OLED_CS_PIN, OLED_DC_PIN, OLED_RST_PIN);
GFXcanvas16 *canvasPtr = nullptr;
bool oledAvailable = false;

// =========================
// Network Objects
// =========================

WiFiClientSecure secureClient;
PubSubClient mqtt(secureClient);

// =========================
// Data Structure
// =========================

struct PowerReadings
{
  float voltage;
  float current;
  float power;
  float energy;
  float frequency;
  float powerFactor;
};

PowerReadings latestReadings = {0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f};
bool latestReadingsValid = false;
unsigned long highLineJustActivatedTime = 0;

// =========================
// Function Prototypes
// =========================

void setupOled();
void showOledBootScreen();
void updateOledDisplay();

void setupRelays();
void applyRelays(bool on, const char *reason);
void applyLineRelay(const char *line, bool on, const char *reason);
void writeRelayPin(int pin, bool turnOn);
void tickStaggeredPowerActivation();
void checkSmartHybridBootPower();

PowerReadings readPowerSensor();
bool readingsAreValid(PowerReadings readings);
void printReadings(PowerReadings readings);
void handlePowerSafety(PowerReadings readings);
void printDiagnostics(PowerReadings readings);

void updateShutdownCountdown(PowerReadings readings);
void tickShutdownCountdown();

const char *getWifiStatusString(wl_status_t status);
const char *getRssiQuality(int rssi);
void maintainWifi();
void maintainTimeSync();
void maintainMqtt();
void onMqttMessage(char *topic, byte *payload, unsigned int length);
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
const char *relayReason = "boot"; // "boot" | "remote" | "overpower" | "countdown"

// Staggered power-up state for High Load Line (Pin 26)
bool highLinePendingOn = false;
unsigned long highLinePendingStartTime = 0;
const char *pendingHighLineReason = "";

// Smart Hybrid boot power state
bool bootPowerEnergized = false;
unsigned long bootStartTime = 0;

bool countdownActive = false;
bool powerShutDown = false; // latched until reboot or a remote ON command
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
bool offlineModeActive = false;
int wifiAttemptCount = 0;
unsigned long lastWifiAttempt = 0;

bool ntpStarted = false;
bool timeSynced = false;
unsigned long lastMqttAttempt = 0;
unsigned long mqttBackoffMs = MQTT_BACKOFF_MIN_MS;

// =========================
// Factory Reset / Setup Button Check
// =========================

void checkResetButton()
{
  static unsigned long buttonPressStart = 0;
  static bool buttonWasPressed = false;

  bool isPressed = (digitalRead(RESET_BUTTON_PIN) == LOW);

  if (isPressed)
  {
    if (!buttonWasPressed)
    {
      buttonWasPressed = true;
      buttonPressStart = millis();
    }
    else
    {
      if (millis() - buttonPressStart >= 3000)
      {
        Serial.println();
        Serial.println("==================================================");
        Serial.println(">>> FACTORY RESET TRIGGERED BY BOOT BUTTON <<<");
        Serial.println("  Clearing stored Wi-Fi credentials from NVS flash...");
        ConfigManager::clearConfig();
        Serial.println("  Starting Provisioning Hotspot...");
        ProvisioningServer::start();
        Serial.println("==================================================");
        buttonWasPressed = false;
        while (digitalRead(RESET_BUTTON_PIN) == LOW)
        {
          delay(10);
        }
      }
    }
  }
  else
  {
    buttonWasPressed = false;
  }
}

// =========================
// Main Setup
// =========================

void setup()
{
  // Disable software brownout detector to prevent ESP32 from resetting during
  // momentary mains voltage dips / inrush current from heavy loads (e.g. light bulbs, compressors).
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  Serial.begin(115200);

  // CRITICAL: Explicitly initialize HardwareSerial 2 for PZEM-004T at 9600 baud.
  // Global constructors execute before the Arduino ESP32 core clock & GPIO matrix setup,
  // which can leave Serial2 uninitialized or mapped to default pins.
  Serial2.begin(9600, SERIAL_8N1, PZEM_RX_PIN, PZEM_TX_PIN);

  // Initialize NVS storage
  ConfigManager::begin();

  pinMode(RESET_BUTTON_PIN, INPUT_PULLUP);

  setupRelays();
  setupOled();
  showOledBootScreen();

  // Smart Hybrid: Relays remain safely OFF at power-on to eliminate relay coil current draw
  // during ESP32 initialization and initial Wi-Fi RF power surge.
  // The system waits up to NETWORK_CONNECT_TIMEOUT_SEC for Wi-Fi. If Wi-Fi connects, power energizes.
  // If timeout expires without Wi-Fi, it autonomously falls back to energizing power anyway.
  bootStartTime = millis();
  bootPowerEnergized = false;

  esp_reset_reason_t rstReason = esp_reset_reason();
  Serial.println();
  Serial.println("==================================================");
  Serial.println("ESP32 + PZEM-004T + 2-Channel Relay Started");
  Serial.print("Boot Reset Reason: ");
  Serial.println((int)rstReason);
  if (rstReason == ESP_RST_BROWNOUT)
  {
    Serial.println(" [NOTICE] Recovered from a BROWNOUT reset (inrush voltage drop).");
    Serial.println(" Brownout protection disabled in firmware to absorb load inrush.");
  }
  Serial.println("==================================================");
  Serial.println("Relay mapping: Pin 25 = Low Power Line, Pin 26 = High Power Line");
  Serial.print  ("Smart Hybrid Active: Relays held OFF. Waiting up to ");
  Serial.print  (NETWORK_CONNECT_TIMEOUT_SEC);
  Serial.println("s for Wi-Fi before autonomous power-up.");

  String uid = ConfigManager::getDeviceUid();
  initTopics(uid);
  Serial.print("Device UID loaded: ");
  Serial.println(uid);

  String ssid = ConfigManager::getWifiSsid();
  if (ssid.length() == 0)
  {
    Serial.println();
    Serial.println("==================================================");
    Serial.println(" [BOOT STATE 2: NO STORED WI-FI CREDENTIALS]");
    Serial.println(" No credentials in flash. Directing to Provisioning...");
    Serial.println(" Hotspot AP active: Connect to VoltWise-Setup-xxxx");
    Serial.println(" Open http://192.168.4.1/ in browser to configure.");
    Serial.println("==================================================");
    ProvisioningServer::start();
  }
  else
  {
    Serial.println();
    Serial.println("==================================================");
    Serial.println(" [BOOT STATE 1: STORED WI-FI CREDENTIALS FOUND]");
    Serial.print  (" Stored SSID: \"");
    Serial.print  (ssid);
    Serial.println("\"");
    Serial.println(" Connection budget: 3 attempts x 5s = 15s total.");
    Serial.println(" Fallback: Autonomous offline mode + Provisioning Hotspot if all 3 fail.");
    Serial.println("==================================================");
    WiFi.mode(WIFI_STA);
    // Cap Wi-Fi TX power to 15dBm to eliminate RF current spikes from overloading HLK-PM01 (600mA)
    WiFi.setTxPower(WIFI_POWER_15dBm);
  }

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

void loop()
{
  // Check for physical setup trigger (hold BOOT / GPIO 0 for 3 seconds)
  checkResetButton();

  // If provisioning AP is active, handle HTTP & DNS client requests
  if (ProvisioningServer::active())
  {
    ProvisioningServer::handleClient();
  }

  static unsigned long lastSensorReadTime = 0;

  unsigned long currentTime = millis();

  if (currentTime - lastSensorReadTime >= SENSOR_READ_INTERVAL_MS)
  {
    lastSensorReadTime = currentTime;

    // Retry a few times before giving up — a single dropped Modbus frame
    // shouldn't be reported as a hard failure.
    PowerReadings readings;
    bool valid = false;
    for (int attempt = 1; attempt <= SENSOR_READ_RETRIES; attempt++)
    {
      if (ProvisioningServer::active())
      {
        ProvisioningServer::handleClient();
      }
      readings = readPowerSensor();
      if (readingsAreValid(readings))
      {
        valid = true;
        break;
      }
      if (DIAGNOSTIC_MODE)
      {
        Serial.print("Read attempt ");
        Serial.print(attempt);
        Serial.println(" failed (NaN). Retrying...");
      }
    }

    if (valid)
    {
      latestReadings = readings;
      latestReadingsValid = true;
      printReadings(readings);
      publishTelemetry(readings);
      handlePowerSafety(readings);
      updateShutdownCountdown(readings);
    }
    else
    {
      latestReadingsValid = false;
      Serial.println("Sensor reading failed. Check PZEM wiring, AC input, RX/TX, and GND.");
      if (DIAGNOSTIC_MODE)
      {
        printDiagnostics(readings);
      }
      // CRITICAL: Even if the PZEM sensor has no AC mains voltage connected (e.g. testing on USB),
      // we still publish baseline telemetry so the backend and mobile app recognize the device
      // as LIVE and ONLINE rather than displaying "Device offline".
      PowerReadings zeroReadings = {0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f};
      latestReadings = zeroReadings;
      publishTelemetry(zeroReadings);
    }

    Serial.println("----------------------------------");
  }

  // Smart Hybrid: checks if Wi-Fi connected or 15s timeout reached to energize power
  checkSmartHybridBootPower();

  // Non-blocking staggered relay power activation for High Load Line (Pin 26)
  tickStaggeredPowerActivation();

  // Runs every loop pass (not just on sensor reads) so the countdown prints
  // once per second and the cutoff fires on time.
  tickShutdownCountdown();

  // Network upkeep is fully non-blocking: the sensor loop, safety cutoff, and
  // countdown all keep running while WiFi/MQTT are down.
  maintainWifi();
  maintainTimeSync();
  maintainMqtt();

  // Refresh the 7-pin SPI OLED display (connecting / staggered countdown / live dashboard)
  updateOledDisplay();

  if (ProvisioningServer::active())
  {
    ProvisioningServer::handleClient();
  }
}

// =========================
// Relay Functions
// =========================

// Drives a relay pin ON or OFF.
// Active-LOW relay modules connected to 3.3V ESP32 GPIOs leak current through the 5V
// optocoupler/LED circuit when driven HIGH (5V - 3.3V = 1.7V), causing the LED to stay
// dimly lit ("low light"). Setting the pin to INPUT (High-Impedance / tri-state) mode
// completely cuts the path to ground, reducing current to 0 and turning the LED 100% OFF.
void writeRelayPin(int pin, bool turnOn)
{
  if (turnOn && pin == RELAY_HIGH_PIN)
  {
    // Temporarily throttle Wi-Fi TX power (~100mA current reduction) during contact closure
    // so cold filament inrush / contact bounce does not starve the 5V power supply rail
    WiFi.setTxPower(WIFI_POWER_8_5dBm);
  }

  if (RELAY_ACTIVE_LOW)
  {
    if (turnOn)
    {
      pinMode(pin, OUTPUT);
      digitalWrite(pin, LOW);
    }
    else
    {
      digitalWrite(pin, HIGH);
      pinMode(pin, INPUT); // High-Z: completely cuts off any leakage current
    }
  }
  else
  {
    pinMode(pin, OUTPUT);
    digitalWrite(pin, turnOn ? HIGH : LOW);
  }

  if (turnOn && pin == RELAY_HIGH_PIN)
  {
    // Allow contact bounce and cold-filament/capacitive inrush to settle before restoring RF power
    delay(50);
    WiFi.setTxPower(WIFI_POWER_15dBm);
  }
}

void setupRelays()
{
  highLinePendingOn = false;
  writeRelayPin(RELAY_LOW_PIN, false);
  writeRelayPin(RELAY_HIGH_PIN, false);
}

// Single choke point for relay changes: drives the pins, records the state +
// reason, and publishes the retained relay/state topic. Idempotent, so a QoS 1
// redelivery of the same command is harmless.
// Implements staggered power-up via INTERVAL_TIME macro (in seconds).
void applyRelays(bool on, const char *reason)
{
  if (on)
  {
    // 1. Immediately energize Low Load Line (Pin 25)
    writeRelayPin(RELAY_LOW_PIN, true);
    lowLineOn = true;

#if INTERVAL_TIME > 0
    // 2. Schedule High Load Line (Pin 26) after INTERVAL_TIME seconds
    writeRelayPin(RELAY_HIGH_PIN, false);
    highLineOn = false;
    highLinePendingOn = true;
    highLinePendingStartTime = millis();
    pendingHighLineReason = reason;

    relaysAreOn = true;
    relayReason = reason;

    Serial.println("----------------------------------");
    Serial.print("Low Load Line (Pin 25) turned ON (Reason: ");
    Serial.print(reason);
    Serial.println(").");
    Serial.print("Staggering power: High Load Line (Pin 26) will turn ON in ");
    Serial.print(INTERVAL_TIME);
    Serial.println(" seconds to mitigate inrush current.");
    Serial.println("----------------------------------");
#else
    // If INTERVAL_TIME is 0, energize both immediately
    highLinePendingOn = false;
    writeRelayPin(RELAY_HIGH_PIN, true);
    highLineOn = true;
    relaysAreOn = true;
    relayReason = reason;

    Serial.println("----------------------------------");
    Serial.print("All relays (Low Line Pin 25 & High Line Pin 26) turned ON (Reason: ");
    Serial.print(reason);
    Serial.println(").");
    Serial.println("----------------------------------");
#endif
  }
  else
  {
    // Cut all power: cancel any pending staggered activation
    highLinePendingOn = false;
    // Sequential turn-off (50ms gap) prevents simultaneous dual-coil back-EMF spike on the 5V rail
    writeRelayPin(RELAY_HIGH_PIN, false);
    delay(50);
    writeRelayPin(RELAY_LOW_PIN, false);

    relaysAreOn = false;
    highLineOn = false;
    lowLineOn = false;
    relayReason = reason;

    Serial.println("----------------------------------");
    Serial.print("All relays (High Line Pin 26, then Low Line Pin 25) turned OFF (Reason: ");
    Serial.print(reason);
    Serial.println(").");
    Serial.println("----------------------------------");
  }

  publishRelayState();
}

void applyLineRelay(const char *line, bool on, const char *reason)
{
  if (strcmp(line, "high") == 0)
  {
    highLinePendingOn = false; // Explicit manual/remote command overrides any pending auto-stagger
    writeRelayPin(RELAY_HIGH_PIN, on);
    highLineOn = on;
    Serial.print("High Voltage Line (Pin 26) turned ");
    Serial.println(on ? "ON" : "OFF");
  }
  else if (strcmp(line, "low") == 0)
  {
    writeRelayPin(RELAY_LOW_PIN, on);
    lowLineOn = on;
    Serial.print("Low Voltage Line (Pin 25) turned ");
    Serial.println(on ? "ON" : "OFF");
  }

  relaysAreOn = highLineOn || lowLineOn;
  relayReason = reason;

  publishRelayState();
}

// Non-blocking timer handler for staggered activation of the High Load Line (Pin 26).
// Called on every loop() pass.
void tickStaggeredPowerActivation()
{
#if INTERVAL_TIME > 0
  if (!highLinePendingOn)
  {
    return;
  }

  if (millis() - highLinePendingStartTime >= (unsigned long)(INTERVAL_TIME * 1000UL))
  {
    highLinePendingOn = false;
    writeRelayPin(RELAY_HIGH_PIN, true);
    highLineOn = true;
    relaysAreOn = true;
    highLineJustActivatedTime = millis();

    Serial.println();
    Serial.println("==================================================");
    Serial.print(" [STAGGERED POWER] ");
    Serial.print(INTERVAL_TIME);
    Serial.println("s Interval Elapsed!");
    Serial.print(" High Load Line (Pin 26) turned ON. Reason: ");
    Serial.println(pendingHighLineReason);
    Serial.println(" Both lines (Pin 25 & 26) are now fully ENERGIZED.");
    Serial.println("==================================================");
    Serial.println();

    publishRelayState();
  }
#endif
}

// Smart Hybrid Boot Power Handler:
// State 1: Stored Wi-Fi credentials exist -> Attempts connection for up to 15s (3 attempts x 5s).
//   - If Wi-Fi connects, energizes power immediately (Pin 25, then Pin 26 after 3s).
//   - If all 3 attempts fail / 15s timeout reached, poof! Fallback to Autonomous Offline Mode.
// State 2: No Wi-Fi credentials stored -> In Provisioning Mode. Relays stay OFF until set up.
void checkSmartHybridBootPower()
{
  if (bootPowerEnergized)
  {
    return;
  }

  // State 1 - Case A: Wi-Fi connected successfully!
  if (WiFi.status() == WL_CONNECTED)
  {
    bootPowerEnergized = true;
    Serial.println();
    Serial.println("==================================================");
    Serial.println(" [BOOT] Wi-Fi Connected! Energizing Power Lines (Staggered)...");
    Serial.println("==================================================");
    applyRelays(true, "network_connected");
    return;
  }

  // State 1 - Case B / State 2: 15s Timeout / failed attempts reached -> "poof offline mode fallback"
  // Ensures appliances/house and sensing circuits are energized even if Wi-Fi credentials are not yet entered.
  if (offlineModeActive || (millis() - bootStartTime >= (unsigned long)(NETWORK_CONNECT_TIMEOUT_SEC * 1000UL)))
  {
    bootPowerEnergized = true;
    offlineModeActive = true;
    wifiConnecting = false;
    WiFi.disconnect(true); // Halt all STA station channel-hopping sweeps immediately
    Serial.println();
    Serial.println("==================================================");
    Serial.println(" [BOOT] 15s Elapsed without Wi-Fi.");
    Serial.println(" Poof! Entering Autonomous Offline Mode (Staggered Power-Up).");
    Serial.println(" Starting Provisioning Hotspot so you can access the portal...");
    Serial.println("==================================================");
    applyRelays(true, "offline_fallback");
    if (!ProvisioningServer::active())
    {
      ProvisioningServer::start();
    }
    return;
  }
}

// =========================
// PZEM Sensor Functions
// =========================

// Parasitic Load Tare & Deadband Configuration:
// The ESP32 (Wi-Fi + MCU dual core + ST7789 LCD + relay coils) consumes ~3.7W from the mains supply.
// If the CT is clamped before the ESP32 power tap, zero-clamp idle draws and subtract the parasitic baseline.
const float IOT_PARASITIC_OFFSET_WATTS = 3.7f;
const float IDLE_CUTOFF_WATTS          = 4.5f;

PowerReadings readPowerSensor()
{
  PowerReadings readings;

  readings.voltage = pzem.voltage();

  // If voltage is NaN, the PZEM is not replying or has no AC input.
  // Return immediately to avoid 5 additional blocking 100ms timeouts on current, power, etc.
  if (isnan(readings.voltage))
  {
    readings.current = NAN;
    readings.power = NAN;
    readings.energy = NAN;
    readings.frequency = NAN;
    readings.powerFactor = NAN;
    return readings;
  }

  float rawCurrent = pzem.current();
  float rawPower = pzem.power();

  if (!isnan(rawPower))
  {
    if (rawPower <= IDLE_CUTOFF_WATTS)
    {
      // Clamp idle noise and IoT self-consumption to 0
      readings.power = 0.0f;
      readings.current = 0.0f;
    }
    else
    {
      // Subtract parasitic baseline so actual appliance wattage is accurate
      readings.power = rawPower - IOT_PARASITIC_OFFSET_WATTS;
      float v = (readings.voltage > 0.0f) ? readings.voltage : 230.0f;
      float currentOffset = IOT_PARASITIC_OFFSET_WATTS / v;
      readings.current = max(0.0f, rawCurrent - currentOffset);
    }
  }
  else
  {
    readings.power = NAN;
    readings.current = NAN;
  }

  readings.energy = pzem.energy();
  readings.frequency = pzem.frequency();
  readings.powerFactor = pzem.pf();

  return readings;
}

bool readingsAreValid(PowerReadings readings)
{
  if (isnan(readings.voltage))
  {
    return false;
  }

  if (isnan(readings.current))
  {
    return false;
  }

  if (isnan(readings.power))
  {
    return false;
  }

  if (isnan(readings.energy))
  {
    return false;
  }

  if (isnan(readings.frequency))
  {
    return false;
  }

  if (isnan(readings.powerFactor))
  {
    return false;
  }

  return true;
}

void printReadings(PowerReadings readings)
{
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
void printDiagnostics(PowerReadings readings)
{
  Serial.println(">>> DIAGNOSTICS <<<");

  uint8_t address = pzem.readAddress();
  Serial.print("PZEM slave address: 0x");
  Serial.println(address, HEX);
  Serial.println("  (default is 0xF8. 0x00/0xFF usually means no UART reply.)");

  Serial.print("  voltage     = ");
  Serial.println(readings.voltage);
  Serial.print("  current     = ");
  Serial.println(readings.current);
  Serial.print("  power       = ");
  Serial.println(readings.power);
  Serial.print("  energy      = ");
  Serial.println(readings.energy, 3);
  Serial.print("  frequency   = ");
  Serial.println(readings.frequency);
  Serial.print("  powerFactor = ");
  Serial.println(readings.powerFactor);

  if (address == 0x00 || address == 0xFF)
  {
    Serial.println("HINT: No UART reply. Check TX<->RX crossover, converter HV/LV/GND power, and baud (should be 9600).");
  }
  else
  {
    Serial.println("HINT: UART link OK. NaN fields mean the PZEM has no AC power -> check live mains on the voltage terminals.");
  }
}

// =========================
// Safety / Control Logic
// =========================

void handlePowerSafety(PowerReadings readings)
{
  // If safety cutoff is toggled OFF by the user, do not trip
  if (!safetyCutoffEnabled)
  {
    return;
  }

  static int overpowerConsecutiveReads = 0;

  if (readings.power > maxAllowedPowerWatts)
  {
    overpowerConsecutiveReads++;
    // Inrush surge tolerance: require 2 consecutive reads (> 2-4 seconds) to trigger cutoff
    if (overpowerConsecutiveReads >= 2)
    {
      Serial.println("WARNING: Power sustained above threshold!");
      Serial.println("Turning all relays OFF for safety.");

      // Latch so nothing re-enables power automatically. A remote ON command
      // can clear the latch, but if the load is still over the limit this
      // safety simply fires again on the next reading.
      powerShutDown = true;
      countdownActive = false;
      applyRelays(false, "overpower");
    }
  }
  else
  {
    overpowerConsecutiveReads = 0;
  }
}

// =========================
// Shutdown Countdown
// =========================

// Called once per sensor read: starts the countdown when current appears,
// cancels it if the current disappears before time runs out.
// Dynamically enabled/disabled and configured via MQTT countdown/set.
void updateShutdownCountdown(PowerReadings readings)
{
  if (!shutdownCountdownEnabled)
  {
    if (countdownActive)
    {
      countdownActive = false;
      Serial.println("Shutdown countdown disabled. Active countdown cancelled.");
    }
    return;
  }

  if (powerShutDown)
  {
    return;
  }

  bool currentDetected = readings.current >= currentDetectThresholdAmps;

  // After a remote ON, don't re-arm the countdown until the current has
  // dropped below the threshold once — see the remoteOverride comment above.
  if (remoteOverride)
  {
    if (!currentDetected)
    {
      remoteOverride = false;
      Serial.println("Current dropped below threshold. Remote override cleared; auto-shutdown re-armed.");
    }
    return;
  }

  if (currentDetected && !countdownActive)
  {
    countdownActive = true;
    countdownEndTime = millis() + shutdownCountdownSeconds * 1000UL;
    lastPrintedSecond = -1;

    Serial.print("Current detected (");
    Serial.print(readings.current);
    Serial.print(" A). Power will shut down in ");
    Serial.print(shutdownCountdownSeconds);
    Serial.println(" seconds!");
  }
  else if (!currentDetected && countdownActive)
  {
    countdownActive = false;
    Serial.println("Current no longer detected. Shutdown countdown cancelled.");
  }
}

// Called every loop pass: prints the remaining seconds once per second and
// cuts the relays when the countdown reaches zero.
void tickShutdownCountdown()
{
  if (!shutdownCountdownEnabled || !countdownActive)
  {
    return;
  }

  long remainingMs = (long)(countdownEndTime - millis());

  if (remainingMs <= 0)
  {
    countdownActive = false;
    powerShutDown = true;

    Serial.println("Countdown finished. SHUTTING DOWN POWER!");
    applyRelays(false, "countdown");
    return;
  }

  long remainingSeconds = (remainingMs + 999) / 1000; // round up

  if (remainingSeconds != lastPrintedSecond)
  {
    lastPrintedSecond = remainingSeconds;
    Serial.print("Shutting down power in ");
    Serial.print(remainingSeconds);
    Serial.println(" s...");
  }
}

// =========================
// WiFi / Time / MQTT
// =========================

const char *getWifiStatusString(wl_status_t status)
{
  switch (status)
  {
  case WL_IDLE_STATUS:
    return "IDLE (Changing state)";
  case WL_NO_SSID_AVAIL:
    return "SSID NOT FOUND (Network unavailable)";
  case WL_SCAN_COMPLETED:
    return "SCAN COMPLETED";
  case WL_CONNECTED:
    return "CONNECTED";
  case WL_CONNECT_FAILED:
    return "CONNECT FAILED (Invalid password or rejected)";
  case WL_CONNECTION_LOST:
    return "CONNECTION LOST";
  case WL_DISCONNECTED:
    return "DISCONNECTED";
  default:
    return "UNKNOWN";
  }
}

const char *getRssiQuality(int rssi)
{
  if (rssi >= -55)
    return "Excellent";
  if (rssi >= -67)
    return "Very Good";
  if (rssi >= -75)
    return "Good";
  if (rssi >= -85)
    return "Fair";
  return "Weak";
}

void maintainWifi()
{
  String currentSsid = ConfigManager::getWifiSsid();
  String currentPassword = ConfigManager::getWifiPassword();

  if (currentSsid.length() == 0)
  {
    if (!ProvisioningServer::active())
    {
      ProvisioningServer::start();
    }
    return;
  }

  wl_status_t status = WiFi.status();

  static unsigned long wifiDisconnectGraceStart = 0;

  if (status == WL_CONNECTED)
  {
    wifiDisconnectGraceStart = 0;

    if (ProvisioningServer::active())
    {
      ProvisioningServer::stop();
    }

    if (!wifiWasConnected)
    {
      wifiWasConnected = true;
      wifiConnecting = false;
      wifiAttemptCount = 0;

      int rssi = WiFi.RSSI();
      Serial.println();
      Serial.println("==================================================");
      Serial.println(" >>> WiFi CONNECTED SUCCESSFULLY! <<<");
      Serial.println("==================================================");
      Serial.print("  SSID:        ");
      Serial.println(WiFi.SSID());
      Serial.print("  IP Address:  ");
      Serial.println(WiFi.localIP());
      Serial.print("  Subnet Mask: ");
      Serial.println(WiFi.subnetMask());
      Serial.print("  Gateway IP:  ");
      Serial.println(WiFi.gatewayIP());
      Serial.print("  Signal:      ");
      Serial.print(rssi);
      Serial.print(" dBm (");
      Serial.print(getRssiQuality(rssi));
      Serial.println(")");
      Serial.print("  MAC Address: ");
      Serial.println(WiFi.macAddress());
      Serial.println("==================================================");
      Serial.println();
    }
    return;
  }

  // Detect WiFi disconnection with a 6-second debounce grace period
  // to absorb momentary RF noise or inrush current transients without dropping offline
  if (wifiWasConnected)
  {
    if (wifiDisconnectGraceStart == 0)
    {
      wifiDisconnectGraceStart = millis();
      Serial.println();
      Serial.println(" [WIFI] Momentary signal interruption detected.");
      Serial.println("  Allowing 6s grace period to recover from inrush/EMI before offline fallback...");
      return;
    }

    if (millis() - wifiDisconnectGraceStart < 6000UL)
    {
      // Still within grace period: let background station stack auto-reconnect
      return;
    }

    // Truly disconnected after 6 continuous seconds:
    wifiDisconnectGraceStart = 0;
    wifiWasConnected = false;
    wifiConnecting = false;
    WiFi.disconnect(true); // Halt all STA station channel-hopping sweeps immediately
    lastWifiAttempt = millis();

    Serial.println();
    Serial.println("==================================================");
    Serial.println(" !!! WiFi CONNECTION LOST! !!!");
    Serial.println("  Appliances remain continuously powered.");
    Serial.println("  Entering offline fallback: Starting Provisioning Hotspot...");
    Serial.println("==================================================");
    Serial.println();
    offlineModeActive = true;
    if (!ProvisioningServer::active())
    {
      ProvisioningServer::start();
    }
  }

  unsigned long now = millis();

  // Handle active connection attempt timeout or explicit failure
  if (wifiConnecting)
  {
    bool timedOut = (now - lastWifiAttempt >= WIFI_BOOT_ATTEMPT_TIMEOUT_MS);
    bool explicitFail = (status == WL_CONNECT_FAILED || status == WL_NO_SSID_AVAIL);

    if (timedOut || explicitFail)
    {
      wifiConnecting = false;

      Serial.println();
      Serial.println("--------------------------------------------------");
      Serial.print(" [WIFI] Attempt #");
      Serial.print(wifiAttemptCount);
      Serial.print(" of ");
      Serial.print(MAX_WIFI_BOOT_ATTEMPTS);
      Serial.print(" failed (Status: ");
      Serial.print(getWifiStatusString(status));
      Serial.println(").");
      Serial.println("--------------------------------------------------");

      // State 1: If we have not reached 3 attempts yet, immediately start next attempt
      if (wifiAttemptCount < MAX_WIFI_BOOT_ATTEMPTS && !offlineModeActive)
      {
        wifiAttemptCount++;
        lastWifiAttempt = now;
        wifiConnecting = true;

        Serial.println();
        Serial.println("==================================================");
        Serial.print(" >>> Starting Wi-Fi Attempt #");
        Serial.print(wifiAttemptCount);
        Serial.print(" of ");
        Serial.print(MAX_WIFI_BOOT_ATTEMPTS);
        Serial.println(" (duration: 5s)... <<<");
        Serial.println("==================================================");

        WiFi.disconnect();
        WiFi.setTxPower(WIFI_POWER_15dBm);
        WiFi.begin(currentSsid.c_str(), currentPassword.c_str());
        return;
      }
      else
      {
        // 3 attempts have failed (15s total)! "poof offline mode fallback"
        wifiConnecting = false;
        WiFi.disconnect(true); // Halt all STA station channel-hopping sweeps immediately
        if (!offlineModeActive)
        {
          offlineModeActive = true;
          Serial.println();
          Serial.println("==================================================");
          Serial.print(" [OFFLINE FALLBACK] All ");
          Serial.print(MAX_WIFI_BOOT_ATTEMPTS);
          Serial.println(" attempts failed (15s total).");
          Serial.println(" Poof! Entering Autonomous Offline Mode.");
          Serial.println(" Energizing power lines now (Low Line, then High Line after 3s).");
          Serial.println(" Starting Provisioning Hotspot so you can access the portal...");
          Serial.println("==================================================");

          if (!bootPowerEnergized)
          {
            bootPowerEnergized = true;
            applyRelays(true, "offline_fallback");
          }

          if (!ProvisioningServer::active())
          {
            ProvisioningServer::start();
          }
        }

        lastWifiAttempt = now;
        return;
      }
    }

    return;
  }

  // --- OFFLINE MODE: BACKGROUND RETRY ---
  if (offlineModeActive)
  {
    // If the provisioning portal is running, keep AP solid and undisturbed
    if (ProvisioningServer::active())
    {
      return;
    }

    if (lastWifiAttempt != 0 && (now - lastWifiAttempt < WIFI_OFFLINE_RETRY_INTERVAL_MS))
    {
      return;
    }

    lastWifiAttempt = now;
    wifiConnecting = true;
    Serial.println();
    Serial.println("[OFFLINE MODE] Attempting quiet background Wi-Fi reconnect...");
    WiFi.setTxPower(WIFI_POWER_15dBm);
    WiFi.begin(currentSsid.c_str(), currentPassword.c_str());
    return;
  }

  // --- INITIAL FIRST ATTEMPT (Attempt #1 of 3) ---
  lastWifiAttempt = now;
  wifiConnecting = true;
  wifiAttemptCount = 1;

  Serial.println();
  Serial.println("==================================================");
  Serial.print(" >>> Starting Wi-Fi Attempt #1 of ");
  Serial.print(MAX_WIFI_BOOT_ATTEMPTS);
  Serial.println(" (duration: 5s)... <<<");
  Serial.println("==================================================");

  WiFi.setTxPower(WIFI_POWER_15dBm);
  WiFi.begin(currentSsid.c_str(), currentPassword.c_str());
}

void maintainTimeSync()
{
  if (timeSynced || WiFi.status() != WL_CONNECTED)
  {
    return;
  }

  static unsigned long ntpStartTime = 0;
  if (!ntpStarted)
  {
    ntpStarted = true;
    ntpStartTime = millis();
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    Serial.println("Syncing clock via NTP (required for TLS)...");
  }

  if (time(nullptr) > MIN_VALID_EPOCH)
  {
    timeSynced = true;
    Serial.println("Clock synced via NTP. TLS connections are now possible.");
    return;
  }

  // Fallback: If NTP takes more than 8 seconds (e.g. UDP port 123 blocked by router/hotspot),
  // set a known valid epoch time so TLS certificate validation succeeds and MQTT can connect.
  if (millis() - ntpStartTime > 8000)
  {
    timeSynced = true;
    struct timeval tv;
    tv.tv_sec = 1715000000; // May 2024 (well within ISRG Root X1 cert validity 2015-2035)
    tv.tv_usec = 0;
    settimeofday(&tv, NULL);
    Serial.println("NTP response delayed; applied fallback clock epoch for TLS.");
  }
}

void maintainMqtt()
{
  if (WiFi.status() != WL_CONNECTED || !timeSynced)
  {
    return;
  }

  unsigned long now = millis();

  if (mqtt.connected())
  {
    mqtt.loop();

    // Re-assert online status heartbeat every 15 seconds to ensure backend & app know device is live
    static unsigned long lastStatusHeartbeat = 0;
    if (now - lastStatusHeartbeat >= 15000)
    {
      lastStatusHeartbeat = now;
      mqtt.publish(topicStatus.c_str(), "online", true);
    }
    return;
  }

  if (lastMqttAttempt != 0 && now - lastMqttAttempt < mqttBackoffMs)
  {
    return;
  }
  lastMqttAttempt = now;

  Serial.println();
  Serial.println("==================================================");
  Serial.print(" [MQTT] Connecting to broker ");
  Serial.print(MQTT_HOST);
  Serial.println("...");
  Serial.println("==================================================");

  // LWT: the broker publishes retained "offline" on our status topic if this
  // client vanishes without a clean disconnect.
  bool connected = mqtt.connect(
      deviceUidStr.c_str(),
      MQTT_USERNAME,
      MQTT_PASSWORD,
      topicStatus.c_str(),
      1,    // willQoS
      true, // willRetain
      "offline");

  if (connected)
  {
    mqttBackoffMs = MQTT_BACKOFF_MIN_MS;
    Serial.println();
    Serial.println("==================================================");
    Serial.println(" >>> MQTT BROKER CONNECTED SUCCESSFULLY! <<<");
    Serial.print("  Device UID: ");
    Serial.println(deviceUidStr);
    Serial.print("  Host:       ");
    Serial.println(MQTT_HOST);
    Serial.println("==================================================");

    // Publish online status (retained) so backend & app discover the device
    bool pubStatus = mqtt.publish(topicStatus.c_str(), "online", true);
    Serial.print("[MQTT] Published 'online' status: ");
    Serial.println(pubStatus ? "SUCCESS" : "FAILED");

    // Publish current relay state (retained) so app immediately knows lines are ON
    publishRelayState();

    // Publish current safety cutoff configuration (retained)
    publishSafetyState();

    // Publish current countdown configuration (retained)
    publishCountdownState();

    // Subscribe to remote relay control commands
    mqtt.subscribe(topicRelaySet.c_str(), 1);
    Serial.print("[MQTT] Subscribed to command topic: ");
    Serial.println(topicRelaySet);

    // Subscribe to safety cutoff control commands
    mqtt.subscribe(topicSafetySet.c_str(), 1);
    Serial.print("[MQTT] Subscribed to safety topic: ");
    Serial.println(topicSafetySet);

    // Subscribe to countdown control commands
    mqtt.subscribe(topicCountdownSet.c_str(), 1);
    Serial.print("[MQTT] Subscribed to countdown topic: ");
    Serial.println(topicCountdownSet);
    Serial.println();
  }
  else
  {
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
void onMqttMessage(char *topic, byte *payload, unsigned int length)
{
  if (strcmp(topic, topicCountdownSet.c_str()) == 0)
  {
    JsonDocument doc;
    DeserializationError parseError = deserializeJson(doc, payload, length);
    if (!parseError && doc["enabled"].is<bool>())
    {
      shutdownCountdownEnabled = doc["enabled"].as<bool>();
      if (doc["seconds"].is<unsigned long>())
      {
        shutdownCountdownSeconds = doc["seconds"].as<unsigned long>();
      }
      if (!shutdownCountdownEnabled)
      {
        countdownActive = false;
      }
      Serial.println();
      Serial.println("==================================================");
      Serial.print(" [MQTT] Shutdown Countdown Config Updated: ");
      Serial.println(shutdownCountdownEnabled ? "ENABLED" : "DISABLED");
      Serial.print("  Countdown Seconds: ");
      Serial.println(shutdownCountdownSeconds);
      Serial.println("==================================================");

      publishCountdownState();
    }
    else
    {
      Serial.println("Ignoring malformed countdown config command.");
    }
    return;
  }

  if (strcmp(topic, topicSafetySet.c_str()) == 0)
  {
    JsonDocument doc;
    DeserializationError parseError = deserializeJson(doc, payload, length);
    if (!parseError && doc["enabled"].is<bool>())
    {
      safetyCutoffEnabled = doc["enabled"].as<bool>();
      if (doc["thresholdWatts"].is<float>())
      {
        maxAllowedPowerWatts = doc["thresholdWatts"].as<float>();
      }
      if (doc["countdownEnabled"].is<bool>())
      {
        shutdownCountdownEnabled = doc["countdownEnabled"].as<bool>();
        if (doc["countdownSeconds"].is<unsigned long>())
        {
          shutdownCountdownSeconds = doc["countdownSeconds"].as<unsigned long>();
        }
        if (!shutdownCountdownEnabled)
        {
          countdownActive = false;
        }
        publishCountdownState();
      }
      Serial.println();
      Serial.println("==================================================");
      Serial.print(" [MQTT] Safety Cutoff Config Updated: ");
      Serial.println(safetyCutoffEnabled ? "ENABLED" : "DISABLED");
      Serial.print("  Threshold Watts: ");
      Serial.println(maxAllowedPowerWatts);
      Serial.println("==================================================");

      publishSafetyState();
    }
    else
    {
      Serial.println("Ignoring malformed safety config command.");
    }
    return;
  }

  if (strcmp(topic, topicRelaySet.c_str()) != 0)
  {
    return;
  }

  JsonDocument doc;
  DeserializationError parseError = deserializeJson(doc, payload, length);
  if (parseError || !doc["on"].is<bool>())
  {
    Serial.println("Ignoring malformed relay command.");
    return;
  }

  bool turnOn = doc["on"].as<bool>();
  const char *line = doc["line"] | "all";

  Serial.println();
  Serial.println("==================================================");
  Serial.print(" [MQTT] Remote Relay Command: ");
  Serial.print(turnOn ? "TURN ON" : "TURN OFF");
  Serial.print(" | Target Line: ");
  Serial.println(line);
  Serial.println("==================================================");

  if (turnOn)
  {
    // The user explicitly wants power back: clear the shutdown latch and stop
    // the countdown from instantly re-cutting it (see remoteOverride).
    powerShutDown = false;
    countdownActive = false;
    remoteOverride = true;
  }
  else if (strcmp(line, "all") == 0)
  {
    // Cut all power: latch shutdown so auto-restart doesn't turn it back on
    powerShutDown = true;
    countdownActive = false;
  }

  if (strcmp(line, "high") == 0)
  {
    // High Load Voltage line -> Pin 26
    applyLineRelay("high", turnOn, "remote");
  }
  else if (strcmp(line, "low") == 0)
  {
    // Low Load Voltage line -> Pin 25
    applyLineRelay("low", turnOn, "remote");
  }
  else
  {
    // "all" or Cut all power -> both Pin 25 and Pin 26
    applyRelays(turnOn, "remote");
  }
}

// Timestamp of last telemetry publication in millis(), to compute interval delta kWh
static unsigned long lastTelemetryTimeMs = 0;

void publishTelemetry(PowerReadings readings)
{
  if (!mqtt.connected())
  {
    return;
  }

  unsigned long nowMs = millis();
  float elapsedHours = 0.0f;
  if (lastTelemetryTimeMs > 0 && nowMs > lastTelemetryTimeMs)
  {
    unsigned long elapsedMs = nowMs - lastTelemetryTimeMs;
    // Cap to 60 seconds if there was a long pause
    if (elapsedMs > 60000)
    {
      elapsedMs = SENSOR_READ_INTERVAL_MS;
    }
    elapsedHours = (float)elapsedMs / 3600000.0f;
  }
  else
  {
    elapsedHours = (float)SENSOR_READ_INTERVAL_MS / 3600000.0f;
  }
  lastTelemetryTimeMs = nowMs;

  float powerWatts = isnan(readings.power) ? 0.0f : readings.power;
  // Calculate interval energy (kWh) from active power: (Watts * elapsed hours) / 1000
  float deltaKwh = (powerWatts > 0.0f) ? (powerWatts * elapsedHours / 1000.0f) : 0.0f;

  JsonDocument doc;
  doc["voltage"] = isnan(readings.voltage) ? 0.0f : readings.voltage;
  doc["current"] = isnan(readings.current) ? 0.0f : readings.current;
  doc["watts"] = powerWatts;
  doc["kwh"] = deltaKwh;
  doc["totalKwh"] = isnan(readings.energy) ? 0.0f : readings.energy;
  doc["frequency"] = isnan(readings.frequency) ? 0.0f : readings.frequency;
  doc["powerFactor"] = isnan(readings.powerFactor) ? 0.0f : readings.powerFactor;
  doc["ms"] = nowMs;

  char buffer[256];
  size_t length = serializeJson(doc, buffer, sizeof(buffer));

  if (!mqtt.publish(topicTelemetry.c_str(), (const uint8_t *)buffer, length, false))
  {
    Serial.println("Telemetry publish failed (check MQTT buffer size / connection).");
  }
}

void publishRelayState()
{
  if (!mqtt.connected())
  {
    return;
  }

  JsonDocument doc;
  doc["on"] = relaysAreOn;
  doc["highOn"] = highLineOn;
  doc["lowOn"] = lowLineOn;
  doc["staggering"] = highLinePendingOn;
  doc["staggerSeconds"] = INTERVAL_TIME;
  doc["reason"] = relayReason;

  char buffer[160];
  size_t length = serializeJson(doc, buffer, sizeof(buffer));

  // Retained: subscribers get the current relay state immediately on connect.
  if (!mqtt.publish(topicRelayState.c_str(), (const uint8_t *)buffer, length, true))
  {
    Serial.println("Relay state publish failed (check MQTT buffer size / connection).");
  }
}

void publishSafetyState()
{
  if (!mqtt.connected())
  {
    return;
  }

  JsonDocument doc;
  doc["enabled"] = safetyCutoffEnabled;
  doc["thresholdWatts"] = maxAllowedPowerWatts;

  char buffer[128];
  size_t length = serializeJson(doc, buffer, sizeof(buffer));

  // Retained: subscribers get the safety cutoff state immediately on connect.
  if (!mqtt.publish(topicSafetyState.c_str(), (const uint8_t *)buffer, length, true))
  {
    Serial.println("Safety state publish failed (check MQTT buffer size / connection).");
  }
}

void publishCountdownState()
{
  if (!mqtt.connected())
  {
    return;
  }

  JsonDocument doc;
  doc["enabled"] = shutdownCountdownEnabled;
  doc["seconds"] = shutdownCountdownSeconds;

  char buffer[128];
  size_t length = serializeJson(doc, buffer, sizeof(buffer));

  // Retained: subscribers get the countdown state immediately on connect.
  if (!mqtt.publish(topicCountdownState.c_str(), (const uint8_t *)buffer, length, true))
  {
    Serial.println("Countdown state publish failed (check MQTT buffer size / connection).");
  }
}

// =========================
// 7-Pin 1.3" ST7789 TFT SPI LCD Display Functions
// =========================

// RGB565 Theme Palette for VoltWise
const uint16_t COLOR_BG      = 0x0863; // Deep Navy (#0F172A)
const uint16_t COLOR_CARD    = 0x1926; // Slate Card (#1E293B)
const uint16_t COLOR_BORDER  = 0x3269; // Border (#334155)
const uint16_t COLOR_CYAN    = 0x3DF8; // Electric Cyan (#38BDF8)
const uint16_t COLOR_GREEN   = 0x266B; // Emerald ON (#22C55E)
const uint16_t COLOR_AMBER   = 0xFD20; // Amber Warning (#F59E0B)
const uint16_t COLOR_RED     = 0xF800; // Danger Red (#EF4444)
const uint16_t COLOR_WHITE   = 0xFFFF; // Pure White
const uint16_t COLOR_MUTED   = 0x9CD3; // Muted Gray (#94A3B8)
const uint16_t COLOR_BLACK   = 0x0000;

void setupOled()
{
  // 1. Wait 150ms for the 3.3V power rail to stabilize
  delay(150);

  // 2. Route ESP32 Hardware SPI peripheral via GPIO matrix to your custom pins:
  //    SCK = GPIO 18 (SCL), MISO = -1 (unused), MOSI = GPIO 19 (SDA), SS = GPIO 5 (CS)
  SPI.begin(OLED_SCL_PIN, -1, OLED_SDA_PIN, OLED_CS_PIN);

  // 3. Initialize ST7789 IPS TFT LCD (240x320 hardware panel, 320x240 in landscape).
  //    We initialize SPI_MODE3 (default for ST7789 modules) or SPI_MODE0 (when CS pin is wired).
  tft.init(TFT_SCREEN_WIDTH, TFT_SCREEN_HEIGHT, SPI_MODE3);
  tft.setSPISpeed(20000000UL); // 20 MHz smooth frame transfers
  tft.setRotation(3); // Inverted landscape mode (180 deg flip from rotation 1)
  tft.setTextWrap(false);
  tft.fillScreen(COLOR_BG);

  oledAvailable = true;
  Serial.println("[TFT] ST7789 320x240 Landscape TFT LCD initialized (CS=5, DC=23, RST=4, SDA=19, SCL=18).");
}

void showOledBootScreen()
{
  if (!oledAvailable)
  {
    return;
  }

  tft.fillScreen(COLOR_BG);
  tft.drawRoundRect(6, 6, 308, 228, 12, COLOR_CYAN);
  tft.drawRoundRect(7, 7, 306, 226, 12, COLOR_CYAN);

  // Title
  tft.setTextColor(COLOR_CYAN, COLOR_BG);
  tft.setTextSize(3);
  tft.setCursor(88, 45);
  tft.print("VOLTWISE");

  // Subtitle
  tft.setTextColor(COLOR_WHITE, COLOR_BG);
  tft.setTextSize(2);
  tft.setCursor(88, 90);
  tft.print("Smart Energy");
  tft.setCursor(106, 114);
  tft.print("IoT Guard");

  // Progress Bar Outline
  tft.drawRoundRect(40, 190, 240, 18, 6, COLOR_WHITE);

  for (int step = 1; step <= 4; step++)
  {
    tft.setTextColor(COLOR_AMBER, COLOR_BG);
    tft.setTextSize(2);
    tft.setCursor(96, 156);
    tft.print("BOOTING");
    for (int d = 0; d < step; d++)
    {
      tft.print(".");
    }
    tft.print("   ");

    tft.fillRoundRect(42, 192, step * 59, 14, 4, COLOR_GREEN);
    delay(250);
  }
}

void updateOledDisplay()
{
  if (!oledAvailable)
  {
    return;
  }

  static unsigned long lastOledRefresh = 0;
  static int lastStage = -1;
  unsigned long now = millis();
  if (now - lastOledRefresh < 350)
  {
    return;
  }
  lastOledRefresh = now;

  // Determine which stage we are in:
  // 1 = Connecting Internet / Hotspot
  // 2 = Staggered Power Countdown (1st Line ON -> 3s wait -> 2nd Line)
  // 3 = 2nd Line Just Activated Banner (1.5s)
  // 4 = Live Electricity Telemetry Dashboard
  int currentStage = 4;
  if (!bootPowerEnergized)
  {
    currentStage = 1;
  }
  else if (highLinePendingOn)
  {
    currentStage = 2;
  }
  else if (highLineJustActivatedTime > 0 && (now - highLineJustActivatedTime < 1500UL))
  {
    currentStage = 3;
  }

  bool stageChanged = (currentStage != lastStage);
  lastStage = currentStage;

  // -----------------------------------------------------------------
  // STAGE 1: Connecting to Internet / Hotspot Setup (before boot power energizes)
  // -----------------------------------------------------------------
  if (currentStage == 1)
  {
    String storedSsid = ConfigManager::getWifiSsid();
    String apName = ProvisioningServer::getApSsid();

    if (stageChanged)
    {
      tft.fillScreen(COLOR_BG);
      // Header Banner
      tft.fillRect(0, 0, 320, 34, COLOR_CYAN);
      tft.setTextColor(COLOR_BLACK, COLOR_CYAN);
      tft.setTextSize(2);
      tft.setCursor(14, 9);
      tft.print("NETWORK SETUP");

      // Wi-Fi Status Card
      tft.fillRoundRect(8, 42, 304, 88, 8, COLOR_CARD);
      tft.drawRoundRect(8, 42, 304, 88, 8, COLOR_BORDER);

      // Hotspot Info Card
      tft.fillRoundRect(8, 138, 304, 92, 8, COLOR_CARD);
      tft.drawRoundRect(8, 138, 304, 92, 8, COLOR_CYAN);

      tft.setTextColor(COLOR_CYAN, COLOR_CARD);
      tft.setTextSize(1);
      tft.setCursor(18, 148);
      tft.print("HOTSPOT PORTAL (OPEN):");

      tft.setTextColor(COLOR_WHITE, COLOR_CARD);
      tft.setTextSize(2);
      tft.setCursor(18, 166);
      tft.print(apName.substring(0, 22));

      tft.setTextColor(COLOR_GREEN, COLOR_CARD);
      tft.setTextSize(2);
      tft.setCursor(18, 198);
      tft.print("IP: 192.168.4.1");
    }

    if (storedSsid.length() > 0)
    {
      tft.setTextColor(COLOR_MUTED, COLOR_CARD);
      tft.setTextSize(1);
      tft.setCursor(18, 52);
      tft.print("CONNECTING TO WI-FI:");

      tft.setTextColor(COLOR_WHITE, COLOR_CARD);
      tft.setTextSize(2);
      tft.setCursor(18, 68);
      tft.printf("%-22s", storedSsid.substring(0, 22).c_str());

      long elapsedSec = (now - bootStartTime) / 1000UL;
      long leftSec = (long)NETWORK_CONNECT_TIMEOUT_SEC - elapsedSec;
      if (leftSec < 0)
        leftSec = 0;

      tft.setTextColor(COLOR_AMBER, COLOR_CARD);
      tft.setTextSize(2);
      tft.setCursor(18, 98);
      tft.printf("Try %d/%d (%2lds)   ", wifiAttemptCount > 0 ? wifiAttemptCount : 1, MAX_WIFI_BOOT_ATTEMPTS, leftSec);
    }
    else
    {
      tft.setTextColor(COLOR_AMBER, COLOR_CARD);
      tft.setTextSize(2);
      tft.setCursor(18, 56);
      tft.print("No Wi-Fi Saved  ");
      tft.setTextColor(COLOR_WHITE, COLOR_CARD);
      tft.setTextSize(1);
      tft.setCursor(18, 90);
      tft.print("Connect phone to Hotspot below");
    }
    return;
  }

  // -----------------------------------------------------------------
  // STAGE 2: Starting Line Power (1st Line ON -> 3s Countdown -> 2nd Line)
  // -----------------------------------------------------------------
  if (currentStage == 2)
  {
    unsigned long elapsedMs = now - highLinePendingStartTime;
    unsigned long totalMs = (unsigned long)(INTERVAL_TIME * 1000UL);
    long remainingSec = 1;
    if (elapsedMs < totalMs)
    {
      remainingSec = (long)((totalMs - elapsedMs + 999UL) / 1000UL);
    }

    if (stageChanged)
    {
      tft.fillScreen(COLOR_BG);
      // Header
      tft.fillRect(0, 0, 320, 34, COLOR_AMBER);
      tft.setTextColor(COLOR_BLACK, COLOR_AMBER);
      tft.setTextSize(2);
      tft.setCursor(14, 9);
      tft.print("STARTING POWER");

      // 1st Line Active Badge
      tft.fillRoundRect(10, 44, 300, 44, 8, COLOR_GREEN);
      tft.setTextColor(COLOR_BLACK, COLOR_GREEN);
      tft.setTextSize(2);
      tft.setCursor(20, 58);
      tft.print("1st Line: ON");

      // 2nd Line Countdown Box
      tft.fillRoundRect(10, 98, 300, 132, 10, COLOR_CARD);
      tft.drawRoundRect(10, 98, 300, 132, 10, COLOR_AMBER);

      tft.setTextColor(COLOR_WHITE, COLOR_CARD);
      tft.setTextSize(2);
      tft.setCursor(22, 112);
      tft.print("2nd Line (HIGH)");
      tft.setTextColor(COLOR_MUTED, COLOR_CARD);
      tft.setTextSize(1);
      tft.setCursor(32, 138);
      tft.print("INRUSH SURGE PROTECTION");
    }

    tft.setTextColor(COLOR_AMBER, COLOR_CARD);
    tft.setTextSize(5);
    tft.setCursor(126, 162);
    tft.printf("%lds ", remainingSec);
    return;
  }

  // -----------------------------------------------------------------
  // STAGE 3: Brief 1.5s Confirmation Banner Right When 2nd Line (HIGH) Activates
  // -----------------------------------------------------------------
  if (currentStage == 3)
  {
    if (stageChanged)
    {
      tft.fillScreen(COLOR_BG);
      tft.fillRect(0, 0, 320, 34, COLOR_GREEN);
      tft.setTextColor(COLOR_BLACK, COLOR_GREEN);
      tft.setTextSize(2);
      tft.setCursor(18, 9);
      tft.print("ALL LINES READY");

      tft.fillRoundRect(10, 48, 300, 50, 8, COLOR_GREEN);
      tft.setTextColor(COLOR_BLACK, COLOR_GREEN);
      tft.setTextSize(2);
      tft.setCursor(20, 65);
      tft.print("1st Line: [ON]");

      tft.fillRoundRect(10, 110, 300, 50, 8, COLOR_GREEN);
      tft.setTextColor(COLOR_BLACK, COLOR_GREEN);
      tft.setTextSize(2);
      tft.setCursor(20, 127);
      tft.print("2nd Line: [ON]");

      tft.fillRoundRect(10, 174, 300, 52, 8, COLOR_CYAN);
      tft.setTextColor(COLOR_BLACK, COLOR_CYAN);
      tft.setTextSize(2);
      tft.setCursor(18, 192);
      tft.print("2ND LINE ACTIVE!");
    }
    return;
  }

  // -----------------------------------------------------------------
  // STAGE 4: Live Electricity Telemetry Dashboard + Line 1 & Line 2 ON/OFF States
  // -----------------------------------------------------------------
  static bool prevLowLine = false;
  static bool prevHighLine = false;
  static int prevNetState = -1;

  if (stageChanged)
  {
    tft.fillScreen(COLOR_BG);
    // Top Status Bar
    tft.fillRect(0, 0, 320, 30, COLOR_CARD);
    tft.drawFastHLine(0, 30, 320, COLOR_BORDER);
    tft.setTextColor(COLOR_CYAN, COLOR_CARD);
    tft.setTextSize(2);
    tft.setCursor(10, 7);
    tft.print("VOLTWISE");

    // Main Active Power Card (Watts)
    tft.fillRoundRect(8, 36, 304, 54, 8, COLOR_CARD);
    tft.drawRoundRect(8, 36, 304, 54, 8, COLOR_BORDER);
    tft.setTextColor(COLOR_MUTED, COLOR_CARD);
    tft.setTextSize(1);
    tft.setCursor(16, 42);
    tft.print("ACTIVE POWER");

    // 2x2 Grid Outlines: Voltage, Current, Energy, Power Factor
    // Col 1: x=8, w=148; Col 2: x=164, w=148
    tft.fillRoundRect(8, 96, 148, 40, 6, COLOR_CARD);
    tft.setTextColor(COLOR_MUTED, COLOR_CARD);
    tft.setTextSize(1);
    tft.setCursor(14, 101);
    tft.print("VOLTAGE");

    tft.fillRoundRect(164, 96, 148, 40, 6, COLOR_CARD);
    tft.setCursor(170, 101);
    tft.print("CURRENT");

    tft.fillRoundRect(8, 142, 148, 40, 6, COLOR_CARD);
    tft.setCursor(14, 147);
    tft.print("ENERGY (kWh)");

    tft.fillRoundRect(164, 142, 148, 40, 6, COLOR_CARD);
    tft.setCursor(170, 147);
    tft.print("POWER FACTOR");

    prevLowLine = !lowLineOn;
    prevHighLine = !highLineOn;
    prevNetState = -1;
  }

  // Update Network Badge only when state changes
  int netState = 0; // 0=OFFLINE, 1=AP SETUP, 2=WIFI ONLY, 3=MQTT LIVE
  if (WiFi.status() == WL_CONNECTED)
  {
    netState = mqtt.connected() ? 3 : 2;
  }
  else if (ProvisioningServer::active())
  {
    netState = 1;
  }

  if (netState != prevNetState)
  {
    prevNetState = netState;
    tft.setTextSize(1);
    if (netState == 3)
    {
      tft.fillRoundRect(228, 6, 84, 18, 4, COLOR_GREEN);
      tft.setTextColor(COLOR_BLACK, COLOR_GREEN);
      tft.setCursor(236, 11);
      tft.print("MQTT LIVE");
    }
    else if (netState == 2)
    {
      tft.fillRoundRect(228, 6, 84, 18, 4, COLOR_AMBER);
      tft.setTextColor(COLOR_BLACK, COLOR_AMBER);
      tft.setCursor(236, 11);
      tft.print("WIFI ONLY");
    }
    else if (netState == 1)
    {
      tft.fillRoundRect(228, 6, 84, 18, 4, COLOR_AMBER);
      tft.setTextColor(COLOR_BLACK, COLOR_AMBER);
      tft.setCursor(240, 11);
      tft.print("AP SETUP");
    }
    else
    {
      tft.fillRoundRect(228, 6, 84, 18, 4, COLOR_RED);
      tft.setTextColor(COLOR_WHITE, COLOR_RED);
      tft.setCursor(242, 11);
      tft.print("OFFLINE");
    }
  }

  float v = isnan(latestReadings.voltage) ? 0.0f : latestReadings.voltage;
  float a = isnan(latestReadings.current) ? 0.0f : latestReadings.current;
  float w = isnan(latestReadings.power) ? 0.0f : latestReadings.power;
  float kwh = isnan(latestReadings.energy) ? 0.0f : latestReadings.energy;
  float pf = isnan(latestReadings.powerFactor) ? 0.0f : latestReadings.powerFactor;

  // Sensor AC status indicator
  tft.setTextSize(1);
  tft.setCursor(215, 42);
  if (!latestReadingsValid)
  {
    tft.setTextColor(COLOR_AMBER, COLOR_CARD);
    tft.print("NO AC INPUT");
  }
  else
  {
    tft.setTextColor(COLOR_GREEN, COLOR_CARD);
    tft.print("AC SENSING ");
  }

  // Active Power Value
  tft.setTextColor(COLOR_WHITE, COLOR_CARD);
  tft.setTextSize(3);
  tft.setCursor(16, 56);
  if (w >= 1000.0f)
  {
    tft.printf("%-10s", (String(w / 1000.0f, 2) + " kW").c_str());
  }
  else
  {
    tft.printf("%-10s", (String(w, 2) + " W").c_str());
  }

  // Voltage Value
  tft.setTextColor(COLOR_CYAN, COLOR_CARD);
  tft.setTextSize(2);
  tft.setCursor(14, 114);
  tft.printf("%-7s", (String(v, 1) + "V").c_str());

  // Current Value
  tft.setTextColor(COLOR_CYAN, COLOR_CARD);
  tft.setTextSize(2);
  tft.setCursor(170, 114);
  tft.printf("%-7s", (String(a, 2) + "A").c_str());

  // Energy (kWh) Value
  tft.setTextColor(COLOR_WHITE, COLOR_CARD);
  tft.setTextSize(2);
  tft.setCursor(14, 160);
  tft.printf("%-8s", String(kwh, 3).c_str());

  // PF Value
  tft.setTextColor(COLOR_WHITE, COLOR_CARD);
  tft.setTextSize(2);
  tft.setCursor(170, 160);
  tft.printf("%-5s", String(pf, 2).c_str());

  // Update 1st Line (LOW - Pin 25) badge only when state changes
  if (lowLineOn != prevLowLine)
  {
    prevLowLine = lowLineOn;
    if (lowLineOn)
    {
      tft.fillRoundRect(8, 188, 148, 44, 8, COLOR_GREEN);
      tft.setTextColor(COLOR_BLACK, COLOR_GREEN);
      tft.setTextSize(1);
      tft.setCursor(24, 194);
      tft.print("1ST LINE (LOW)");
      tft.setTextSize(2);
      tft.setCursor(68, 208);
      tft.print("ON");
    }
    else
    {
      tft.fillRoundRect(8, 188, 148, 44, 8, COLOR_CARD);
      tft.drawRoundRect(8, 188, 148, 44, 8, COLOR_RED);
      tft.setTextColor(COLOR_MUTED, COLOR_CARD);
      tft.setTextSize(1);
      tft.setCursor(24, 194);
      tft.print("1ST LINE (LOW)");
      tft.setTextColor(COLOR_RED, COLOR_CARD);
      tft.setTextSize(2);
      tft.setCursor(62, 208);
      tft.print("OFF");
    }
  }

  // Update 2nd Line (HIGH - Pin 26) badge only when state changes
  if (highLineOn != prevHighLine)
  {
    prevHighLine = highLineOn;
    if (highLineOn)
    {
      tft.fillRoundRect(164, 188, 148, 44, 8, COLOR_GREEN);
      tft.setTextColor(COLOR_BLACK, COLOR_GREEN);
      tft.setTextSize(1);
      tft.setCursor(176, 194);
      tft.print("2ND LINE (HIGH)");
      tft.setTextSize(2);
      tft.setCursor(224, 208);
      tft.print("ON");
    }
    else
    {
      tft.fillRoundRect(164, 188, 148, 44, 8, COLOR_CARD);
      tft.drawRoundRect(164, 188, 148, 44, 8, COLOR_RED);
      tft.setTextColor(COLOR_MUTED, COLOR_CARD);
      tft.setTextSize(1);
      tft.setCursor(176, 194);
      tft.print("2ND LINE (HIGH)");
      tft.setTextColor(COLOR_RED, COLOR_CARD);
      tft.setTextSize(2);
      tft.setCursor(218, 208);
      tft.print("OFF");
    }
  }
}
