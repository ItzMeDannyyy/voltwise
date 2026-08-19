// Documentation only: Database seed script for VoltWise.
// Wipes and repopulates the database with realistic demo data for development/testing.
// Run with: npm run seed
// This script is idempotent — running it multiple times produces the same state.

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { DATABASE_URL } from "../src/configs/database.ts";
import { DeviceStatus, AlertType } from "../src/generated/prisma/index.js";

// The plaintext password for the seeded demo account.
// Logged at the end of the seed so developers know what to use on first login.
const DEMO_USER_PASSWORD = "password123";

// ─── Prisma Client Setup ───────────────────────────────────────────────────────

const connectionString = DATABASE_URL();
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// ─── Color palette used for seeding (mirrors the app's chart colors) ──────────

// A fixed palette used when generating alert descriptions and test data.
// Not directly stored in the DB — just used for clarity here.

// ─── Date Helpers ─────────────────────────────────────────────────────────────

// Documentation only: Returns a Date that is `daysAgo` days before now,
// at the specified hour of that day.
// Accepts daysAgo (number) and hour (number, 0–23).
// Returns a Date.
const dateAtHour = (daysAgo: number, hour: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, Math.floor(Math.random() * 59), 0, 0);
  return date;
};

// Documentation only: Returns a random float between min and max, rounded to 3 decimal places.
// Accepts min (number) and max (number).
// Returns a number.
const randomBetween = (min: number, max: number): number => {
  return parseFloat((Math.random() * (max - min) + min).toFixed(3));
};

// Documentation only: Mirrors deriveDeviceStatus in devices.service.ts — an
// enabled device drawing watts is ACTIVE, enabled at 0 W is IDLE, disabled is
// OFF. The seed derives status from intent rather than hardcoding it so demo
// data can never contradict the rule the API applies.
//
// UNPOWERED is deliberately never seeded: it describes the master relay being
// open right now, which is a live condition reconciled from MQTT, not a fact
// about the demo dataset.
const deriveDeviceStatus = (enabled: boolean, watts: number): DeviceStatus => {
  if (!enabled) return DeviceStatus.OFF;
  if (watts > 0) return DeviceStatus.ACTIVE;
  return DeviceStatus.IDLE;
};

// ─── Seed Execution ───────────────────────────────────────────────────────────

