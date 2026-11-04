// Documentation only: Machine Learning client service for VoltWise.
// Connects the Node.js backend with the Python FastAPI ml-voltwise service.
// Ingests live telemetry readings, extracts windowed features via the Python service,
// runs KMeans cluster prediction and anomaly detection, and determines if a load
// is a recognized user device or an "Unregistered Load".

import { prisma } from "./prisma.ts";
import { createAlert } from "../modules/alerts/alerts.service.ts";

export const DeviceStatus = {
  ACTIVE: "ACTIVE",
  IDLE: "IDLE",
  OFF: "OFF",
  UNPOWERED: "UNPOWERED",
} as const;
export type DeviceStatus = (typeof DeviceStatus)[keyof typeof DeviceStatus];

export const AlertType = {
  CRITICAL: "CRITICAL",
  WARNING: "WARNING",
  INFO: "INFO",
} as const;
export type AlertType = (typeof AlertType)[keyof typeof AlertType];

export interface MLPrediction {
  cluster: number;
  interpretation: string;
  dominant_appliance: string;
  nearest_distance: number;
  distance_threshold: number;
  is_anomaly: boolean;
  alert_level: string;
  message: string;
}

export interface MLTelemetryResponse {
  status: "warming_up" | "predicted";
  panel_id?: string;
  readings_in_window?: number;
  prediction?: MLPrediction;
}

export interface TelemetryReadingInput {
  voltage?: number;
  current?: number;
  watts: number;
  kwh: number;
  frequency?: number;
  powerFactor?: number;
}

export interface ApplianceMatchResult {
  deviceId: number | null;
  deviceName: string;
  isUnregistered: boolean;
  isAnomaly: boolean;
  interpretation: string;
  dominantAppliance: string;
}

// In-memory cooldown tracking to avoid flooding the user with alerts
let lastUnregisteredAlertAt = 0;
const UNREGISTERED_ALERT_COOLDOWN_MS = 120_000; // 2 minutes

export const getMlServiceUrl = (): string =>
  process.env.ML_SERVICE_URL ?? "http://localhost:8000";

export const isMlEnabled = (): boolean =>
  process.env.NODE_ENV !== "test" && process.env.ML_INFERENCE_ENABLED !== "false";

/**
 * Checks if the ML microservice is online and loaded.
 */
export const checkMlHealth = async (): Promise<boolean> => {
  if (!isMlEnabled()) return false;
  try {
    const res = await fetch(`${getMlServiceUrl()}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string; model_loaded?: boolean };
    return data.status === "ok" && data.model_loaded === true;
  } catch {
    return false;
  }
};

/**
 * Sends one telemetry reading to the ml-voltwise service for sliding window
 * feature engineering, KMeans clustering, and anomaly detection.
 */
export const classifyTelemetry = async (
  reading: TelemetryReadingInput,
  panelId: string = "main-panel"
): Promise<MLPrediction | null> => {
  if (!isMlEnabled()) return null;

  try {
    const res = await fetch(`${getMlServiceUrl()}/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        panel_id: panelId,
        voltage: reading.voltage ?? 230.0,
        current: reading.current ?? (reading.watts > 0 ? reading.watts / 230.0 : 0.0),
        power: reading.watts,
        energy_kwh: reading.kwh,
        frequency: reading.frequency ?? 60.0,
        power_factor: reading.powerFactor ?? 0.9,
      }),
      signal: AbortSignal.timeout(2000), // Non-blocking 2s timeout
    });

    if (!res.ok) return null;

    const body = (await res.json()) as MLTelemetryResponse;
    if (body.status === "predicted" && body.prediction) {
      return body.prediction;
    }
    return null;
  } catch (error) {
    // Fail silently so sensor ingestion is never interrupted if ML service is down
    return null;
  }
};

/**
 * Matches a dominant appliance prediction against the user's registered devices.
 */
