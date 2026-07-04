#include <Arduino.h>

void setup() {
  Serial.begin(115200);
  Serial.println("VoltWise ESP32 started!");
}

void loop() {
  Serial.println("Hello from VoltWise IoT");
  delay(1000);
}