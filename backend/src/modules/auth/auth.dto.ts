// Documentation only: Defines TypeScript types for the auth module request and
// response shapes. Every public endpoint in auth.routes.ts has a corresponding
// DTO here so that the controller and service layers share a single source of
// truth for the data structures they exchange.

// ─── Inbound Request DTOs ──────────────────────────────────────────────────────

// Request body for POST /api/auth/register.
// password is required for real auth (unlike the old MVP stub).
export interface RegisterDto {
  email: string;
  name?: string;
  password: string;
}

// Request body for POST /api/auth/login.
export interface LoginDto {
  email: string;
  password: string;
}

// Request body for PATCH /api/auth/me.
// All fields are optional — the client sends only the fields it wants to change.
// Changing the password requires currentPassword to be provided and correct.
export interface UpdateProfileDto {
  name?: string;
  email?: string;
  currency?: string;
  currentPassword?: string;
  newPassword?: string;
}

// ─── Outbound Response DTOs ────────────────────────────────────────────────────

// The user object returned in all auth responses.
// Intentionally excludes passwordHash to prevent credential leakage.
export interface AuthUserResponseDto {
  // String form of the numeric DB primary key (keeps the mobile app JSON-friendly).
  id: string;
  email: string;
  name: string | null;
  currency: string;
  // ISO 8601 timestamp — included so the mobile app can display "member since".
  createdAt: string;
}

// The full payload returned by register and login endpoints.
// Contains the signed JWT (token) and the sanitized user object.
export interface AuthResponseDto {
  token: string;
  user: AuthUserResponseDto;
}
