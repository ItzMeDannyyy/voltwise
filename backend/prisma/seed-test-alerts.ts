import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, AlertType } from "../src/generated/prisma/index.js";
import { DATABASE_URL } from "../src/configs/database.ts";

const connectionString = DATABASE_URL();
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function seedAlerts() {
  console.log("Looking up target user...");

  // Find user by ID 1 or fallback to first user or danny@gmail.com
  let user = await prisma.user.findUnique({ where: { id: 1 } });
  if (!user) {
    user = await prisma.user.findFirst({ where: { email: "danny@gmail.com" } });
  }
  if (!user) {
    user = await prisma.user.findFirst({ orderBy: { id: "asc" } });
  }

  if (!user) {
    console.error("No user found in the database. Please run npm run seed:user first.");
    process.exit(1);
  }

  const userId = user.id;
  console.log(`Found target user: ID ${userId} (${user.email}, ${user.name})`);

  // Clear previous alerts for clean test state
  const deleted = await prisma.alert.deleteMany({
    where: { userId },
  });
  console.log(`Cleared ${deleted.count} existing alerts for user ${userId}.`);

  const now = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const testAlerts = [
    // 1. Tariff notice (Unread, Today) - Informational notice to configure tariff
    {
      userId,
      type: AlertType.INFO,
      title: "Electricity tariff not set",
      description:
        "Your electricity tariff is currently set to ₱0.00/kWh. Tap here to configure your utility rate in Settings → Units & Tariff so your bill calculations and device costs can be calculated.",
      recommendation: "Open Settings → Units & Tariff to set your electricity rate per kWh.",
      threshold: 0,
      value: 0,
      read: false,
      createdAt: new Date(now.getTime() - 15 * 60 * 1000), // 15 mins ago
    },

    // 2. Load detection (Unread, Today) - Tests appliance registration modal
    {
      userId,
      type: AlertType.INFO,
      title: "Electric Kettle Detected",
      description:
        "VoltWise ML detected a fast-boil heating element (~1850 W) on Kitchen circuit. Do you want to register this appliance to your inventory?",
      recommendation: "Tap this alert to register this Electric Kettle (~1850 W) to your devices.",
      threshold: 60,
      value: 1850,
      read: false,
      createdAt: new Date(now.getTime() - 45 * 60 * 1000), // 45 mins ago
    },

    // 3. Another load detection (Unread, Today)
    {
      userId,
      type: AlertType.INFO,
      title: "Air Conditioner Detected",
      description:
        "VoltWise ML detected an inverter cooling compressor (~1200 W) in Living Room. Do you want to register this device?",
      recommendation: "Tap this alert to add this Air Conditioner (~1200 W) to your devices.",
      threshold: 60,
      value: 1200,
      read: false,
      createdAt: new Date(now.getTime() - 90 * 60 * 1000), // 1.5 hrs ago
    },

    // 4. Electrical Warning (Unread, Today) - Tests Diagnostic Detail Modal (NO power cutoff!)
    {
      userId,
      type: AlertType.WARNING,
      title: "Circuit B voltage drop: 198 V",
      description:
        "Grid supply sagged below the 200 V operating floor (nominal 220 V). Sensitive inductive equipment may draw elevated current.",
      recommendation:
        "Inspect circuit breaker connections and monitor utility grid stability during peak neighborhood consumption hours.",
      threshold: 200,
      value: 198,
      read: false,
      createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000), // 3 hrs ago
    },

    // 5. Critical Hardware Anomaly (Unread, Today) - Tests Detail Modal with manual emergency cutoff
    {
      userId,
      type: AlertType.CRITICAL,
      title: "Air Conditioner power anomaly: 3.4 kW",
      description:
        "Air Conditioner drew 3,420 W — 185% above rated baseline envelope. High distance metric indicates abnormal compressor strain or locked rotor.",
      recommendation:
        "Inspect compressor outdoor condenser for dirt blockages, check refrigerant pressure, or power off unit to prevent motor burnout.",
      threshold: 1800,
      value: 3420,
      read: false,
      createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000), // 5 hrs ago
    },

    // 6. Informational Daily Report (Read, Today)
    {
      userId,
      type: AlertType.INFO,
      title: "Daily meter summary recorded",
      description:
        "Household consumed 14.2 kWh across the preceding 24-hour cycle. Whole-home baseline stayed within expected envelope.",
      recommendation: "View the Analytics tab to compare hourly breakdowns with yesterday.",
      threshold: null,
      value: 14.2,
      read: true,
      createdAt: new Date(now.getTime() - 8 * 60 * 60 * 1000), // 8 hrs ago
    },

    // 7. Sustained Load Warning (Read, Yesterday)
    {
      userId,
      type: AlertType.WARNING,
      title: "Sustained load above 4.5 kW",
      description:
        "Whole-home demand remained above 4,500 W for over 15 continuous minutes. Sub-panel approached breaker threshold.",
      recommendation: "Stagger high-consumption appliances (water heater, aircon) to reduce peak load.",
      threshold: 4500,
      value: 4850,
      read: true,
      createdAt: new Date(yesterday.getTime() - 2 * 60 * 60 * 1000),
    },

    // 8. Critical Outage (Read, Yesterday)
    {
      userId,
      type: AlertType.CRITICAL,
      title: "Grid power outage detected",
      description: "Mains voltage dropped to 0 V on the main incoming circuit. Telemetry was buffered locally.",
      recommendation: "Check local utility provider status or inspect neighborhood distribution transformers.",
      threshold: 200,
      value: 0,
      read: true,
      createdAt: new Date(yesterday.getTime() - 6 * 60 * 60 * 1000),
    },

    // 9. Power Restored (Read, Yesterday)
    {
      userId,
      type: AlertType.INFO,
      title: "Mains electricity restored",
      description: "Supply voltage stabilized at 221 V. Both low-voltage and high-load relay lines re-energized safely.",
      recommendation: "All circuits operational.",
      threshold: null,
      value: 221,
      read: true,
      createdAt: new Date(yesterday.getTime() - 5 * 60 * 60 * 1000),
    },
  ];

  console.log(`Seeding ${testAlerts.length} test alerts for user ${userId}...`);

  for (const alertData of testAlerts) {
    await prisma.alert.create({ data: alertData });
  }

  console.log(`Successfully seeded ${testAlerts.length} test alerts for user ${userId}!`);
}

seedAlerts()
  .catch((err) => {
    console.error("Failed to seed alerts:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
