// Seeds (or upserts) the clean test user account danny@gmail.com without
// adding fake demo appliances or energy readings.
// Run with: npm run seed:user

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, AlertType } from "../src/generated/prisma/index.js";
import { DATABASE_URL } from "../src/configs/database.ts";

const SEED_EMAIL = process.env.SEED_USER_EMAIL ?? "danny@gmail.com";
const SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? "Password123";
const SEED_FIRST_NAME = process.env.SEED_USER_FIRST_NAME ?? "Danny";
const SEED_LAST_NAME = process.env.SEED_USER_LAST_NAME ?? "";

const connectionString = DATABASE_URL();
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function seedUser(): Promise<void> {
  console.log(`Seeding user ${SEED_EMAIL}...`);

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const fullName = `${SEED_FIRST_NAME} ${SEED_LAST_NAME}`.trim();

  const user = await prisma.user.upsert({
    where: { email: SEED_EMAIL },
    update: {
      firstName: SEED_FIRST_NAME,
      lastName: SEED_LAST_NAME,
      name: fullName,
      passwordHash,
      currency: "₱",
    },
    create: {
      email: SEED_EMAIL,
      firstName: SEED_FIRST_NAME,
      lastName: SEED_LAST_NAME,
      name: fullName,
      passwordHash,
      currency: "₱",
    },
  });

  // Ensure an initial 0.00 tariff exists if none is configured yet
  const existingTariff = await prisma.tariff.findFirst({
    where: { userId: user.id },
  });
  if (!existingTariff) {
    await prisma.tariff.create({
      data: {
        userId: user.id,
        ratePerKwh: 0,
        currency: "₱",
        effectiveFrom: new Date(),
      },
    });
  }

  // Ensure the "Electricity tariff not set" notice alert exists if rate is 0
  const existingAlert = await prisma.alert.findFirst({
    where: {
      userId: user.id,
      title: "Electricity tariff not set",
    },
  });
  if (!existingAlert && (!existingTariff || existingTariff.ratePerKwh <= 0)) {
    await prisma.alert.create({
      data: {
        userId: user.id,
        type: AlertType.INFO,
        title: "Electricity tariff not set",
        description:
          "Your electricity tariff is currently set to ₱0.00/kWh. Please set your localized utility rate in Settings → Units & Tariff to calculate your power bill and appliance consumption costs.",
        recommendation:
          "Open Settings → Units & Tariff to configure your rate per kWh.",
        read: false,
      },
    });
  }

  console.log(`Seeded user successfully:`);
  console.log(`  ID       : ${user.id}`);
  console.log(`  Email    : ${user.email}`);
  console.log(`  Password : ${SEED_PASSWORD}`);
  console.log(`  Tariff   : ₱0.00/kWh (with unread warning alert)`);
}

seedUser()
  .catch((error) => {
    console.error("User seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
