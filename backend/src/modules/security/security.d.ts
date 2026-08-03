// Documentation only: Types for the security module — the account-safety half
// of the app's Privacy & Security screen. Every endpoint here is protected, and
// every response is scoped to the caller's own account.

// ─── Inbound Request DTOs ──────────────────────────────────────────────────────

// Request body for DELETE /api/security/account.
// The password is re-checked even though the caller is already authenticated:
// account deletion is irreversible, and a token left open on an unattended
// phone should not be enough to destroy someone's history.
export interface DeleteAccountDto {
  password: string;
}

// ─── Outbound Response DTOs ────────────────────────────────────────────────────

// One signed-in device in the session list.
export interface SessionSummaryDto {
  id: string;
  // Device label, e.g. "Pixel 7" or "Chrome on Windows".
  label: string;
  // "android" | "ios" | "web" | "unknown" — drives the icon in the app.
  platform: string;
  ipAddress: string | null;
  // ISO 8601 timestamps.
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  // True for the session that made this request. The app never offers to
  // revoke it from the list — that is what signing out is for.
  current: boolean;
}

// Account-safety facts shown above the session list.
export interface SecurityAccountDto {
  email: string;
  // When the account was created, ISO 8601.
  memberSince: string;
  // When the password was last changed, or null if it never has been since
  // registering. The app falls back to memberSince for display.
  passwordChangedAt: string | null;
  // False for legacy seeded accounts with no passwordHash; such an account
  // cannot use the password-confirmed deletion flow.
  hasPassword: boolean;
}

// The payload of GET /api/security/overview, and of both revoke endpoints so a
// mutation leaves the client holding fresh state without a second request.
export interface SecurityOverviewDto {
  account: SecurityAccountDto;
  // The caller's own session id, also flagged on the matching list entry.
  currentSessionId: string;
  // Active sessions only (not revoked, not expired), most recently used first.
  sessions: SessionSummaryDto[];
}

// The payload of DELETE /api/security/sessions/:id and
// POST /api/security/sessions/revoke-others.
export interface RevokeResultDto {
  revokedCount: number;
  overview: SecurityOverviewDto;
}

// The payload of DELETE /api/security/account.
export interface DeleteAccountResultDto {
  deleted: true;
  email: string;
}