// Documentation only: Main seed function — deletes all existing data in FK-safe order
// then recreates the full demo dataset. Logs each major step to the console.
// Accepts no parameters.
// Returns a Promise<void>.
async function seed(): Promise<void> {
  console.log("Starting VoltWise seed...");

  // ── 1. Wipe existing data in FK-safe order ──────────────────────────────────
  console.log("Wiping existing data...");
  await prisma.alert.deleteMany();
  await prisma.energyReading.deleteMany();
  await prisma.device.deleteMany();
  await prisma.room.deleteMany();
  await prisma.billingPeriod.deleteMany();
  await prisma.tariff.deleteMany();
  await prisma.user.deleteMany();

  // Reset all auto-increment sequences back to 1 so that the demo user gets id=1
  // and subsequent new user registrations start from id=2.
  // Without this, PostgreSQL keeps the sequence at the highest previously-used value,
  // which causes a unique constraint violation on the first register after a re-seed.
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "User_id_seq" RESTART WITH 1`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "Room_id_seq" RESTART WITH 1`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "Device_id_seq" RESTART WITH 1`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "Tariff_id_seq" RESTART WITH 1`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "BillingPeriod_id_seq" RESTART WITH 1`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "EnergyReading_id_seq" RESTART WITH 1`);
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "Alert_id_seq" RESTART WITH 1`);

  console.log("Existing data wiped and sequences reset.");

  // ── 2. Demo User ────────────────────────────────────────────────────────────
  console.log("Creating demo user...");

  // Hash the demo password so the seeded account is immediately loginable
  // via POST /api/auth/login with { email: "demo@voltwise.app", password: "password123" }.
  const demoPasswordHash = await bcrypt.hash(DEMO_USER_PASSWORD, 10);

  const demoUser = await prisma.user.create({
    data: {
      // No explicit id: let the (just-reset) sequence assign id=1 and advance to 2,
      // so the first real registration gets id=2 instead of colliding on id=1.
      email: "demo@voltwise.app",
      name: "Demo User",
      // Intentional: the seed sets firstName/lastName directly via Prisma rather
      // than calling registerUser(), so it intentionally bypasses the strong-password
      // policy. The demo password ("password123") is only 11 chars and would fail
      // the policy, but the seeded account must remain loginable for demos.
      firstName: "Demo",
      lastName: "User",
      currency: "₱",
      passwordHash: demoPasswordHash,
    },
  });
  console.log(`  Created user: ${demoUser.email} (id=${demoUser.id})`);

  // ── 3. Tariff ────────────────────────────────────────────────────────────────
  console.log("Creating tariff...");
  const tariff = await prisma.tariff.create({
    data: {
      userId: demoUser.id,
      ratePerKwh: 10.5,
      currency: "₱",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  console.log(`  Created tariff: ₱${tariff.ratePerKwh}/kWh`);

  // ── 4. Rooms ──────────────────────────────────────────────────────────────────
  console.log("Creating rooms...");
  const roomNames = ["Bedroom", "Living Room", "Kitchen", "Laundry", "Bathroom"];
  const createdRooms = await Promise.all(
    roomNames.map((name) =>
      prisma.room.create({ data: { userId: demoUser.id, name } })
    )
  );

  // Build a lookup map for easy reference: "Living Room" → Room record
  const roomByName = new Map(createdRooms.map((r) => [r.name, r]));
  console.log(`  Created ${createdRooms.length} rooms.`);

  // ── 5. Devices ──────────────────────────────────────────────────────────────
  console.log("Creating devices...");

  // Device definitions matching the spec exactly.
  const deviceDefinitions = [
    {
      name: "Air Conditioner",
      icon: "❄️",
      category: "Climate",
      roomName: "Bedroom",
      ratedWatts: 1200,
      enabled: true,
    },
    {
      name: "Living Room Lights",
      icon: "💡",
      category: "Lighting",
      roomName: "Living Room",
      ratedWatts: 340,
      enabled: true,
    },
    {
      name: "Smart TV",
      icon: "🖥️",
      category: "Entertainment",
      roomName: "Living Room",
      ratedWatts: 0,
      enabled: true,
    },
    {
      name: "Kitchen Appliances",
      icon: "🍳",
      category: "Kitchen",
      roomName: "Kitchen",
      ratedWatts: 860,
      enabled: true,
    },
    {
      name: "Washing Machine",
      icon: "🧺",
      category: "Laundry",
      roomName: "Laundry",
      ratedWatts: 0,
      enabled: false,
    },
    {
      name: "Refrigerator",
      icon: "🧊",
      category: "Kitchen",
      roomName: "Kitchen",
      ratedWatts: 180,
      enabled: true,
    },
    {
      name: "Water Heater",
      icon: "🚿",
      category: "Bathroom",
      roomName: "Bathroom",
      ratedWatts: 1500,
      enabled: true,
    },
  ] as const;

  const createdDevices = await Promise.all(
    deviceDefinitions.map((def) =>
      prisma.device.create({
        data: {
          userId: demoUser.id,
          roomId: roomByName.get(def.roomName)!.id,
          name: def.name,
          category: def.category,
          ratedWatts: def.ratedWatts,
          status: deriveDeviceStatus(def.enabled, def.ratedWatts),
          enabled: def.enabled,
        },
      })
    )
  );

  const deviceByName = new Map(createdDevices.map((d) => [d.name, d]));
  console.log(`  Created ${createdDevices.length} devices.`);

  // ── 6. Energy Readings — 30 days of hourly data ────────────────────────────
  console.log("Generating energy readings (this may take a moment)...");

  // Only ACTIVE devices generate per-device readings at their rated wattage.
  const activeDevices = createdDevices.filter(
    (d) => d.status === DeviceStatus.ACTIVE
  );

  // Base hourly kWh per device: watts / 1000 (one hour of consumption).
  const deviceBaseKwhPerHour = new Map(
    activeDevices.map((d) => [d.id, d.ratedWatts / 1000])
  );

  // IDLE/OFF devices still draw a small standby load in real life (a TV's
  // standby circuit, a washer's control board) — give them a tiny wattage so
  // they still show up with (near-zero) consumption and cost instead of being
  // invisible in top consumers / device history.
  const STANDBY_WATTS: Record<string, number> = {
    "Smart TV": 4,
    "Washing Machine": 1,
  };
  const standbyDevices = createdDevices.filter(
    (d) => STANDBY_WATTS[d.name] !== undefined
  );

  const allReadings: {
    deviceId: number | null;
    userId: number;
    timestamp: Date;
    watts: number;
    kwh: number;
    voltage: number;
    current: number;
    frequency: number;
    powerFactor: number;
  }[] = [];

  // Generate readings for every hour over the past 30 days.
  const DAYS_OF_HISTORY = 30;
  const HOURS_PER_DAY = 24;

  // Snapshot "now" once so every generated timestamp — and the billing period
  // computed from them below — is anchored to the same moment.
  const now = new Date();

  for (let daysAgo = DAYS_OF_HISTORY; daysAgo >= 0; daysAgo--) {
    for (let hour = 0; hour < HOURS_PER_DAY; hour++) {
      // Skip future hours on today.
      if (daysAgo === 0 && hour > now.getHours()) {
        continue;
      }

      const timestamp = new Date(now);
      timestamp.setDate(timestamp.getDate() - daysAgo);
      timestamp.setHours(hour, 0, 0, 0);

      // Usage multiplier: higher during peak hours (7am–10pm), lower at night.
      const isPeakHour = hour >= 7 && hour <= 22;
      const usageMultiplier = isPeakHour
        ? randomBetween(0.85, 1.15)  // near-full usage during the day
        : randomBetween(0.1, 0.4);   // reduced usage at night

      let hourlyTotalKwh = 0;
      let hourlyTotalWatts = 0;

      // Per-device readings for each active device.
      for (const device of activeDevices) {
        const baseKwh = deviceBaseKwhPerHour.get(device.id) ?? 0;
        const adjustedKwh = parseFloat(
          (baseKwh * usageMultiplier).toFixed(4)
        );
        const adjustedWatts = parseFloat(
          (device.ratedWatts * usageMultiplier).toFixed(1)
        );

        // Derive current from power and voltage with a small jitter to simulate
        // real sensor noise. Clamp the result to a sane household appliance range.
        const deviceVoltage = randomBetween(218, 224);
        const deviceCurrentBase = adjustedWatts / deviceVoltage;
        const deviceCurrent = parseFloat(
          (deviceCurrentBase + randomBetween(-0.05, 0.05)).toFixed(3)
        );

        allReadings.push({
          deviceId: device.id,
          userId: demoUser.id,
          timestamp,
          watts: adjustedWatts,
          kwh: adjustedKwh,
          voltage: deviceVoltage,
          current: Math.max(0, deviceCurrent),
          frequency: randomBetween(59.8, 60.2),
          powerFactor: randomBetween(0.85, 0.99),
        });

        hourlyTotalKwh += adjustedKwh;
        hourlyTotalWatts += adjustedWatts;
      }

      // Per-device standby readings for IDLE/OFF devices (tiny, roughly
      // constant load — no peak/off-peak swing since nothing is "in use").
      for (const device of standbyDevices) {
        const standbyWatts = STANDBY_WATTS[device.name]!;
        const jitteredWatts = parseFloat(
          (standbyWatts * randomBetween(0.85, 1.15)).toFixed(2)
        );
        const standbyKwh = parseFloat((jitteredWatts / 1000).toFixed(4));

        const deviceVoltage = randomBetween(218, 224);
        const deviceCurrentBase = jitteredWatts / deviceVoltage;
        const deviceCurrent = parseFloat(
          (deviceCurrentBase + randomBetween(-0.01, 0.01)).toFixed(3)
        );

        allReadings.push({
          deviceId: device.id,
          userId: demoUser.id,
          timestamp,
          watts: jitteredWatts,
          kwh: standbyKwh,
          voltage: deviceVoltage,
          current: Math.max(0, deviceCurrent),
          frequency: randomBetween(59.8, 60.2),
          // Standby loads (switch-mode power supplies at low load) tend to
          // have a poorer power factor than the appliance running normally.
          powerFactor: randomBetween(0.5, 0.7),
        });

        hourlyTotalKwh += standbyKwh;
        hourlyTotalWatts += jitteredWatts;
      }

      // Whole-home aggregate reading (deviceId = null).
      // Voltage and current reflect the whole-home load on the incoming line.
      // Power factor uses a slightly lower band for the aggregate since mixed loads
      // (motors + resistive) tend to pull the combined PF down a bit.
      const aggregateVoltage = randomBetween(218, 224);
      const aggregateTotalWatts = parseFloat(hourlyTotalWatts.toFixed(1));
      const aggregateCurrentBase = aggregateTotalWatts / aggregateVoltage;
      const aggregateCurrent = parseFloat(
        (aggregateCurrentBase + randomBetween(-0.1, 0.1)).toFixed(3)
      );

      allReadings.push({
        deviceId: null,
        userId: demoUser.id,
        timestamp,
        watts: aggregateTotalWatts,
        kwh: parseFloat(hourlyTotalKwh.toFixed(4)),
        voltage: aggregateVoltage,
        current: Math.max(0, aggregateCurrent),
        frequency: randomBetween(59.8, 60.2),
        powerFactor: randomBetween(0.80, 0.95),
      });
    }
  }

  // Batch-insert in chunks of 500 to avoid overwhelming the DB.
  const BATCH_SIZE = 500;
  for (let i = 0; i < allReadings.length; i += BATCH_SIZE) {
    const chunk = allReadings.slice(i, i + BATCH_SIZE);
    await prisma.energyReading.createMany({ data: chunk });
  }

  // ── 7. Billing Period ────────────────────────────────────────────────────────
  // accumulatedKwh/estimatedCost are derived from the whole-home aggregate
  // readings actually generated above (summed from the start of the current
  // month to now), instead of a disconnected hand-typed figure — so the
  // Analytics "Estimated Bill" reflects the same data every other screen
  // (dashboard totals, top consumers, breakdown) is built from.
  console.log("Creating billing period...");
  const billingPeriodStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
    0,
    0,
    0,
    0
  );
  const accumulatedKwh = parseFloat(
    allReadings
      .filter((r) => r.deviceId === null && r.timestamp >= billingPeriodStart)
      .reduce((sum, r) => sum + r.kwh, 0)
      .toFixed(2)
  );
  const billingPeriod = await prisma.billingPeriod.create({
    data: {
      userId: demoUser.id,
      startDate: billingPeriodStart,
      endDate: null, // open — still ongoing
      accumulatedKwh,
      estimatedCost: parseFloat((tariff.ratePerKwh * accumulatedKwh).toFixed(2)),
      tariffRate: tariff.ratePerKwh,
    },
  });
  console.log(
    `  Created billing period: ${billingPeriodStart.toDateString()} → open (${billingPeriod.accumulatedKwh} kWh, est. ${tariff.currency}${billingPeriod.estimatedCost})`
  );

  // Insert one reading timestamped right now so the IoT liveness check (5-minute
  // window) passes immediately after seeding. In production the sensor pushes
  // readings every few seconds; this reading simulates that "latest" push.
  const liveWatts = activeDevices.reduce((sum, d) => sum + d.ratedWatts, 0);
  const liveVoltage = randomBetween(218, 224);
  await prisma.energyReading.create({
    data: {
      userId: demoUser.id,
      deviceId: null,
      timestamp: new Date(),
      watts: liveWatts,
      kwh: parseFloat((liveWatts / 1000).toFixed(4)),
      voltage: liveVoltage,
      current: parseFloat((liveWatts / liveVoltage).toFixed(3)),
      frequency: randomBetween(59.8, 60.2),
      powerFactor: randomBetween(0.80, 0.95),
    },
  });

  console.log(
    `  Generated ${allReadings.length} energy readings (${DAYS_OF_HISTORY} days x ${HOURS_PER_DAY}h + per-device) + 1 live reading.`
  );

  // ── 8. Alerts ────────────────────────────────────────────────────────────────
  console.log("Creating alerts...");

  const acDevice = deviceByName.get("Air Conditioner")!;
  const waterHeaterDevice = deviceByName.get("Water Heater")!;
  const fridgeDevice = deviceByName.get("Refrigerator")!;

  // Alert timestamps: some today, some yesterday.
  const todayAt = (hour: number, minute: number): Date => {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  const yesterdayAt = (hour: number, minute: number): Date => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  await prisma.alert.createMany({
    data: [
      {
        userId: demoUser.id,
        deviceId: acDevice.id,
        type: AlertType.CRITICAL,
        title: "Air Conditioner exceeded threshold",
        description:
          "Air Conditioner has consumed over 3 kW in the last hour, triggering the critical energy threshold.",
        recommendation:
          "Check AC thermostat settings or filter blockage. Consider raising the set temperature by 1–2°C.",
        threshold: 3.0,
        value: 3.24,
        read: false,
        createdAt: todayAt(14, 32),
      },
      {
        userId: demoUser.id,
        deviceId: waterHeaterDevice.id,
        type: AlertType.WARNING,
        title: "High water heater usage detected",
        description:
          "Water Heater has been running for over 45 minutes continuously, which is above the normal cycle.",
        recommendation:
          "Verify the water heater thermostat is set correctly. A faulty heating element may cause extended cycles.",
        threshold: 45,
        value: 52,
        read: false,
        createdAt: todayAt(9, 15),
      },
      {
        userId: demoUser.id,
        deviceId: null,
        type: AlertType.INFO,
        title: "Monthly bill estimate updated",
        description:
          "Based on current usage, your estimated electricity bill for June 2026 is ₱917.70.",
        recommendation: null,
        read: true,
        createdAt: todayAt(8, 0),
      },
      {
        userId: demoUser.id,
        deviceId: acDevice.id,
        type: AlertType.WARNING,
        title: "Air Conditioner running overnight",
        description:
          "Air Conditioner was active from 11 PM to 6 AM — overnight usage increases your daily bill significantly.",
        recommendation:
          "Use the sleep timer feature to automatically turn off the AC after 2 hours of overnight use.",
        threshold: null,
        value: null,
        read: false,
        createdAt: yesterdayAt(7, 45),
      },
      {
        userId: demoUser.id,
        deviceId: fridgeDevice.id,
        type: AlertType.INFO,
        title: "Refrigerator running efficiently",
        description:
          "Refrigerator energy usage is within the expected range for the past 7 days. No action needed.",
        recommendation: null,
        read: true,
        createdAt: yesterdayAt(10, 30),
      },
    ],
  });

  console.log("  Created 5 alerts.");

  // ── Done ─────────────────────────────────────────────────────────────────────
  console.log("\nSeed complete. Summary:");
  console.log(`  Users: 1`);
  console.log(`  Rooms: ${createdRooms.length}`);
  console.log(`  Devices: ${createdDevices.length}`);
  console.log(`  Energy readings: ${allReadings.length}`);
  console.log(`  Alerts: 5`);
  console.log(`  Tariffs: 1`);
  console.log(`  Billing periods: 1`);
  console.log("\nDemo credentials:");
  console.log(`  Email:    demo@voltwise.app`);
  console.log(`  Password: ${DEMO_USER_PASSWORD}`);
}

seed()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
