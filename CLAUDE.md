# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**VoltWise** is a capstone project: a smart energy tracking & monitoring system.
The repo is a monorepo with four parts: an Expo React Native app (`app-voltwise/`),
a modular Express + Prisma + PostgreSQL API (`backend/`), ESP32 firmware for the
physical sensor layer (`iot-voltwise/`), and a FastAPI KMeans ML service
(`ml-voltwise/`). The app + backend form the working MVP. The IoT layer is
wired through **HiveMQ Cloud MQTT**: the ESP32 publishes telemetry over TLS,
the backend ingests it into `EnergyReading` and exposes relay control at
`/api/iot`, and the app subscribes directly over WSS for live dashboard data
(see "MQTT / IoT layer" below). The seed still provides the rich demo dataset;
the ML service is not yet wired into the backend.

See `VOLTWISE_CORE_FEATURES.md` for the product feature set and `docs/` for the
ERD, data flow, system architecture, and the IoT/NILM/KMeans design guides.

## Structure

```
voltwise/
├── backend/         # Express 5 + Prisma 7 API (TypeScript, ESM)
│   ├── prisma/      # schema.prisma, seed.ts, migrations/
│   ├── src/         # index.ts, routes/, lib/prisma.ts, configs/, modules/<feature>/
│   └── test/        # Jest unit tests (ESM + ts-jest)
├── app-voltwise/    # Expo React Native app (expo-router)
│   ├── app/         # (auth) login/register · (tabs) dashboard/devices/alerts/analytics · profile · settings
│   ├── components/  # DemoFab, AnomalyModal, AlertDetailModal, ConfirmModal, AppHeader
│   ├── context/     # AuthContext, MqttContext
│   └── lib/         # api.ts (typed client + shared types), auth-storage.ts
├── iot-voltwise/    # PlatformIO ESP32 firmware (PZEM-004T v3.0 + 2-channel relay + MQTT)
├── ml-voltwise/     # FastAPI KMeans service (scaffold: app/main.py, train.py are empty stubs)
├── docs/            # ERD, DATA_FLOW, SYSTEM_ARCHITECTURE + NILM/KMeans/ESP32 build guides
└── VOLTWISE_CORE_FEATURES.md
```

> The root `package.json` `dev`/`dev:app` scripts still reference the old
> `voltwise/` app directory (renamed to `app-voltwise/`) and are broken. Run
> the backend and app from their own directories instead.

## Backend (`backend/`)

