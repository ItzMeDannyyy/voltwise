// Documentation only: Defines TypeScript types for the devices module request/response shapes.
// These types are used by the controller to validate incoming request bodies
// and by the service to type-check the data returned to the mobile app.

// The shape of a device as the mobile app expects it in all responses.
export interface DeviceResponseDto {
  id: string;
  icon: string;
  name: string;
  room: string;
  status: "ACTIVE" | "IDLE" | "OFF";
  watts: number;
  enabled: boolean;
}

// The shape of the request body when creating a new device.
// The `room` field is a room name string — the service handles find-or-create.
export interface CreateDeviceDto {
  icon: string;
  name: string;
  room: string;
  watts: number;
  enabled: boolean;
}

// The shape of the request body when partially updating a device.
// All fields are optional; only the provided fields are applied.
export interface UpdateDeviceDto {
  icon?: string;
  name?: string;
  room?: string;
  watts?: number;
  enabled?: boolean;
}
