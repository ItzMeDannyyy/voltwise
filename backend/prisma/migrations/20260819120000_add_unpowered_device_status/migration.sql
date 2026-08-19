-- AlterEnum
-- Adds the UNPOWERED device state: no power is available downstream of the
-- master relay, which is distinct from OFF (the appliance itself not drawing).
ALTER TYPE "DeviceStatus" ADD VALUE 'UNPOWERED';
