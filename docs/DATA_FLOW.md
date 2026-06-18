# VoltWise — Data Flow

How energy data travels from its source, through the backend, into the database,
and out to the mobile app for rendering. For the MVP the physical IoT layer is
**simulated by a seed script** (the dashed path); the rest of the pipeline is
production-shaped and unchanged for when real sensors come online.

## End-to-end data flow

```mermaid
flowchart LR
    subgraph IoT["🔌 IoT Layer (simulated in MVP)"]
        direction TB
        SENSOR["Power sensors /<br/>microcontroller"]
        SEED["prisma/seed.ts<br/>(mock data generator)"]
        SENSOR -. "MQTT (future)" .-> INGEST
        SEED ==> DB
    end

    subgraph BE["🖥️ Backend (Express + Prisma)"]
        direction TB
        INGEST["Ingestion<br/>(future MQTT bridge)"]
        SVC["Service layer<br/>aggregation + business rules"]
        API["REST API  /api/*"]
        INGEST --> DB
        DB --> SVC --> API
    end

    DB[("🗄️ PostgreSQL<br/>voltwise_db")]

    subgraph APP["📱 Expo React Native App"]
        direction TB
        CLIENT["lib/api.ts<br/>fetch + unwrap {success,data}"]
        STATE["Screen state<br/>(useState / useEffect)"]
        UI["Dashboard · Devices ·<br/>Alerts · Analytics"]
        FALLBACK["Local mock fallback<br/>(offline-first)"]
        CLIENT --> STATE --> UI
        FALLBACK -. "on fetch failure" .-> STATE
    end

    API -- "HTTP/JSON over LAN" --> CLIENT
    UI -- "user actions<br/>(add device, toggle, mark read)" --> CLIENT
    CLIENT -- "POST / PATCH / DELETE" --> API
```

## Read path — loading the dashboard

```mermaid
sequenceDiagram
    participant U as User
    participant App as Expo App (DashboardScreen)
    participant C as lib/api.ts
    participant R as Express Router /api
    participant S as dashboard.service
    participant DB as PostgreSQL

    U->>App: Open Dashboard
    App->>C: api.get("/dashboard?period=Day")
    C->>R: GET /api/dashboard?period=Day
    R->>S: getDashboardData("Day")
    S->>DB: aggregate EnergyReading + read Device
    DB-->>S: rows
    S-->>R: { currentKw, totalTodayKwh, devices, history, topConsumers }
    R-->>C: { success: true, data: {...} }
    C-->>App: unwrapped data
    App->>App: setDashboard(data) → re-render charts/cards
    Note over App: If the request fails,<br/>seeded mock constants render instead.
```

## Write path — toggling a device (optimistic UI)

```mermaid
sequenceDiagram
    participant U as User
    participant App as DevicesScreen
    participant C as lib/api.ts
    participant API as /api/devices/:id
    participant DB as PostgreSQL

    U->>App: Flip device switch OFF
    App->>App: Optimistically set status OFF, watts 0
    App->>C: api.patch("/devices/42", { enabled:false })
    C->>API: PATCH /api/devices/42
    API->>DB: UPDATE Device (status, watts)
    DB-->>API: updated row
    API-->>C: { success:true, data: device }
    C-->>App: reconcile state with server record
    Note over App: On failure the optimistic<br/>state is kept (offline tolerant).
```

## Mock data lifecycle (MVP)

```mermaid
flowchart TD
    A["npm run seed"] --> B["Wipe demo rows (FK-safe order)"]
    B --> C["Create User, Tariff, BillingPeriod"]
    C --> D["Create 5 Rooms + 7 Devices"]
    D --> E["Generate ~4,400 EnergyReading rows<br/>(hourly, ~30 days, per device + whole-home)"]
    E --> F["Create 5 Alerts (today + yesterday)"]
    F --> G["DB ready → API serves real aggregates"]
```

## Key data contracts (backend → app)

All responses are wrapped as `{ "success": true, "data": <payload> }`; the app's
`lib/api.ts` transparently unwraps `data`.

| Endpoint | Payload shape (the `data`) |
|---|---|
| `GET /api/dashboard?period=` | `{ currentKw, totalTodayKwh, devices[], history{labels,data}, topConsumers[] }` |
| `GET /api/devices` | `[{ id, icon, name, room, status, watts, enabled }]` |
| `POST/PATCH/DELETE /api/devices/:id` | created/updated device or `{ success }` |
| `GET /api/alerts` | `[{ id, type, title, description, time, section, read, recommendation? }]` |
| `PATCH /api/alerts/:id/read`, `POST /api/alerts/read-all` | updated alert / `{ success }` |
| `GET /api/analytics?period=` | `{ billPredictor{...}, totalKwh, breakdown[], topConsumers[] }` |
| `GET /api/health` | `{ status: "ok" }` |
