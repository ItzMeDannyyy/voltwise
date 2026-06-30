// Documentation only: Defines TypeScript types for the auth module request and
// response shapes. Every public endpoint in auth.routes.ts has a corresponding
// DTO here so that the controller and service layers share a single source of
// truth for the data structures they exchange.

// ─── Inbound Request DTOs ──────────────────────────────────────────────────────

// Request body for POST /api/auth/register.
// firstName and lastName are required and will be combined into name for
// backwards-compatible display. password must satisfy the strong-password policy
// enforced in auth.service.ts (validatePasswordStrength).
export interface RegisterDto {
  firstName: string;
  lastName: string;
  email: string;
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

// Request body for POST /api/auth/forgot-password.
export interface ForgotPasswordDto {
  email: string;
}

// Request body for POST /api/auth/reset-password.
export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

// ─── Outbound Response DTOs ────────────────────────────────────────────────────

// The user object returned in all auth responses.
// Intentionally excludes passwordHash to prevent credential leakage.
export interface AuthUserResponseDto {
  // String form of the numeric DB primary key (keeps the mobile app JSON-friendly).
  id: string;
  email: string;
  // Kept for backwards-compatible display (set to "<firstName> <lastName>" on register).
  name: string | null;
  // Discrete name parts added for the registration update (2026-06-21).
  firstName: string | null;
  lastName: string | null;
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

// The payload returned by POST /api/auth/forgot-password.
// MVP: returns the reset token directly so the mobile app can carry it into
// the reset step without an email service. In production this would be omitted
// and the token would be delivered via an email link only.
export interface ForgotPasswordResponseDto {
  resetToken: string;
  email: string;
}

// The payload returned by POST /api/auth/reset-password.
export interface ResetPasswordResponseDto {
  message: string;
}
