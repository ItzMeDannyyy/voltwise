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

// Diagnostic mode: prints each raw reading + the PZEM slave address so you can
// tell a dead UART link from a partial/AC-power problem. Set to false once the
// sensor is confirmed working.
const bool DIAGNOSTIC_MODE = true;

// How many times to re-attempt a read before declaring failure.
const int SENSOR_READ_RETRIES = 3;


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
void printDiagnostics(PowerReadings readings);

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
      handlePowerSafety(readings);
    } else {
      Serial.println("Sensor reading failed. Check PZEM wiring, AC input, RX/TX, and GND.");
      if (DIAGNOSTIC_MODE) {
        printDiagnostics(readings);
      }
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
  if (readings.power > MAX_ALLOWED_POWER_WATTS) {
    Serial.println("WARNING: Power exceeded threshold!");
    Serial.println("Turning all relays OFF for safety.");

    turnAllRelaysOff();
  }
}