# VoltWise Backend

Express 5 + Prisma 7 + PostgreSQL REST API for the VoltWise smart energy monitoring app.

---

## Prerequisites

- Node.js 20+
- PostgreSQL running on `localhost:5432`
- A database named `voltwise_db` (user: `postgres`, password configured in `.env`)

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Run the database migration (creates all tables)
npx prisma migrate dev --name init_voltwise

# 3. Generate the Prisma client
npx prisma generate

# 4. Seed demo data (user, devices, 30 days of readings, alerts)
npm run seed

# 5. Start the dev server (with file watching)
npm run dev
```

The server starts on `http://localhost:3000`.

---

## NPM Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start with file-watch via `node --watch` + `ts-node/esm` |
| `npm run seed` | Wipe and repopulate the DB with demo data (idempotent) |
| `npm run add:module <name>` | Scaffold a new feature module under `src/modules/<name>/` |
| `npm run fresh:db` | Reset all migrations (destructive, dev only) |

---

## Environment Variables (`.env`)

```
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=voltwise_db
DATABASE_USER=postgres
DATABASE_PASSWORD=Danny12345
PORT=3000
```

---

## API Endpoints

All endpoints are prefixed with `/api`. All responses follow the shape:
- Success: `{ "success": true, "data": <payload> }`
- Error:   `{ "success": false, "message": "<human readable>" }`

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Returns `{ "status": "ok" }` |

### Dashboard

| Method | Path | Description |
|---|---|---|
| GET | `/api/dashboard?period=Day\|Week\|Month` | Live power summary, history chart, top consumers |

Response fields:
- `currentKw` — sum of ACTIVE device watts / 1000
- `totalTodayKwh` — whole-home kWh consumed today
- `devices` — array of `{ id, name, watts, active }`
- `history` — `{ labels: string[], data: number[] }` bucketed kWh
- `topConsumers` — array of `{ id, name, pct, color }`

### Devices

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/api/devices` | — | List all devices |
| POST | `/api/devices` | `{ icon, name, room, watts, enabled }` | Create device (room find-or-created) |
| PATCH | `/api/devices/:id` | any subset of above | Update device |
| DELETE | `/api/devices/:id` | — | Delete device |

Device response shape: `{ id, icon, name, room, status, watts, enabled }`

Status logic: `enabled && watts > 0 -> ACTIVE` | `enabled && watts == 0 -> IDLE` | `!enabled -> OFF`

### Alerts

| Method | Path | Description |
|---|---|---|
| GET | `/api/alerts` | All alerts, newest-first |
| PATCH | `/api/alerts/:id/read` | Mark one alert read |
| POST | `/api/alerts/read-all` | Mark all alerts read |

Alert response shape: `{ id, type, title, description, time, section, read, recommendation? }`
- `type`: `"critical"` or `"warning"` or `"info"` (lowercased)
- `time`: HH:mm from `createdAt`
- `section`: `"TODAY"` or `"YESTERDAY"`

### Analytics

| Method | Path | Description |
|---|---|---|
| GET | `/api/analytics?period=Day\|Week\|Month` | Bill predictor, kWh breakdown, top consumers |

Response fields:
- `billPredictor` — `{ tariff, currency, accumulatedKwh, estimatedBill, cycleStart }`
- `totalKwh` — total kWh for the selected period window
- `breakdown` — top 3 devices + "Others" with percentages and colors
- `topConsumers` — top 5 devices by kWh share

### Auth (MVP)

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/api/auth/register` | `{ email, name?, password? }` | Returns demo user |
| POST | `/api/auth/login` | `{ email, password? }` | Returns demo user |

---

## Module Structure

```
src/modules/<name>/
  <name>.routes.ts       Routes: HTTP method + path -> controller
  <name>.controller.ts   Request parsing, response shaping, next(error)
  <name>.service.ts      Business logic + Prisma queries (no req/res)
  <name>.dto.ts          TypeScript interfaces for request/response shapes
```

Scaffold a new module: `npm run add:module <name>`

---

## Seed Data Summary

| Entity | Count |
|---|---|
| Users | 1 (demo@voltwise.app) |
| Rooms | 5 (Bedroom, Living Room, Kitchen, Laundry, Bathroom) |
| Devices | 7 |
| Energy readings | ~4,410 (30 days x 24h, per-device + whole-home aggregate) |
| Alerts | 5 (mix of critical/warning/info, today + yesterday) |
| Tariff | 10.5 per kWh |
| Billing period | Jun 1 2026 open, 87.4 kWh accumulated |
