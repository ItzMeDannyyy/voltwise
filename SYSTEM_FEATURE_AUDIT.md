# VoltWise System Feature Audit & Implementation Status Report

**Date:** November 4, 2026  
**System:** VoltWise Smart Energy Monitoring, NILM & Automated Protection Platform  
**Target Monorepo:** `voltwise - dev` (`iot-voltwise`, `backend`, `ml-voltwise`, `app-voltwise`, `docs`)

---

## Executive Summary

VoltWise is an end-to-end IoT, Machine Learning, and Mobile Energy Management ecosystem designed to monitor whole-home power telemetry via a PZEM-004T sensor, detect appliance usage and anomalies via unsupervised KMeans clustering, provide actionable cost forecasting, and execute hardware safety interventions (dual-tier relay cutoffs).

Across the repository, the core MVP is **operational and deeply implemented**, with:
- **156 passing backend unit tests** across 12 test suites.
- Complete **ESP32 firmware (1,667 lines of C++)** with PZEM UART polling, dual-tier staggered relay driving, TLS MQTT messaging to HiveMQ Cloud, dynamic over-power cutoffs, auto-shutdown timers, and a full SoftAP captive portal provisioning web server.
- Full **FastAPI Machine Learning service** trained on real appliance telemetry (Aircon, Refrigerator, Phone Charger, Light Bulb, Kettle), exposing live 30-second window feature extraction and Euclidean distance anomaly detection.
- Complete **React Native / Expo SDK 54 mobile app** featuring real-time MQTT streaming, interactive multi-line charts, virtual device registry, emergency power cutoff modal, Wi-Fi provisioning wizard, and localized utility billing calculations.

This audit breaks down every system component, contrasts intended features against actual code, highlights technical debt, and categorizes features into **Completed**, **Partially Completed / MVP Bypasses**, and **Unfinished / Planned**.

---

## Overall System Completion Scorecard

```
┌──────────────────────────────────────┬─────────────┬──────────────┬─────────────┬────────────────┐
│ Subsystem / Tier                     │ Total Items │ Completed ✅ │ Partial ⚠️  │ Unfinished ❌  │
├──────────────────────────────────────┼─────────────┼──────────────┼─────────────┼────────────────┤
│ 1. IoT Hardware & Firmware           │     14      │      11      │      1      │       2        │
│ 2. Machine Learning / NILM Service   │     12      │      10      │      1      │       1        │
│ 3. Backend REST & Ingestion API      │     18      │      15      │      2      │       1        │
│ 4. Database & Storage Layer          │      8      │       6      │      2      │       0        │
│ 5. Mobile Application (Frontend)     │     22      │      19      │      0      │       3        │
│ 6. Cross-Cutting & Security          │      8      │       7      │      1      │       0        │
├──────────────────────────────────────┼─────────────┼──────────────┼─────────────┼────────────────┤
│ TOTAL SYSTEM METRICS                 │     82      │  68 (82.9%)  │  7 (8.5%)   │    7 (8.5%)    │
└──────────────────────────────────────┴─────────────┴──────────────┴─────────────┴────────────────┘
```

---

## 1. IoT Hardware & Firmware (`iot-voltwise/`)

PlatformIO C++ firmware targeting ESP32 DevKit v1, interfacing with the PZEM-004T v3.0 power sensor via UART `Serial2` and controlling dual-tier opto-isolated relay modules.