- **Stack:** Express 5, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL, TypeScript, ESM (`"type":"module"`).
- **DB:** `voltwise_db`. Connection comes from `.env` (`DATABASE_*` / `DATABASE_URL`) via `src/configs/database.ts`; the Prisma client lives in `src/lib/prisma.ts` (reuse it — don't instantiate new clients).
- **Module pattern:** each feature is `src/modules/<name>/` with `<name>.routes.ts`, `.controller.ts`, `.service.ts`, `.dto.ts`. Routes are aggregated in `src/routes/index.ts` and mounted under `/api`. Controllers validate/shape I/O; services hold logic + Prisma access; dtos hold types.
- **Conventions:** ESM with `allowImportingTsExtensions` — local imports use explicit extensions (`.ts` for source, `.js` for the generated client at `src/generated/prisma`). Responses are wrapped as `{ success, data }`.
- **Scaffold a module:** `npm run add:module <name>`. The `src/modules/sample/` directory is the generated template to reference.

### Backend commands (run from `backend/`)

```bash
npm install
npx prisma migrate dev --name <migration>   # apply schema to voltwise_db
npx prisma generate                          # regenerate client into src/generated/prisma
npm run seed                                 # load mock data (prisma/seed.ts)
npm run fresh:db                             # reset DB and re-apply all migrations (no seed)
npm run dev                                  # start API on http://localhost:3000
npm test                                     # Jest (ESM via --experimental-vm-modules)
npm test -- dashboard                        # run a single test file by name
npm run test:watch                           # Jest watch mode
```

### Backend testing

Jest is configured for native ESM (`jest.config.mjs`, ts-jest with `useESM`;
the npm scripts pass `--experimental-vm-modules`). Tests live in `test/` and
**mock the shared Prisma client with `jest.unstable_mockModule` before importing
the code under test** — no real database is touched. `test/dashboard.test.ts`
is the reference pattern for mocking `src/lib/prisma.ts` and the generated
enums in an ESM world.

### API routes

All routes are prefixed with `/api`:

| Prefix       | Module    | Purpose                                                                      |
| ------------ | --------- | ---------------------------------------------------------------------------- |
| `/auth`      | auth      | `POST /register`, `POST /login` (public); `GET /me`, `PATCH /me` (protected) |
| `/devices`   | devices   | CRUD for smart devices                                                        |
| `/dashboard` | dashboard | Live summary (kW, kWh, history, consumers)                                    |
| `/alerts`    | alerts    | Alert management; `POST /` creates alerts                                     |
| `/analytics` | analytics | Bill prediction, kWh breakdown, metrics                                       |
| `/iot`       | iot       | `POST /relay` master relay command; `GET /status` last-known device state    |
| `/health`    | —         | `GET /api/health` liveness check                                              |

## Mobile app (`app-voltwise/`)

- **Stack:** Expo SDK 54, React Native 0.81, React 19, expo-router (file-based tabs in `app/(tabs)`).
- **Data:** screens fetch from the backend through `lib/api.ts`, which auto-resolves the dev host from `expo-constants` and unwraps `{success,data}`. Each screen keeps local mock constants as an **offline-first fallback** and uses **optimistic updates** for writes.
- **Expo is versioned:** before writing app code, consult the exact docs at https://docs.expo.dev/versions/v54.0.0/ (see `app-voltwise/AGENTS.md`).

### App commands (run from `app-voltwise/`)

```bash
npm install
npx expo start            # open on device / emulator / web
npx expo start --android  # Android only
npx expo start --ios      # iOS only
npm run lint              # ESLint via expo lint
```

> On a physical device, `lib/api.ts` derives the LAN IP automatically. Override with `EXPO_PUBLIC_API_URL` (e.g. `http://192.168.1.10:3000/api`).

## IoT firmware (`iot-voltwise/`)

PlatformIO project (`env:esp32dev`, Arduino framework) in a single `src/main.cpp`.
It reads a **PZEM-004T v3.0** power sensor over `Serial2` (RX 16 / TX 17) every
2 s and drives a 2-channel relay module (pins 25/26, **active-LOW**, both
channels switched together as a master) with a safety cutoff at
`MAX_ALLOWED_POWER_WATTS` and a 30 s auto-shutdown countdown. It publishes
telemetry to HiveMQ Cloud over TLS MQTT and accepts remote relay commands (see
"MQTT / IoT layer" below). Credentials live in `include/secrets.h` (gitignored;
copy from `include/secrets.h.example`). `DIAGNOSTIC_MODE` (on by default) prints
raw readings + the PZEM slave address to separate UART faults from AC-power
issues. See `docs/esp32_pzem_relay_iot_build_guide.md` for the wiring guide and
§13 there for the MQTT design.

```bash
pio run                   # build (from iot-voltwise/)
pio run -t upload         # flash the ESP32
pio device monitor        # serial monitor at 115200 baud
```

## ML service (`ml-voltwise/`)

FastAPI + scikit-learn KMeans service, currently a **scaffold**: `app/main.py`,
`train.py`, and `feature_engineering.py` are empty stubs; `artifacts/` holds a
pre-trained `kmeans_pipeline.joblib` + `cluster_profiles.csv`. The intended
design is in `docs/voltwise_kmeans_fastapi_guide.md` and
`docs/voltwise_model_service_guide.md`. Dependencies: `pip install -r requirements.txt`.

## Key architectural patterns

### Authentication (JWT + middleware)

Auth is real. The `auth` module hashes passwords with bcrypt and issues a JWT
(`src/lib/jwt.ts`, 7-day expiry, signed with `JWT_SECRET_KEY`). `POST /auth/register`
and `POST /auth/login` return `{ token, user }`; `GET /auth/me` and `PATCH /auth/me`
(profile edit) are protected. The `requireAuth` middleware (`src/middleware/auth.middleware.ts`)
guards `/devices`, `/dashboard`, `/alerts`, `/analytics` — each derives `userId` from
`req.user.id` (set by the middleware) and scopes all Prisma queries to it, so data is
**per-user** (a freshly registered account starts empty). Errors use `AppError`
(`src/lib/AppError.ts`); the global handler in `index.ts` honors `error.statusCode`.

The app stores the JWT via `lib/auth-storage.ts` (expo-secure-store on native,
localStorage on web), `lib/api.ts` attaches `Authorization: Bearer` and emits
`AUTH_UNAUTHORIZED_EVENT` on 401, and `context/AuthContext.tsx` drives sign-in/up/out +
the `app/(auth)` login/register screens and `app/profile.tsx`.

The seed (`npm run seed`) creates a loginable demo account with the rich demo dataset:
**`demo@voltwise.app` / `password123`**.

### EnergyReading dual-use

The `EnergyReading` table serves two purposes distinguished by `deviceId`:

- `deviceId = null` → whole-home aggregate readings (used by dashboard history and today's kWh total)
- `deviceId != null` → per-device readings (used by top-consumers and analytics breakdown)

When querying this table, always filter on `deviceId` intentionally.

### MQTT / IoT layer

All three tiers share one topic contract, keyed by a device UID (default
`esp32-01`; firmware `DEVICE_UID` in `include/secrets.h`, backend
`MQTT_DEVICE_UID`, app `EXPO_PUBLIC_MQTT_DEVICE_UID` — they must match):

| Topic                        | Direction           | Retained | Payload                                             |
| ---------------------------- | ------------------- | -------- | --------------------------------------------------- |
| `voltwise/<uid>/telemetry`   | ESP32 → subscribers | no       | PZEM JSON every ~2 s (keys mirror `EnergyReading`)  |
| `voltwise/<uid>/relay/state` | ESP32 → subscribers | yes      | `{ on, reason: boot\|remote\|overpower\|countdown }` |
| `voltwise/<uid>/relay/set`   | backend → ESP32     | no       | `{ on: boolean }` (master — both channels together)  |
| `voltwise/<uid>/status`      | LWT                 | yes      | `"online"` / `"offline"`                             |

- **Broker:** HiveMQ Cloud. ESP32 + backend connect on 8883 (TLS), the app on
  8884 (`wss://…/mqtt`). Credentials live only in gitignored files
  (`backend/.env`, `app-voltwise/.env`, `iot-voltwise/include/secrets.h`).
- **Backend:** `src/lib/mqtt.ts` is the client singleton — started from
  `index.ts`, it ingests telemetry into `EnergyReading` (whole-home,
  `deviceId: null`, owned by `MQTT_INGEST_USER_EMAIL`, default the demo
  account) and holds in-memory device state. The `iot` module wraps it:
  `POST /api/iot/relay` publishes commands (JWT-protected — the app never
  publishes to MQTT directly), `GET /api/iot/status` reports last-known state.
- **App:** `context/MqttContext.tsx` (`useMqtt()`) subscribes read-only for
  live dashboard telemetry and relay state; the dashboard's Master Power card
  toggles the relay optimistically via the REST endpoint and reconciles when
  the firmware confirms on `relay/state`.
- **Firmware semantics:** a remote OFF latches power off; a remote ON clears
  the latch and suppresses the auto-shutdown countdown until current drops
  once (`remoteOverride`). The over-power cutoff is never overridable.
- A retained `"online"` status can outlive a crashed device — both backend and
  app cross-check telemetry age (≤15 s / ≤10 s) before reporting the device
  online.

### Alert event bus

`lib/api.ts` exports `ALERTS_CHANGED_EVENT` and `emitAlertsChanged()`. Any code that creates or reads alerts should call `emitAlertsChanged()` after a mutation so that the tab badge count and alert list update without a full reload. The `_layout.tsx` tab bar subscribes to this event to drive the unread badge.

### DemoFab

`components/DemoFab.tsx` is a floating action button (flask icon, bottom-right) that POSTs preset alert payloads to `/api/alerts` to exercise the full alert flow during demos. It opens `AnomalyModal` locally before the API call resolves so the UX is instant.

## Known issue

`app/(tabs)/dashboard.tsx` and `analytics.tsx` show TypeScript JSX errors
("'View' cannot be used as a JSX component", FlatList overloads). These are
**false positives** from `react-native-chart-kit`/`react-native-svg` bundling a
legacy `@types/react@16`; they don't affect runtime (Babel strips types). Files
not importing those libs (`devices.tsx`, `alerts.tsx`, `lib/api.ts`) are clean.
