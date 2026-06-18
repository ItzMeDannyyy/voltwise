// Documentation only: Service layer for the alerts module.
// Handles retrieving, formatting, and marking-read alerts for the demo user.
// No HTTP-specific code lives here.

import { prisma } from "../../lib/prisma.ts";
import { AlertType } from "../../generated/prisma/index.js";
import type { AlertResponseDto, CreateAlertDto } from "./alerts.dto.ts";

// The demo user ID for MVP scope.
const DEMO_USER_ID = 1;

// Documentation only: Maps the lowercase string the mobile app sends
// ("critical" | "warning" | "info") to the Prisma AlertType enum value.
const mapStringToAlertType = (
  value: "critical" | "warning" | "info"
): AlertType => {
  const typeMap: Record<"critical" | "warning" | "info", AlertType> = {
    critical: AlertType.CRITICAL,
    warning: AlertType.WARNING,
    info: AlertType.INFO,
  };
  return typeMap[value];
};

// Documentation only: Maps the Prisma AlertType enum value to the lowercase string
// the mobile app expects ("critical" | "warning" | "info").
// Accepts an AlertType enum value.
// Returns a lowercased string literal.
const mapAlertTypeToString = (
  alertType: AlertType
): "critical" | "warning" | "info" => {
  const typeMap: Record<AlertType, "critical" | "warning" | "info"> = {
    [AlertType.CRITICAL]: "critical",
    [AlertType.WARNING]: "warning",
    [AlertType.INFO]: "info",
  };
  return typeMap[alertType];
};

// Documentation only: Formats a HH:mm time string from a Date.
// Accepts a Date.
// Returns a string like "14:32".
const formatTimeFromDate = (date: Date): string => {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

// Documentation only: Determines whether an alert's createdAt date falls on today
// (in the server's local timezone). Older alerts receive "YESTERDAY" for the MVP.
// Accepts a Date.
// Returns "TODAY" or "YESTERDAY".
const determineSectionLabel = (createdAt: Date): "TODAY" | "YESTERDAY" => {
  const today = new Date();
  const isToday =
    createdAt.getFullYear() === today.getFullYear() &&
    createdAt.getMonth() === today.getMonth() &&
    createdAt.getDate() === today.getDate();

  return isToday ? "TODAY" : "YESTERDAY";
};

// Documentation only: Formats a raw Prisma Alert record into the AlertResponseDto
// the mobile app expects. Maps the enum, formats time, and adds the section label.
// Accepts a Prisma alert object.
// Returns an AlertResponseDto.
const formatAlertForResponse = (alert: {
  id: number;
  type: AlertType;
  title: string;
  description: string;
  recommendation: string | null;
  read: boolean;
  createdAt: Date;
}): AlertResponseDto => {
  return {
    id: String(alert.id),
    type: mapAlertTypeToString(alert.type),
    title: alert.title,
    description: alert.description,
    time: formatTimeFromDate(alert.createdAt),
    section: determineSectionLabel(alert.createdAt),
    read: alert.read,
    ...(alert.recommendation && { recommendation: alert.recommendation }),
  };
};

// Documentation only: Retrieves all alerts for the demo user, ordered newest-first.
// Returns a Promise resolving to an array of AlertResponseDto.
export const getAllAlerts = async (): Promise<AlertResponseDto[]> => {
  const alerts = await prisma.alert.findMany({
    where: { userId: DEMO_USER_ID },
    orderBy: { createdAt: "desc" },
  });

  return alerts.map(formatAlertForResponse);
};

// Documentation only: Marks a single alert as read by its ID.
// Throws an error if the alert does not exist or does not belong to the demo user.
// Accepts the alert id (number).
// Returns a Promise resolving to the updated AlertResponseDto.
export const markAlertRead = async (
  alertId: number
): Promise<AlertResponseDto> => {
  const existingAlert = await prisma.alert.findUnique({
    where: { id: alertId },
  });

  if (!existingAlert || existingAlert.userId !== DEMO_USER_ID) {
    throw new Error("Alert not found");
  }

  const updatedAlert = await prisma.alert.update({
    where: { id: alertId },
    data: { read: true },
  });

  return formatAlertForResponse(updatedAlert);
};

// Documentation only: Marks all alerts for the demo user as read in a single batch update.
// Returns a Promise resolving to true when the batch update completes.
export const markAllAlertsRead = async (): Promise<boolean> => {
  await prisma.alert.updateMany({
    where: { userId: DEMO_USER_ID, read: false },
    data: { read: true },
  });

  return true;
};

// Documentation only: Creates a new (unread) alert for the demo user.
// Used by the in-app demo control to simulate alert-system events.
// Accepts a CreateAlertDto; createdAt defaults to now() so it lands in "TODAY".
// Returns a Promise resolving to the created AlertResponseDto.
export const createAlert = async (
  input: CreateAlertDto
): Promise<AlertResponseDto> => {
  const created = await prisma.alert.create({
    data: {
      userId: DEMO_USER_ID,
      type: mapStringToAlertType(input.type),
      title: input.title,
      description: input.description,
      recommendation: input.recommendation ?? null,
      threshold: input.threshold ?? null,
      value: input.value ?? null,
      deviceId: input.deviceId ?? null,
      read: false,
    },
  });

  return formatAlertForResponse(created);
};
