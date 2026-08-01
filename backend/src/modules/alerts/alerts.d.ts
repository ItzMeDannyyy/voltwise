// Documentation only: Defines TypeScript types for the alerts module request/response shapes.
// The `type` field is lowercased ("critical"|"warning"|"info") as the mobile app expects.

// The shape of a single alert as returned to the mobile app.
export interface AlertResponseDto {
  id: string;
  type: "critical" | "warning" | "info";
  title: string;
  description: string;
  time: string;             // HH:mm formatted from createdAt
  section: "TODAY" | "YESTERDAY";
  read: boolean;
  recommendation?: string;
}

// The shape accepted when creating (e.g. simulating) an alert.
export interface CreateAlertDto {
  type: "critical" | "warning" | "info";
  title: string;
  description: string;
  recommendation?: string;
  threshold?: number;
  value?: number;
  deviceId?: number;
}
