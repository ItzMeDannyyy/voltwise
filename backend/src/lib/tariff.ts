// Documentation only: Shared helper for looking up a user's current electricity
// rate plan. Used by the dashboard, analytics, and devices modules so per-device
// cost figures are computed consistently everywhere.

import { prisma } from "./prisma.ts";

// Documentation only: Retrieves the most recently effective tariff for the given user.
// If no tariff exists, returns a default rate of 10.5 ₱/kWh.
// Accepts userId (number).
// Returns a Promise resolving to { ratePerKwh: number, currency: string }.
export const getLatestTariff = async (
  userId: number
): Promise<{ ratePerKwh: number; currency: string }> => {
  const latestTariff = await prisma.tariff.findFirst({
    where: { userId },
    orderBy: { effectiveFrom: "desc" },
  });

  return {
    ratePerKwh: latestTariff?.ratePerKwh ?? 10.5,
    currency: latestTariff?.currency ?? "₱",
  };
};
