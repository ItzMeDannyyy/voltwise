# VoltWise User Manual

Welcome to the **VoltWise User Manual**. VoltWise is a smart power management and optimization system designed to monitor, analyze, and protect your home appliances and electrical circuits in real-time.

```
                      +-------------------+
                      | VoltWise Hardware | (ESP32 + PZEM-004T + Relays)
                      +---------+---------+
                                |  MQTT over TLS
                                v
                      +-------------------+
                      |  VoltWise Cloud   | (Backend & ML Disaggregation)
                      +---------+---------+
                                |  REST & WebSockets
                                v
                      +-------------------+
                      |   Mobile App      | (Real-time monitoring & safety)
                      +-------------------+
```

---

## What This Manual Covers

This guide is designed for **homeowners and end users** looking to monitor energy consumption, reduce utility costs, and configure automated emergency protections.

### Quick Start Checklist
1. **[Install the App](app-installation.md):** Scan the official QR code or download the Android APK from [voltwise-orcin.vercel.app](https://voltwise-orcin.vercel.app/).
2. **[Create Your Account](account-auth.md):** Register and log in.
3. **[Monitor Live Power](dashboard-monitoring.md):** View real-time wattage draw and live voltage.
4. **[Provision Hardware](iot-provisioning.md):** Connect your smart meter and relay modules over Wi-Fi.
5. **[Automated Safety Protection](safety-alerts.md):** Receive alerts and automate power shutdowns within 3–10 seconds of electrical overload.