export const matchesAppliance = (
  dominantApp: string,
  deviceName: string,
  deviceCategory: string | null
): boolean => {
  const domLower = dominantApp.toLowerCase();
  const nameLower = deviceName.toLowerCase();
  const catLower = (deviceCategory ?? "").toLowerCase();

  // 1. Direct substring match
  if (nameLower.includes(domLower) || domLower.includes(nameLower)) return true;

  // 2. Air Conditioner / AC
  if (domLower.includes("air") || domLower.includes("conditioner")) {
    if (
      (nameLower.includes("air") ||
        nameLower.includes("aircon") ||
        nameLower.includes("ac") ||
        catLower.includes("cool")) &&
      !nameLower.includes("fan")
    ) {
      return true;
    }
  }

  // 3. Refrigerator / Fridge
  if (domLower.includes("refrigerator") || domLower.includes("fridge")) {
    if (
      nameLower.includes("refrigerator") ||
      nameLower.includes("fridge") ||
      catLower.includes("refrigerat")
    ) {
      return true;
    }
  }

  // 4. Light Bulb / Lighting
  if (domLower.includes("light") || domLower.includes("bulb")) {
    if (
      nameLower.includes("light") ||
      nameLower.includes("bulb") ||
      nameLower.includes("lamp") ||
      nameLower.includes("chandelier") ||
      catLower.includes("light")
    ) {
      return true;
    }
  }

  // 5. Cellphone / Charging / Electronics
  if (
    domLower.includes("phone") ||
    domLower.includes("cell") ||
    domLower.includes("charg") ||
    domLower.includes("samsung")
  ) {
    if (
      nameLower.includes("phone") ||
      nameLower.includes("cell") ||
      nameLower.includes("charg") ||
      nameLower.includes("samsung") ||
      catLower.includes("charger") ||
      catLower.includes("phone")
    ) {
      return true;
    }
  }

  // 6. Electric Kettle / Heating
  if (domLower.includes("kettle")) {
    if (
      nameLower.includes("kettle") ||
      nameLower.includes("boiler") ||
      nameLower.includes("tea") ||
      nameLower.includes("pot") ||
      (nameLower.includes("kitchen") && !nameLower.includes("fridge")) ||
      catLower.includes("kitchen")
    ) {
      return true;
    }
  }

  return false;
};

/**
 * Resolves the ML prediction to either a registered user device or tags it
 * as an "Unregistered Load" in PostgreSQL. Also manages alert triggering.
 */
