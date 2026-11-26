import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { DATABASE_URL } from "../src/configs/database.ts";

const connectionString = DATABASE_URL();
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const TEST_ALERT_TITLES = [
  "Electricity tariff not set",
  "Electric Kettle Detected",
  "Air Conditioner Detected",
  "Circuit B voltage drop: 198 V",
  "Air Conditioner power anomaly: 3.4 kW",
  "Daily meter summary recorded",
  "Sustained load above 4.5 kW",
  "Grid power outage detected",
  "Mains electricity restored",
];

async function clearAlerts() {
  console.log("Looking up target user...");

  // Find user by ID 1 or fallback to danny@gmail.com
  let user = await prisma.user.findUnique({ where: { id: 1 } });
  if (!user) {
    user = await prisma.user.findFirst({ where: { email: "danny@gmail.com" } });
  }
  if (!user) {
    user = await prisma.user.findFirst({ orderBy: { id: "asc" } });
  }

  if (!user) {
    console.error("No user found in the database.");
    process.exit(1);
  }

  const userId = user.id;
  console.log(`Found target user: ID ${userId} (${user.email}, ${user.name})`);

  // Check if --all flag is passed to clear every alert for user 1
  const clearAll = process.argv.includes("--all");

  const whereClause = clearAll
    ? { userId }
    : {
        userId,
        title: { in: TEST_ALERT_TITLES },
      };

  const deleted = await prisma.alert.deleteMany({
    where: whereClause,
  });

  console.log(
    `Successfully deleted ${deleted.count} ${clearAll ? "total" : "seeded test"} alert(s) for user ID ${userId}.`
  );

  const remainingCount = await prisma.alert.count({ where: { userId } });
  console.log(`User ID ${userId} now has ${remainingCount} alert(s) in database.`);
}

clearAlerts()
  .catch((err) => {
    console.error("Failed to clear test alerts:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
