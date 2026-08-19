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
│   ├── app/         # (auth) login/register · (tabs) dashboard/devices/alerts/analytics · profile · settings + its sub-screens
│   ├── components/  # DemoFab, AnomalyModal, AlertDetailModal, ConfirmModal, DeleteAccountModal, AppLockOverlay, AppHeader
│   ├── context/     # Auth, Theme, AppLock, Units, Mqtt, Notification
│   └── lib/         # api.ts (typed client + shared types) + *-storage.ts / *-prefs.ts pairs
├── iot-voltwise/    # PlatformIO ESP32 firmware (PZEM-004T v3.0 + 2-channel relay + MQTT)
├── ml-voltwise/     # FastAPI KMeans service (scaffold: app/main.py, train.py are empty stubs)
├── docs/            # ERD, DATA_FLOW, SYSTEM_ARCHITECTURE + NILM/KMeans/ESP32 build guides
└── VOLTWISE_CORE_FEATURES.md
```

### Root commands (run from the repo root)

```bash
npm run install:all   # npm install in backend/ and app-voltwise/
npm run add:env:all   # copy both .env.example files to .env
npm run dev           # concurrently: backend API + Expo (app started with -c)
npm run dev:backend   # backend only
npm run dev:app       # Expo only
```

> The root `test` script is a placeholder — tests live in `backend/` only.

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
| `/export`    | export    | `GET /summary` row counts per dataset; `GET /:dataset` CSV/JSON download      |
| `/security`  | security  | `GET /overview` sessions + account safety; session revoke; account deletion   |
| `/health`    | —         | `GET /api/health` liveness check                                              |

The `export` module is the one place that does **not** wrap its success body in
`{ success, data }` — the response *is* the file (`text/csv` with a UTF-8 BOM, or
a JSON document). Errors still use the envelope. Row counts come from
`GET /export/summary?range=…` rather than response headers on the download, since
`Content-Disposition` and custom headers are not exposed to a cross-origin fetch;
that is also how the app learns a download would be clipped at `MAX_EXPORT_ROWS`
(20 000) before starting it. CSV serialization lives in `src/lib/csv.ts` and
guards against spreadsheet formula injection in user-authored strings.

## Mobile app (`app-voltwise/`)

- **Stack:** Expo SDK 54, React Native 0.81, React 19, expo-router (file-based tabs in `app/(tabs)`).
- **Data:** screens fetch from the backend through `lib/api.ts`, which auto-resolves the dev host from `expo-constants` and unwraps `{success,data}`. Each screen keeps local mock constants as an **offline-first fallback** and uses **optimistic updates** for writes.
- **Expo is versioned:** before writing app code, consult the exact docs at https://docs.expo.dev/versions/v54.0.0/.
- **Contexts wrap the whole app**, nested in this order in `app/_layout.tsx`:
  `ThemeProvider` → `AuthProvider` → `AppLockProvider` → `UnitsProvider` →
  `MqttProvider` → `NotificationProvider`. The order is load-bearing: theme must
  paint the lock overlay before anyone signs in, and units/MQTT/notifications all
  read `useAuth()`. Screens take colors from `useTheme()` and every kW/kWh/₱ string
  from `useUnits()` — don't hard-code either.

### App commands (run from `app-voltwise/`)

```bash
npm install
npx expo start            # open on device / emulator / web
npx expo start --android  # Android only
npx expo start --ios      # iOS only
npm run lint              # ESLint via expo lint
```

> The API base URL comes from `EXPO_PUBLIC_BASE_URL` (full URL including `/api`;
> defaults to `http://localhost:3000/api`). On a physical device set it to your
> dev machine's LAN IP, e.g. `http://192.168.1.10:3000/api`. Expo only exposes
> `EXPO_PUBLIC_*` vars, and only at bundle time — restart with `npx expo start --clear`
> after editing `.env`.

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
`train.py`, and `feature_engineering.py` are **empty (0-byte) files**; `artifacts/`
holds a pre-trained `kmeans_pipeline.joblib` + `cluster_profiles.csv` and `data/`
holds `raw/telemetry.csv` + `processed/windows.csv`. Nothing here is imported by
the backend. The intended
design is in `docs/voltwise_kmeans_fastapi_guide.md` and
`docs/voltwise_model_service_guide.md`. Dependencies: `pip install -r requirements.txt`.

## Key architectural patterns

### Authentication (JWT + middleware)

Auth is real. The `auth` module hashes passwords with bcrypt and issues a JWT
(`src/lib/jwt.ts`, 7-day expiry, signed with `JWT_SECRET_KEY`). Every token also
carries a `sid` claim naming a `Session` row, which is what makes it revocable —
see "Sessions" below. `POST /auth/register`
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

### Sessions (revocable tokens)

Each sign-in creates a `Session` row and embeds its id in the JWT as `sid`.
`requireAuth` loads that row on every protected request (`src/lib/sessions.ts` —
the only place session lifecycle belongs) and rejects a token whose session is
missing, revoked, expired or owned by a different user. That DB read is the
price of being able to end a session *before* its seven days are up; `lastSeenAt`
is refreshed at most once a minute so polling clients don't turn every GET into
a write.

Consequences worth remembering:

- **A token minted before this existed no longer works.** `verifyToken` throws
  for a payload with no `sid`, which the middleware turns into a 401 and the app
  turns into a sign-out. That is deliberate: an unrevocable token would be a
  permanent hole in "sign out everywhere".
- **Changing a password revokes every other session** (`auth.service.ts`), and a
  password *reset* revokes all of them. The caller's own session survives a
  change so nobody is ejected by their own action — the controller passes
  `req.sessionId` to identify it.