export const matchOrTagDevice = async (
  userId: number,
  prediction: MLPrediction,
  watts: number,
  forceAlert: boolean = false
): Promise<ApplianceMatchResult | null> => {
  // 1. If load is negligible (standby / idle / < 3W), keep as whole-home baseline
  if (watts < 3.0 && !prediction.is_anomaly) {
    return null;
  }

  // 2. Retrieve user's registered devices
  const userDevices = await prisma.device.findMany({
    where: {
      userId,
      enabled: true,
      name: { not: "Unregistered Load" }, // exclude the system-generated placeholder
    },
  });

  // 3. Search for a registered device matching the ML predicted appliance
  const matched = userDevices.find((d) =>
    matchesAppliance(prediction.dominant_appliance, d.name, d.category)
  );

  if (matched && !prediction.is_anomaly) {
    // Matched a registered device! Update its status to ACTIVE
    if (matched.status !== DeviceStatus.ACTIVE) {
      await prisma.device.update({
        where: { id: matched.id },
        data: { status: DeviceStatus.ACTIVE },
      });
    }

    // Set any placeholder Unregistered Load to IDLE since the active load is now accounted for
    if (typeof prisma.device.updateMany === "function") {
      await prisma.device.updateMany({
        where: {
          userId,
          name: "Unregistered Load",
          status: DeviceStatus.ACTIVE,
        },
        data: { status: DeviceStatus.IDLE },
      });
    }

    // Resolve clean dominant appliance label for user UI
    let cleanDominant = prediction.dominant_appliance;
    const catLower = (matched.category ?? "").toLowerCase();
    const nameLower = matched.name.toLowerCase();
    if (catLower.includes("light") || nameLower.includes("light") || nameLower.includes("bulb")) {
      cleanDominant = "Light Bulb";
    } else if (catLower.includes("charg") || catLower.includes("phone") || nameLower.includes("phone")) {
      cleanDominant = "Phone Charger";
    } else if (catLower.includes("cool") || nameLower.includes("air") || nameLower.includes("ac")) {
      cleanDominant = "Air Conditioner";
    } else if (catLower.includes("refrigerat") || nameLower.includes("fridge")) {
      cleanDominant = "Refrigerator";
    } else if (catLower.includes("kettle") || nameLower.includes("kettle") || nameLower.includes("kitchen")) {
      cleanDominant = "Electric Kettle";
    }

    return {
      deviceId: matched.id,
      deviceName: matched.name,
      isUnregistered: false,
      isAnomaly: false,
      interpretation: prediction.interpretation,
      dominantAppliance: cleanDominant,
    };
  }

  // 4. Load is either an Anomaly or does NOT match any registered device -> UNREGISTERED LOAD
  let unregisteredDevice = await prisma.device.findFirst({
    where: {
      userId,
      name: "Unregistered Load",
    },
  });

  if (!unregisteredDevice) {
    unregisteredDevice = await prisma.device.create({
      data: {
        userId,
        name: "Unregistered Load",
        category: "Unregistered",
        ratedWatts: Math.round(watts),
        status: DeviceStatus.ACTIVE,
        enabled: true,
      },
    });
  } else if (unregisteredDevice.status !== DeviceStatus.ACTIVE) {
    await prisma.device.update({
      where: { id: unregisteredDevice.id },
      data: {
        status: DeviceStatus.ACTIVE,
        ratedWatts: Math.round(watts),
      },
    });
  }

  // Resolve clean dominant appliance label for unregistered load UI prompt and alerts
  let cleanUnregisteredDominant = prediction.dominant_appliance;
  const domLower = prediction.dominant_appliance.toLowerCase();
  if (domLower.includes("light") || domLower.includes("bulb")) {
    cleanUnregisteredDominant = "Light Bulb";
  } else if (domLower.includes("kettle")) {
    cleanUnregisteredDominant = "Electric Kettle";
  } else if (domLower.includes("air") || domLower.includes("condition")) {
    cleanUnregisteredDominant = "Air Conditioner";
  } else if (domLower.includes("refrigerat") || domLower.includes("fridge")) {
    cleanUnregisteredDominant = "Refrigerator";
  } else if (cleanUnregisteredDominant.includes("/")) {
    cleanUnregisteredDominant = cleanUnregisteredDominant.split("/")[0].trim();
  }

  // 5. Trigger alert on cooldown or when newly active load is detected
  const nowMs = Date.now();
  if (forceAlert || nowMs - lastUnregisteredAlertAt >= UNREGISTERED_ALERT_COOLDOWN_MS) {
    lastUnregisteredAlertAt = nowMs;
    const isAnomaly = prediction.is_anomaly;

    try {
      await createAlert(userId, {
        type: isAnomaly ? "critical" : "info",
        title: isAnomaly ? "Electrical Anomaly Detected" : `${cleanUnregisteredDominant} Detected`,
        description: isAnomaly
          ? `Anomaly detected: ${prediction.interpretation} (${Math.round(watts)} W). Distance (${prediction.nearest_distance}) exceeds threshold (${prediction.distance_threshold}).`
          : `VoltWise ML detected a ${cleanUnregisteredDominant} (~${Math.round(watts)} W). Do you want to register this device?`,
        recommendation: isAnomaly
          ? "Inspect connected circuits immediately for faults, severe inrush, or equipment malfunction."
          : `Tap this alert to register this ${cleanUnregisteredDominant} to your devices.`,
        value: Math.round(watts),
      });
    } catch (err) {
      console.error("ML service: failed to create unregistered load alert:", err);
    }
  }

  return {
    deviceId: unregisteredDevice.id,
    deviceName: unregisteredDevice.name,
    isUnregistered: true,
    isAnomaly: prediction.is_anomaly,
    interpretation: prediction.interpretation,
    dominantAppliance: cleanUnregisteredDominant,
  };
};
