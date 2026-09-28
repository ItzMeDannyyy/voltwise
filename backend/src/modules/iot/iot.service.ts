import {
  getIotState,
  publishRelayCommand,
  publishSafetyCommand,
  publishCountdownCommand,
  setActiveCollection,
  getActiveCollection,
  type PowerLine,
  type ActiveCollectionSession,
} from "../../lib/mqtt.ts";
import { prisma } from "../../lib/prisma.ts";
import type {
  IotStatusDto,
  StartCollectionDto,
  CollectionStartResponseDto,
  CollectionStopResponseDto,
} from "./iot";

// A retained "online" status can outlive a crashed device until the broker's
// last-will fires, so the device only counts as online when telemetry (sent
// every ~2 s) has arrived within this window.
const TELEMETRY_FRESH_MS = 15_000;

// Documentation only: Returns the last-known IoT state, with the online flag
// cross-checked against telemetry freshness.
export const getStatus = (): IotStatusDto => {
  const state = getIotState();

  const telemetryFresh =
    state.lastTelemetryAt !== null &&
    Date.now() - new Date(state.lastTelemetryAt).getTime() < TELEMETRY_FRESH_MS;

  return {
    deviceUid: state.deviceUid,
    online: state.deviceOnline && telemetryFresh,
    brokerConnected: state.brokerConnected,
    relay: state.relay,
    lastTelemetry: state.lastTelemetry,
    lastTelemetryAt: state.lastTelemetryAt,
    activeCollection: state.activeCollection ?? null,
    safety: state.safety ?? { enabled: true, thresholdWatts: 3000 },
    countdown: state.countdown ?? { enabled: false, seconds: 1800 },
  };
};

// Documentation only: Publishes a relay on/off command to the device (master "all", "high", or "low").
// Throws AppError 503 (from publishRelayCommand) when the broker is down.
// Returns the current status snapshot so the client can show pending state
// until the firmware confirms via the retained relay/state topic.
export const setRelay = (on: boolean, line?: PowerLine): IotStatusDto => {
  publishRelayCommand(on, line);
  return getStatus();
};

/**
 * Publishes a safety cutoff configuration command (enable/disable, threshold).
 */
export const setSafety = (enabled: boolean, thresholdWatts?: number): IotStatusDto => {
  publishSafetyCommand(enabled, thresholdWatts);
  return getStatus();
};

/**
 * Publishes an auto-shutdown countdown configuration command (enable/disable, seconds).
 */
export const setCountdown = (enabled: boolean, seconds?: number): IotStatusDto => {
  publishCountdownCommand(enabled, seconds);
  return getStatus();
};


/**
 * Purges energy readings from the database to start a fresh collection slate.
 */
export const resetReadings = async (): Promise<{ count: number }> => {
  const result = await prisma.energyReading.deleteMany({});
  return { count: result.count };
};

/**
 * Starts an isolated data collection session for a specific appliance:
 * 1. Purges existing energy readings in the database (if requested).
 * 2. Ensures an active Device record exists for the appliance.
 * 3. Sets the active collection session in the MQTT ingestion layer.
 * 4. Energizes / switches ON the relay module so the appliance receives power.
 */
export const startCollection = async (
  userId: number,
  dto: StartCollectionDto
): Promise<CollectionStartResponseDto> => {
  let clearedCount = 0;
  if (dto.clearReadings !== false) {
    const res = await prisma.energyReading.deleteMany({});
    clearedCount = res.count;
  }

  const trimmedName = dto.applianceName.trim();
  let device = await prisma.device.findFirst({
    where: { userId, name: { equals: trimmedName, mode: "insensitive" } },
  });

  if (!device) {
    device = await prisma.device.create({
      data: {
        userId,
        name: trimmedName,
        status: "ACTIVE",
        ratedWatts: 0,
      },
    });
  }

  const session: ActiveCollectionSession = {
    applianceName: trimmedName,
    deviceId: device.id,
    startedAt: new Date().toISOString(),
    sampleCount: 0,
  };

  setActiveCollection(session);

  // Auto-disable shutdown countdown so data collection is not interrupted after 30 seconds
  try {
    publishCountdownCommand(false);
  } catch {
    // Non-fatal if broker isn't connected yet
  }

  // Energize / open the relay
  publishRelayCommand(true, dto.line);

  return {
    session,
    status: getStatus(),
    clearedReadingsCount: clearedCount,
  };
};

/**
 * Stops the active collection session and turns OFF the relay.
 */
export const stopCollection = async (line?: PowerLine): Promise<CollectionStopResponseDto> => {
  const currentSession = getActiveCollection();
  const applianceName = currentSession?.applianceName ?? "Unknown";
  const startedAt = currentSession?.startedAt
    ? new Date(currentSession.startedAt).getTime()
    : Date.now();
  const durationSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const sampleCount = currentSession?.sampleCount ?? 0;

  setActiveCollection(null);

  // Turn off the relay module
  publishRelayCommand(false, line);

  return {
    applianceName,
    durationSeconds,
    sampleCount,
    status: getStatus(),
  };
};

/**
 * Returns whether a data collection session is actively recording.
 */
export const getCollectionStatus = (): { active: boolean; session: ActiveCollectionSession | null } => {
  const session = getActiveCollection();
  return {
    active: session !== null,
    session,
  };
};