- `POST /login` and `/register` accept an optional `client: { label, platform }`
  used only to label the device in the list; it is sanitised in
  `describeClient` and falls back to a User-Agent parse.
- The `security` module reads and revokes sessions, and deletes accounts
  (password re-checked, everything cascades from `User`). Both revoke endpoints
  return a fresh overview so the client never has to re-fetch into a race.

### App lock (device-local)

`context/AppLockContext.tsx` gates the signed-in app behind biometrics or the
device passcode (expo-local-authentication; Android/iOS only). Two rules keep it
from becoming a trap: it never engages while signed out, and it never engages
when the device cannot verify anyone — if the owner removes their fingerprints
the preference stays on but goes dormant, and Privacy & Security says so. The
timing rule (`lib/applock-prefs.ts::shouldLockOnResume`) is pure so it can be
reasoned about separately from the AppState plumbing; `components/AppLockOverlay.tsx`
renders above the navigator and always offers sign-out as an escape hatch.

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
- **Pairing:** the app's UID is not fixed to the build. Settings → Sensor & IoT
  (`app/iot-settings.tsx`) re-pairs the install to another board, persisted
  device-locally via `lib/iot-storage.ts`; the provider tears down and rebuilds
  the device subscription on change. A standing subscription to
  `voltwise/+/status` lists every board on the broker (retained statuses make
  discovery passive). The backend keeps ingesting from its own
  `MQTT_DEVICE_UID`, which `GET /api/iot/status` reports as `deviceUid` so the
  screen can warn when the two disagree. Topic building, UID validation and the
  live/stale/offline verdict live in `lib/iot-prefs.ts`.
- **Firmware semantics:** a remote OFF latches power off; a remote ON clears
  the latch and suppresses the auto-shutdown countdown until current drops
  once (`remoteOverride`). The over-power cutoff is never overridable.
- A retained `"online"` status can outlive a crashed device — both backend and
  app cross-check telemetry age (≤15 s / ≤10 s) before reporting the device
  online.

### New-load detection (MQTT → alert)

`src/lib/loadDetector.ts` is a **pure, I/O-free step-change detector** fed one
telemetry sample at a time from the MQTT handler. A sustained jump above the
rolling EMA baseline (`LOAD_DETECT_DELTA_WATTS`, held for
`LOAD_DETECT_SUSTAIN_SAMPLES` readings ~2 s apart, rate-limited by
`LOAD_DETECT_COOLDOWN_MS`) is the signature of an appliance switching on, so the
backend writes an INFO `Alert` for the ingest account suggesting the user add a
device. Purity is the point — it holds all state in a factory closure, so
`test/loadDetector.test.ts` drives it directly with no broker or DB. Detection
never blocks ingestion: alert creation is fire-and-forget. Disable with
`LOAD_DETECT_ENABLED=false`.

### Tariff lookup

`src/lib/tariff.ts::getLatestTariff(userId)` is the single source of the user's
rate — most-recent `Tariff` by `effectiveFrom`, falling back to **10.5 ₱/kWh**.
Dashboard, analytics, and devices all go through it so cost figures agree; don't
re-query `Tariff` or inline a rate.

### Device photos

`src/lib/upload.ts` configures multer to store device images on local disk in
`backend/uploads/` (5 MB cap, jpeg/png/webp only, filenames embedding device id +
timestamp). `index.ts` serves that folder statically at `/uploads`, so a stored
`imageUri` like `/uploads/device-3-….jpg` resolves for the app. There is no
object storage — the folder is the bucket.

### Notifications are local, not push

`context/NotificationContext.tsx` runs the banner engine **in JS**, so it only
fires while the app is alive: on an `ALERTS_CHANGED_EVENT`, or via a catch-up
sweep when the app returns to the foreground. Swipe the app away and the MQTT
socket dies with it — nothing arrives until next launch. Real background delivery
would need remote push, a dev build, and backend token storage; don't describe the
current behaviour as push. The decision rules (severity filter, quiet hours,
high-water mark for "already notified") are pure functions in
`lib/notification-rules.ts`, separate from the delivery plumbing.

### Alert event bus

`lib/api.ts` exports `ALERTS_CHANGED_EVENT` and `emitAlertsChanged()`. Any code that creates or reads alerts should call `emitAlertsChanged()` after a mutation so that the tab badge count and alert list update without a full reload. The `_layout.tsx` tab bar subscribes to this event to drive the unread badge.

### DemoFab

`components/DemoFab.tsx` is a floating action button (flask icon, bottom-right) that POSTs preset alert payloads to `/api/alerts` to exercise the full alert flow during demos. It opens `AnomalyModal` locally before the API call resolves so the UX is instant.

### Device-local storage

Preferences that belong to the phone rather than the account live in
`lib/*-storage.ts` (SecureStore on native, localStorage on web) — theme, units,
notifications, sensor pairing, app lock. `lib/local-data.ts` is the **inventory of every
one of those keys**, and Settings → Data & Export resets them through it. A new
storage key must be added there too, or it will silently survive a reset
forever. The JWT is deliberately excluded (clearing it is signing out) and
nothing in that module touches the server. Note the ownership split
`context/UnitsContext.tsx` documents: the tariff and currency are account data,
so a device reset restores the display units but leaves the rate alone.

## Known issue

`app/(tabs)/dashboard.tsx` and `analytics.tsx` show TypeScript JSX errors
("'View' cannot be used as a JSX component", FlatList overloads). These are
**false positives** from `react-native-chart-kit`/`react-native-svg` bundling a
legacy `@types/react@16`; they don't affect runtime (Babel strips types). Files
not importing those libs (`devices.tsx`, `alerts.tsx`, `lib/api.ts`) are clean.
