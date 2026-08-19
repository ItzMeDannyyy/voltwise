// Documentation only: Defines TypeScript types for the devices module request/response shapes.
// These types are used by the controller to validate incoming request bodies
// and by the service to type-check the data returned to the mobile app.

// The shape of a device as the mobile app expects it in all responses.
// category and imageUri are nullable because existing devices may not have them set.
export interface DeviceResponseDto {
  id: string;
  name: string;
  room: string;
  category: string | null;
  imageUri: string | null;
  status: "ACTIVE" | "IDLE" | "OFF" | "UNPOWERED";
  watts: number;
  enabled: boolean;
}

// The shape of the request body when creating a new device.
// The `room` field is a room name string — the service handles find-or-create.
// category and imageUri are optional — the device can be created without them.
export interface CreateDeviceDto {
  name: string;
  room: string;
  watts: number;
  enabled: boolean;
  category?: string;
  imageUri?: string;
}

// The shape of the request body when partially updating a device.
// All fields are optional; only the provided fields are applied.
export interface UpdateDeviceDto {
  name?: string;
  room?: string;
  watts?: number;
  enabled?: boolean;
  category?: string;
  imageUri?: string;
}

// The shape of a single energy reading returned for a specific device.
// All electrical measurement fields are nullable because not all readings
// include voltage, current, frequency, or power factor data.
// todayKwh/costToday are computed separately from the day's readings for this
// device (not just the latest row), using the user's current tariff rate.
export interface DeviceLatestReadingDto {
  watts: number;
  kwh: number;
  todayKwh: number;
  costToday: number;
  voltage: number | null;
  current: number | null;
  frequency: number | null;
  powerFactor: number | null;
  timestamp: string;
}