| Feature Name | Description | Status | Code Location | Gaps / Technical Debt / Notes |
| :--- | :--- | :---: | :--- | :--- |
| **PZEM-004T UART Telemetry** | Reads AC Voltage (V), Current (A), Active Power (W), Cumulative Energy (kWh), Frequency (Hz), and Power Factor (PF) every 2 s via dedicated hardware `Serial2`. | ✅ Completed | [main.cpp](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/iot-voltwise/src/main.cpp#L25-L28) | Fully stable; includes 3-read retry logic and UART frame validation. |
| **PZEM Sensor Diagnostics** | Diagnostic mode prints slave address verification and raw UART packet bytes on boot. | ✅ Completed | [main.cpp](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/iot-voltwise/src/main.cpp#L69-L72) | Differentiates UART communication wiring faults from dead AC mains voltage. |
| **Dual-Tier Relay Control** | Physical control over two load lines: Pin 25 (Low Load Line, 10A) and Pin 26 (High Load Line, 30A). | ✅ Completed | [main.cpp](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/iot-voltwise/src/main.cpp#L30-L39) | Active-LOW relay logic with safe default boot states. |
| **Staggered Relay Sequencing** | Sequential relay activation with 3s interval between Low Line and High Line. | ✅ Completed | [main.cpp](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/iot-voltwise/src/main.cpp#L45-L50) | Eliminates severe inrush current surges and prevents ESP32 brownout resets. |
| **Smart Hybrid Boot Power** | Searches Wi-Fi for 15s; if unconnected, transitions to autonomous offline mode and energizes relays. | ✅ Completed | [main.cpp](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/iot-voltwise/src/main.cpp#L52-L58) | Ensures household appliances never lose power due to network/router failure. |
| **Dynamic Over-Power Safety Cutoff** | Automatic relay cutoff when active power exceeds `maxAllowedPowerWatts` (default 3000 W). | ✅ Completed | [main.cpp](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/iot-voltwise/src/main.cpp#L59-L65) | Can be enabled/disabled and adjusted in real-time over MQTT topic `voltwise/<uid>/safety/set`. |
| **Auto-Shutdown Countdown Timer** | Auto-trips relays after designated runtime (default 30 min) once active load > 0.05 A is sensed. | ✅ Completed | [main.cpp](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/iot-voltwise/src/main.cpp#L77-L86) | Fully configurable via MQTT topic `voltwise/<uid>/countdown/set`. |
| **SoftAP Captive Portal Server** | Built-in Wi-Fi provisioning web server hosting `VoltWise-Setup-XXXX` AP with DNS captive redirect. | ✅ Completed | [provisioning_server.h](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/iot-voltwise/src/provisioning_server.h#L1-L120) | Features dark-mode web setup page, network scan (`/api/scan`), and credential saving (`/api/provision`). |
| **NVS Credential Storage** | Non-volatile flash storage using ESP32 `Preferences` for Wi-Fi SSID, password, and custom device UID. | ✅ Completed | [config_manager.h](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/iot-voltwise/src/config_manager.h#L14-L86) | Survives power cycles; falls back to `secrets.h` if unconfigured. |
| **Physical Factory Reset Button** | Holding ESP32 BOOT button (GPIO 0) for 5 seconds clears flash credentials and re-enters AP setup mode. | ✅ Completed | [main.cpp](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/iot-voltwise/src/main.cpp#L279-L315) | Debounced hardware interrupt handling. |
| **HiveMQ Cloud MQTT over TLS** | Encrypted TLS connection on port 8883 publishing JSON telemetry and listening for commands. | ✅ Completed | [main.cpp](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/iot-voltwise/src/main.cpp#L1316-L1419) | Supports MQTT Last Will and Testament (LWT) on `voltwise/<uid>/status`. |
| **6-Socket Individual Addressability** | Architectural guide specifies 6 discrete sockets (GPIO 12-15 for low load, GPIO 25-26 for high load). | ⚠️ Partial / Deviation | [esp32_pzem_relay_iot_build_guide.md](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/docs/esp32_pzem_relay_iot_build_guide.md#L48-L70) | **Hardware Deviation**: Current firmware operates 2 grouped circuit lines (Low/High) via GPIO 25 & 26 rather than 6 individual socket pins. |
| **OTA (Over-The-Air) Firmware Updates** | Wireless firmware flashing via ArduinoOTA or HTTP server. | ❌ Unfinished / Missing | `iot-voltwise/src/` | Not implemented; updates require physical USB connection via PlatformIO. |
| **Offline Flash Telemetry Spooling** | On-device flash caching (SPIFFS / LittleFS / SD) when Wi-Fi is severed. | ❌ Unfinished / Missing | `iot-voltwise/src/` | When Wi-Fi drops, telemetry is printed to Serial and discarded; no offline buffer. |

---

## 2. Machine Learning & NILM Service (`ml-voltwise/`)

Python FastAPI microservice leveraging Scikit-Learn KMeans clustering and sliding-window feature engineering to classify appliance types and detect electrical anomalies.

| Feature Name | Description | Status | Code Location | Gaps / Technical Debt / Notes |
| :--- | :--- | :---: | :--- | :--- |
| **FastAPI Microservice Engine** | Asynchronous Python service exposing `/health`, `/clusters`, `/telemetry`, `/predict`, `/train`. | ✅ Completed | [main.py](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/ml-voltwise/app/main.py#L77-L92) | Runs via Uvicorn on port 8000; includes CORS middleware and auto artifact loading. |
| **30-Second Window Feature Extraction** | Extracts 10 electrical features (`voltage_mean`, `current_mean`, `current_max`, `power_mean`, `power_max`, `power_min`, `power_std`, `energy_delta_wh`, `frequency_mean`, `power_factor_mean`). | ✅ Completed | [feature_engineering.py](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/ml-voltwise/feature_engineering.py#L1-L140) | Smooths out transient measurement spikes while preserving inrush signatures. |
| **KMeans Clustering Pipeline** | Standardized pipeline (`StandardScaler` + `KMeans`) with silhouette analysis ($K=2..8$). | ✅ Completed | [train.py](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/ml-voltwise/train.py#L1-L150) | Trained model achieves Silhouette Score of 0.5301 at $K=7$. |
| **Appliance Profile Learning** | Learned cluster profiles for Aircon (running & inrush), Refrigerator (steady & compressor transition), Light Bulb, Phone Charger (Samsung A14), Electric Kettle. | ✅ Completed | [cluster_profiles.csv](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/ml-voltwise/artifacts/cluster_profiles.csv) | Trained on 918 real 30-second windows (15,000+ raw sensor readings in `data/raw/`). |
| **Euclidean Anomaly Detection** | Detects anomalous loads exceeding the 95th percentile Euclidean distance threshold (`1.5352`). | ✅ Completed | [main.py](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/ml-voltwise/app/main.py#L160-L175) | Generates `warning` alert levels when unseen electrical waveforms appear. |
| **Live Telemetry Stream Ingestion** | Endpoint `POST /telemetry` accepts live readings, buffers per-panel time series, and infers status once 3+ samples arrive. | ✅ Completed | [main.py](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/ml-voltwise/app/main.py#L244-L291) | Sliding time window automatically prunes readings older than 30 seconds. |
| **Pre-Computed Vector Prediction** | Endpoint `POST /predict` accepts direct 10-feature vectors for offline evaluation and batch analytics. | ✅ Completed | [main.py](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/ml-voltwise/app/main.py#L229-L242) | Verified via `test_api.ps1`. |
| **On-Demand Retraining Endpoint** | Endpoint `POST /train` executes model retraining on all datasets inside `data/raw/` and auto-reloads pipeline. | ✅ Completed | [main.py](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/ml-voltwise/app/main.py#L293-L318) | Supports dynamic parameters (`window_seconds`, `min_k`, `max_k`, `exact_k`). |
| **Backend Integration Bridge** | Node.js client service sending incoming MQTT readings to ML service with non-blocking 2s timeout. | ✅ Completed | [mlService.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/lib/mlService.ts#L65-L125) | Silent error handling: backend never drops sensor readings if ML service is unreachable. |
| **Device Matching & Tagging** | Fuzzy string matching connects ML predicted appliance to registered PostgreSQL `Device` or marks as "Unregistered Load". | ✅ Completed | [mlService.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/lib/mlService.ts#L130-L289) | Switches matched device to `ACTIVE` and placeholder to `IDLE`. |
| **True Multi-Load NILM Disaggregation** | Disaggregating multiple concurrent overlapping loads on a single aggregate circuit (e.g. Fridge + AC + TV all running simultaneously). | ⚠️ Partial / Architectural Limitation | `ml-voltwise/` | **Algorithm Scope**: KMeans identifies the **dominant load state** in the aggregate window or flags an anomaly. It is not a combinatorial NILM disaggregator (e.g., FHMM or Deep Seq2Point). |
| **Automated Active Learning Retraining** | When user registers an "Unregistered Load" in app, system automatically appends labeled window to dataset and retrains model. | ❌ Unfinished / Missing | `ml-voltwise/` | Currently user-registered devices are stored in PostgreSQL; retraining requires running `python train.py` or triggering `POST /train` manually. |

---

## 3. Backend REST & Ingestion API (`backend/`)

Modular Node.js / Express 5 API written in TypeScript ESM with Prisma ORM 7.

| Feature Name | Description | Status | Code Location | Gaps / Technical Debt / Notes |
| :--- | :--- | :---: | :--- | :--- |
| **JWT Authentication** | Public `POST /api/auth/register` and `POST /api/auth/login` returning bcrypt-hashed JWT tokens. | ✅ Completed | [auth.controller.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/modules/auth/auth.controller.ts) | 7-day token expiration; password hashed with bcrypt (salt rounds 10). |
| **Revocable Session Tracking** | Every sign-in generates a `Session` row. `requireAuth` validates token's `sid` against database on every request. | ✅ Completed | [sessions.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/lib/sessions.ts) | Enables true "Sign out this device" and "Sign out everywhere else"; updates `lastSeenAt` at most once per minute. |
| **User Profile Management** | `GET /api/auth/me` and `PATCH /api/auth/me` updating first name, last name, and currency symbol. | ✅ Completed | [auth.service.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/modules/auth/auth.service.ts#L140-L175) | Protected by `requireAuth`; user-scoped. |
| **Security Session Audit & Revocation** | `GET /api/security/overview` lists active sessions; `DELETE /api/security/sessions/:id` revokes a session; `DELETE /api/security/sessions` revokes all other sessions. | ✅ Completed | [security.service.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/modules/security/security.service.ts) | Returns fresh session overview immediately to avoid client race conditions. |
| **Account Deletion** | `DELETE /api/security/account` validates user's password and cascades deletion of all rooms, devices, readings, sessions, and alerts. | ✅ Completed | [security.service.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/modules/security/security.service.ts#L130-L160) | Full data purging ensuring GDPR/privacy compliance. |
| **Virtual Device CRUD** | `GET /api/devices`, `POST /api/devices`, `PATCH /api/devices/:id`, `DELETE /api/devices/:id`. | ✅ Completed | [devices.service.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/modules/devices/devices.service.ts) | Finds or creates room by name; manages device status transitions (`ACTIVE`, `IDLE`, `OFF`, `UNPOWERED`). |
| **Device Photo Uploads** | `POST /api/devices/:id/photo` stores uploaded photos in `backend/uploads/` via Multer and stores path in `imageUri`. | ✅ Completed | [upload.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/lib/upload.ts) | 5 MB upload limit; filters for JPEG/PNG/WebP; served statically at `/uploads`. |
| **Power State Reconciliation** | `POST /api/devices/reconcile-power` reconciles all device statuses against master relay state. | ✅ Completed | [devices.service.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/modules/devices/devices.service.ts#L180-L215) | When master power is cut, downstream devices transition to `UNPOWERED`. |
| **Live Dashboard Aggregation** | `GET /api/dashboard` computing `currentKw`, `totalTodayKwh`, live PZEM reading, `iotOnline`, `history`, `deviceHistory`, `topConsumers`. | ✅ Completed | [dashboard.service.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/modules/dashboard/dashboard.service.ts) | Live telemetry card remains real-time while charts follow selectable range. |
| **Unified Time-Range Engine** | `src/lib/range.ts` resolves time windows for Day (24h), Week (7d), Month (28-31d), and Cycle (billing dates). | ✅ Completed | [range.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/lib/range.ts) | Pure function with injected clock; drops future buckets so charts never draw zero into tomorrow. |
| **Analytics & Bill Predictor** | `GET /api/analytics` calculating accumulated kWh, estimated monthly bill based on tariff rate, and top appliance breakdown. | ✅ Completed | [analytics.service.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/modules/analytics/analytics.service.ts) | Calculates projected cost to end of billing period using average daily burn rate. |
| **Tariff Rate Plan Management** | `GET /api/analytics/tariff` and `PUT /api/analytics/tariff` retrieving and updating user's rate per kWh and currency. | ✅ Completed | [analytics.service.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/modules/analytics/analytics.service.ts#L375-L420) | Updates active billing period's tariff rate; falls back to default 10.5 ₱/kWh. |
| **Alert Management & Event Bus** | `GET /api/alerts`, `POST /api/alerts`, `POST /api/alerts/read-all`, `PATCH /api/alerts/:id/read`. | ✅ Completed | [alerts.service.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/modules/alerts/alerts.service.ts) | Tracks unread status; supports critical, warning, and info alert severities. |
| **New-Load Step Detector** | Pure I/O-free EMA baseline step-change detector (`src/lib/loadDetector.ts`) generating INFO alerts on appliance activation. | ✅ Completed | [loadDetector.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/lib/loadDetector.ts) | Fire-and-forget; tested via `loadDetector.test.ts` without database/network dependencies. |
| **MQTT Ingestion & Relay Controller** | `src/lib/mqtt.ts` ingests PZEM telemetry into `EnergyReading`, triggers ML classification, exposes `/api/iot/relay`, `/api/iot/safety`, `/api/iot/countdown`. | ✅ Completed | [mqtt.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/lib/mqtt.ts) | Calculates accurate delta kWh per reading to prevent odometer multiplication errors. |
| **Data Collection Session Controller** | `POST /api/iot/collection/start`, `POST /api/iot/collection/stop`, `GET /api/iot/collection/status`, `DELETE /api/iot/readings`. | ✅ Completed | [iot.service.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/modules/iot/iot.service.ts#L100-L160) | Direct endpoint for training data collection; supports purging test readings. |
| **Data Export Engine** | `GET /api/export/summary` and `GET /api/export/:dataset` streaming CSV and JSON with BOM and anti-formula-injection sanitization. | ✅ Completed | [export.service.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/modules/export/export.service.ts) | Supports `energyReadings`, `devices`, `alerts`, `securityAudit`; caps at 20,000 rows. |
| **System Health Check** | `GET /api/health` returning uptime, database status, and timestamp. | ✅ Completed | [index.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/index.ts#L60-L75) | Used by app to paint live server status indicator. |
| **Password Reset via Email** | `POST /api/auth/forgot-password` generates reset token and replaces password via `POST /api/auth/reset-password`. | ⚠️ Partial / MVP Bypass | [auth.routes.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/modules/auth/auth.routes.ts#L18-L25) | **MVP Mock**: Reset token is returned directly in HTTP JSON response. No real SMTP/email service (SendGrid, AWS SES) is configured. |
| **Dedicated Room CRUD API** | Separate standalone endpoints for managing rooms (`GET /api/rooms`, `DELETE /api/rooms/:id`, `PATCH /api/rooms/:id`). | ⚠️ Partial / Missing Route | `backend/src/modules/devices/` | Rooms are created automatically by string name inside `devices.service.ts`. There is no dedicated `rooms.routes.ts`. |
| **Automated Billing Period Rollover** | Cron job or scheduler to close the current `BillingPeriod` at midnight of cycle end and roll accumulated kWh into a historical row. | ❌ Unfinished / Missing | `backend/src/` | Table exists in schema, but cycle rollover is computed dynamically by client query params. |
| **API Rate Limiting Middleware** | Rate limiting (`express-rate-limit`) on `/api/auth/login` and `/api/auth/register` to prevent brute-force attacks. | ❌ Unfinished / Missing | [index.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/index.ts) | No rate-limiting middleware configured on Express server. |

---

## 4. Database & Storage Layer (PostgreSQL + Prisma)

| Feature Name | Description | Status | Code Location | Gaps / Technical Debt / Notes |
| :--- | :--- | :---: | :--- | :--- |
| **Prisma Schema & Relational Integrity** | 7 relational models: `User`, `Session`, `Tariff`, `BillingPeriod`, `Room`, `Device`, `EnergyReading`, `Alert`. | ✅ Completed | [schema.prisma](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/prisma/schema.prisma) | Full foreign key constraints with `onDelete: Cascade` and `onDelete: SetNull`. |
| **Dual-Use Telemetry Table** | `EnergyReading` stores both whole-home aggregate (`deviceId: null`) and appliance-tagged (`deviceId: int`) rows. | ✅ Completed | [schema.prisma](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/prisma/schema.prisma#L132-L149) | Differentiates whole-home timeline from appliance breakdown. |
| **Database Performance Indexing** | Compound indexes on `[deviceId, timestamp]` and `[userId, timestamp]` on `EnergyReading`, and `[userId, lastSeenAt]` on `Session`. | ✅ Completed | [schema.prisma](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/prisma/schema.prisma#L79-L80) | Accelerates time-range slicing across large telemetry datasets. |
| **Prisma 7 Postgres Adapter** | Modern ESM connection using `@prisma/adapter-pg` and connection pooling. | ✅ Completed | [prisma.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/lib/prisma.ts) | Shared singleton client across all modules. |
| **Comprehensive Seed Dataset** | `prisma/seed.ts` loads demo user (`demo@voltwise.app`), 5 rooms, 7 smart devices, 30 days of hourly energy readings, and alerts. | ✅ Completed | [seed.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/prisma/seed.ts) | Provides rich, instantly demonstrable environment for evaluators. |
| **Local File Upload Bucket** | Multer disk storage in `backend/uploads/` with UUID/timestamp naming. | ✅ Completed | [upload.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/lib/upload.ts) | Photos served statically at `/uploads`. |
| **TimescaleDB Continuous Aggregates** | Automatic rollups of raw 2s telemetry into 1-minute, 1-hour, and 1-day continuous aggregate hypertables. | ⚠️ Partial / Planned | `backend/prisma/` | Mentioned in README/Tech Stack, but active schema uses standard PostgreSQL tables without Timescale extension migrations. |
| **Cloud Object Storage (S3 / GCS)** | Cloud blob storage for device photos with pre-signed URLs. | ⚠️ Partial / Planned | `backend/src/lib/upload.ts` | Uses local filesystem storage; acceptable for development, but requires persistent disk volume or S3 in production. |

---

## 5. Mobile Application Frontend (`app-voltwise/`)

Cross-platform React Native app built on Expo SDK 54, React Native 0.81, and `expo-router`.

| Feature Name | Description | Status | Code Location | Gaps / Technical Debt / Notes |
| :--- | :--- | :---: | :--- | :--- |
| **Real-Time Live Telemetry Card** | Expandable card displaying live PZEM-004T grid: Voltage, Current, Active Power, Cumulative Energy, Frequency, Power Factor. | ✅ Completed | [dashboard.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/app/(tabs)/dashboard.tsx#L450-L550) | Driven by direct MQTT subscription (`useMqtt()`); indicates fresh vs stale (>10s) data. |
| **Interactive Usage History Chart** | Multi-line SVG chart displaying whole-home consumption and individual appliance curves with tap tooltips. | ✅ Completed | [dashboard.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/app/(tabs)/dashboard.tsx#L660-L680) | Uses dense axis thinning and 3-hour day steps so labels never shift or overlap. |
| **Time-Range Navigation Controls** | Shared `RangeNavigator` chip control: Day, Week, Month, Cycle with custom hand-rolled `DatePickerModal`. | ✅ Completed | [RangeNavigator.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/components/RangeNavigator.tsx) | Disables forward arrow at current date to prevent navigating into future. |
| **Virtual Device Registry** | Categorized list of devices with room filter chips, search bar, banner vs photo card view mode. | ✅ Completed | [devices.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/app/(tabs)/devices.tsx) | Live status badges (`ACTIVE`, `IDLE`, `OFF`, `CIRCUIT OFF`). |
| **Device Photo Picker** | Camera capture or gallery image picker (`expo-image-picker`) with upload progress indicator. | ✅ Completed | [devices.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/app/(tabs)/devices.tsx#L380-L420) | Uploads photo to `/api/devices/:id/photo` upon selection. |
| **Device Status Toggle** | Software toggle switch to enable/disable appliance with optimistic updates; blocked if master relay is OFF. | ✅ Completed | [devices.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/app/(tabs)/devices.tsx#L430-L480) | Explains reason to user if toggle is blocked. |
| **Unregistered Load Prompt** | Banner alert when ML detects an unregistered load with one-tap "Quick Register" action. | ✅ Completed | [devices.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/app/(tabs)/devices.tsx#L740-L790) | Pre-fills appliance category and rated wattage automatically. |
| **Alerts Feed & Unread Badge** | Reverse-chronological feed with severity filter chips (All, Critical, Warning, Info) and tab unread badge. | ✅ Completed | [alerts.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/app/(tabs)/alerts.tsx) | Subscribes to `ALERTS_CHANGED_EVENT` for live updates. |
| **Anomaly Modal & Emergency Cutoff** | Tap alert to open `AnomalyModal` showing power spike details and an instant "Emergency Power Cutoff" button. | ✅ Completed | [AnomalyModal.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/components/AnomalyModal.tsx) | Cuts power immediately via backend relay command without leaving screen. |
| **Center Power Control Modal** | Dedicated intercepting center tab (`power.tsx`) opening comprehensive relay control modal. | ✅ Completed | [PowerControlModal.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/components/PowerControlModal.tsx) | Simultaneous Master switch + independent Line 1 (High Load) and Line 2 (Low Load) switches. |
| **Inrush Current Reconnection Notice** | Visual indicator explaining the 3-second safety delay during power reconnection. | ✅ Completed | [PowerControlModal.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/components/PowerControlModal.tsx#L710-L730) | Educates user why appliances turn on with staggered intervals. |
| **Bill Predictor Calculator** | Cost estimation card: Accumulated kWh × user tariff rate = projected end-of-month utility bill. | ✅ Completed | [analytics.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/app/(tabs)/analytics.tsx#L480-L530) | Uses average daily consumption rate over active billing cycle. |
| **Consumption Donut Breakdown** | SVG donut chart illustrating percentage energy consumption by appliance category. | ✅ Completed | [analytics.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/app/(tabs)/analytics.tsx#L620-L700) | Synchronized legend showing kWh and localized cost. |
| **PZEM Electrical Health Statistics** | Accordion detailing Min, Average, Max for Voltage, Current, Power, Frequency, and Power Factor. | ✅ Completed | [analytics.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/app/(tabs)/analytics.tsx#L800-L870) | Displays Philippine electrical safety guidelines (e.g. 220V ±10%). |
| **ESP32 Wi-Fi Setup Wizard** | 5-step in-app wizard: Hotspot connect, Wi-Fi scan, credentials entry, ESP32 transfer, MQTT verification. | ✅ Completed | [iot-provision.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/app/iot-provision.tsx) | Communicates directly with ESP32 SoftAP web server at `192.168.4.1`. |
| **Sensor & IoT Diagnostic Center** | Triple-signal health verdict (app socket, backend broker, ESP32 status), device pairing, and broker discovery. | ✅ Completed | [iot-settings.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/app/iot-settings.tsx) | Allows configuring overpower cutoff and countdown timer values. |
| **Biometric & Passcode App Lock** | Protects app behind fingerprint, face ID, or device passcode (`expo-local-authentication`). | ✅ Completed | [AppLockContext.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/context/AppLockContext.tsx) | Dormant if phone has no biometrics enrolled; provides sign-out escape hatch. |
| **Data Collection & Export Tool** | Developer screen (`/data-collection`) for recording PZEM telemetry for new appliances with session recovery. | ✅ Completed | [data-collection.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/app/data-collection.tsx) | Saves active session backup in local storage; exports CSV for model training. |
| **Offline Demo Mode (`DemoFab`)** | Floating action button toggling full 7-device realistic household data offline without API writes. | ✅ Completed | [DemoFab.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/components/DemoFab.tsx) | Generates simulated anomaly spikes on demand for presentations and testing. |
| **Theme Engine** | Full Dark, Light, and System Theme switching with WCAG-compliant contrast ratios. | ✅ Completed | [ThemeContext.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/context/ThemeContext.tsx) | Dynamic palette applied consistently across all components. |
| **Background Push Notifications** | Remote push notifications (FCM / APNs) when app is closed or in background. | ❌ Unfinished / Missing | [NotificationContext.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/context/NotificationContext.tsx#L360-L375) | **Local In-App Only**: Notifications only display while app process is running or upon foreground catch-up. |
| **Geofencing & Automation Rules** | Automation rules to turn off high-load circuits when user leaves home. | ❌ Unfinished / Missing | `app-voltwise/` | No background location or geofencing triggers implemented. |
| **Native Home Screen Widgets** | iOS / Android home screen widgets for at-a-glance kW power and daily cost. | ❌ Unfinished / Missing | `app-voltwise/` | Requires native widget extensions (Swift WidgetKit / Android Glance). |

---

## 6. Communication & Cross-Cutting Infrastructure

| Feature Name | Description | Status | Code Location | Gaps / Technical Debt / Notes |
| :--- | :--- | :---: | :--- | :--- |
| **HiveMQ Cloud TLS MQTT Broker** | Unified messaging bus connecting ESP32 (port 8883 TLS), backend (port 8883 TLS), and app (port 8884 WSS). | ✅ Completed | [CLAUDE.md](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/CLAUDE.md#L237-L278) | Dynamic topic namespace: `voltwise/<uid>/telemetry`, `relay/state`, `relay/set`, `status`. |
| **Stateless Client Billing Storage** | Billing cycle dates stored client-side via `lib/billing-storage.ts` and passed as query parameters. | ✅ Completed | [billing-storage.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/lib/billing-storage.ts) | Prevents API from becoming stateful while allowing custom billing dates. |
| **Secure Local Device Storage** | Preferences inventory (`theme`, `units`, `applock`, `notifications`, `sensor pairing`) stored in `SecureStore` / `localStorage`. | ✅ Completed | [local-data.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/lib/local-data.ts) | Clean reset mechanism in Data & Export settings. |
| **Data Export Sanitization** | Guards against CSV formula injection (`=`, `+`, `-`, `@`, `\t`, `\r`) in user-authored fields. | ✅ Completed | [csv.ts](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/src/lib/csv.ts) | Prepends single quote `'` to prevent spreadsheet code execution. |
| **ESM Module Resolution** | Native TypeScript ESM configuration in backend with explicit file extensions. | ✅ Completed | [package.json](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/backend/package.json) | `--experimental-vm-modules` Jest unit testing with 100% mocked Prisma. |
| **Monorepo Dev Orchestration** | Root script `npm run dev` concurrently orchestrates ML service, backend API, and Expo dev server. | ✅ Completed | [package.json](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/package.json#L9-L14) | Single command boots all three development processes. |
| **Cross-Platform Pull-to-Refresh** | Custom unified gesture component (`PullToRefresh.tsx`) working smoothly across iOS, Android, and Web. | ✅ Completed | [PullToRefresh.tsx](file:///C:/Users/ThinkPad/Desktop/Danny/voltwise%20-%20dev/app-voltwise/components/pull-to-refresh/PullToRefresh.tsx) | Bypasses native Android FlatList refresh bugs. |
| **Production Secrets Management** | Credentials stored in `.env` and `secrets.h`. | ⚠️ Partial / DevOps | `.env.example`, `secrets.h.example` | Gitignored credentials; in production, use AWS Secrets Manager or Vault. |

---

## 7. Prioritized Roadmap & Action Items

To take VoltWise from the current functional MVP to a fully polished, defense-ready or production system, the following tasks are recommended in order of priority:

### Priority 1: High Impact / Defense Polish (Next 1–2 Weeks)
1. **Automated Active Learning Retraining Loop**:
   - Connect the app's "Register Unregistered Load" flow to trigger `POST /train` on `ml-voltwise` so user-labeled devices incrementally update the KMeans cluster profiles without manual developer intervention.
2. **Dedicated Room Management Router**:
   - Add `src/modules/rooms/rooms.routes.ts` (`GET /api/rooms`, `POST /api/rooms`, `DELETE /api/rooms/:id`) so users can manage room categories independently in the UI.
3. **Automated Billing Period Rollover Service**:
   - Add a lightweight node-cron job or scheduled check in `backend/src/index.ts` to close expired `BillingPeriod` rows and record the historical cost snapshot.

### Priority 2: Hardware & Infrastructure Enhancements (Next 2–4 Weeks)
1. **6-Socket Hardware Firmware Alignment**:
   - Update `iot-voltwise/src/main.cpp` to support all 6 GPIO relay pins as documented in `docs/esp32_pzem_relay_iot_build_guide.md`, allowing both line-level and socket-level remote switching.
2. **Offline Flash Telemetry Spooling**:
   - Implement an SPIFFS or LittleFS ring buffer in the ESP32 firmware so that readings collected during home Wi-Fi drops are saved and uploaded upon reconnect.
3. **TimescaleDB Continuous Aggregates Migration**:
   - Create a Prisma raw SQL migration to convert `EnergyReading` into a TimescaleDB hypertable with 1-hour continuous aggregation policies.

### Priority 3: Production Readiness (Future / Scale)
1. **Real SMTP Email Service**:
   - Replace the direct token return in `POST /api/auth/forgot-password` with Nodemailer / AWS SES / SendGrid email delivery.
2. **Remote Push Notifications (APNs / FCM)**:
   - Integrate Expo Push Notifications or Firebase Cloud Messaging so critical electrical anomaly alerts reach the user's phone lock screen even when the app is swiped away.
3. **Advanced Multi-Appliance NILM (FHMM / Deep Learning)**:
   - Transition from dominant-state KMeans clustering to Factorial Hidden Markov Models (FHMM) or Sequence-to-Point neural networks for true concurrent multi-appliance energy disaggregation.

---
*Report generated automatically by Antigravity Codebase Audit Engine.*
