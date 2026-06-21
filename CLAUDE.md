# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**VoltWise** is a capstone project: a smart energy tracking & monitoring system.
The repo holds the **mobile MVP** — an Expo React Native app backed by a modular
Express + Prisma + PostgreSQL API. The physical IoT layer (sensors/MCU/MQTT) is
out of scope for the MVP and is simulated by a database seed.

See `VOLTWISE_CORE_FEATURES.md` for the product feature set and `docs/` for the
ERD, data flow, and system architecture diagrams.

## Structure

```
voltwise/
├── backend/        # Express 5 + Prisma 7 API (TypeScript, ESM)
│   ├── prisma/     # schema.prisma, seed.ts, migrations/
│   └── src/        # index.ts, routes/, lib/prisma.ts, configs/, modules/<feature>/
├── voltwise/       # Expo React Native app (expo-router)
│   ├── app/(tabs)/ # dashboard · devices · alerts · analytics screens
│   ├── components/ # DemoFab, AnomalyModal, Collapsible
│   ├── lib/api.ts  # typed API client + shared response types
│   └── assets/
├── docs/           # ERD.md, DATA_FLOW.md, SYSTEM_ARCHITECTURE.md
├── README.md
└── VOLTWISE_CORE_FEATURES.md
```

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
```

> No test runner is configured — `npm test` is a placeholder that exits 1.
> `npm run add:module <name>` (alias for `node scripts/createModule.js`) scaffolds a module from the `sample/` template.

### API routes

All routes are prefixed with `/api`:

| Prefix         | Module    | Purpose                                    |
| -------------- | --------- | ------------------------------------------ |
| `/auth`      | auth      | `POST /register`, `POST /login` (public); `GET /me`, `PATCH /me` (protected) |
| `/devices`   | devices   | CRUD for smart devices                     |
| `/dashboard` | dashboard | Live summary (kW, kWh, history, consumers) |
| `/alerts`    | alerts    | Alert management;`POST /` creates alerts |
| `/analytics` | analytics | Bill prediction, kWh breakdown, metrics    |
| `/health`    | —        | `GET /api/health` liveness check         |

## Mobile app (`voltwise/`)

- **Stack:** Expo SDK 54, React Native 0.81, React 19, expo-router (file-based tabs in `app/(tabs)`).
- **Data:** screens fetch from the backend through `lib/api.ts`, which auto-resolves the dev host from `expo-constants` and unwraps `{success,data}`. Each screen keeps local mock constants as an **offline-first fallback** and uses **optimistic updates** for writes.
- **Expo is versioned:** before writing app code, consult the exact docs at https://docs.expo.dev/versions/v54.0.0/ (see `voltwise/AGENTS.md`).

### App commands (run from `voltwise/`)

```bash
npm install
npx expo start            # open on device / emulator / web
npx expo start --android  # Android only
npx expo start --ios      # iOS only
npm run lint              # ESLint via expo lint
```

> On a physical device, `lib/api.ts` derives the LAN IP automatically. Override with `EXPO_PUBLIC_API_URL` (e.g. `http://192.168.1.10:3000/api`).

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
