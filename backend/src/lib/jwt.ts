// Documentation only: Provides a thin, type-safe wrapper around jsonwebtoken for
// signing and verifying JWTs used to authenticate VoltWise API requests.
// All tokens are signed with the JWT_SECRET_KEY environment variable.
// Callers should never import jsonwebtoken directly — use these helpers instead.

import jwt from "jsonwebtoken";

// The payload shape embedded inside every VoltWise access token.
// Intentionally minimal — the server fetches full profile data from the DB when needed.
export interface JwtPayload {
  id: number;
  email: string;
  // The Session row this token belongs to. requireAuth looks the session up on
  // every request, which is what allows a token to be revoked before it expires
  // ("sign out this device" / "sign out everywhere else").
  sid: string;
}

// How long an issued token remains valid before the client must log in again.
const TOKEN_EXPIRY = "7d";

// The same window in milliseconds, so a Session row can be given an expiresAt
// that matches the token it was issued alongside. Keeping both derived from one
// constant stops the DB and the JWT from disagreeing about when a session ended.
export const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

// Documentation only: Reads JWT_SECRET_KEY from the environment.
// Throws an Error if the variable is missing so that a misconfigured deployment
// fails immediately at startup rather than silently issuing unsigned tokens.
// Returns the secret string.
const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET_KEY;

  if (!secret) {
    throw new Error(
      "JWT_SECRET_KEY environment variable is not set. " +
        "Add it to your .env file before starting the server."
    );
  }

  return secret;
};

// Documentation only: Creates a signed JWT containing the user's id, email and
// session id. The token expires after 7 days and is signed with JWT_SECRET_KEY.
// Accepts a payload object with id (number), email (string) and sid (string).
// Returns the signed token string.
export const signToken = (payload: JwtPayload): string => {
  const secret = getJwtSecret();

  return jwt.sign(payload, secret, { expiresIn: TOKEN_EXPIRY });
};

// Documentation only: Verifies a JWT string and extracts the embedded payload.
// Throws a JsonWebTokenError if the token is malformed, has been tampered with,
// or has expired — the caller (auth middleware) converts these into 401 responses.
// Also throws for a token carrying no `sid`: those were issued before sessions
// existed and cannot be revoked, so they are treated as authentication failures
// rather than silently trusted. The holder simply signs in again, which is what
// the app already does with any 401.
// Accepts the raw token string (without the "Bearer " prefix).
// Returns the decoded JwtPayload { id, email, sid }.
export const verifyToken = (token: string): JwtPayload => {
  const secret = getJwtSecret();

  const decoded = jwt.verify(token, secret) as Partial<JwtPayload>;

  if (typeof decoded.sid !== "string" || decoded.sid === "") {
    throw new Error("token carries no session id");
  }

  return { id: decoded.id as number, email: decoded.email as string, sid: decoded.sid };
};

// ─── Password-reset token helpers ─────────────────────────────────────────────

// The payload shape embedded inside a password-reset token.
// The "type" discriminator prevents a regular access token from being accepted
// by the reset-password endpoint even if a user tries to swap them.
interface ResetTokenPayload {
  id: number;
  email: string;
  // A fixed literal that distinguishes reset tokens from ordinary access tokens.
  type: "password_reset";
}

// How long a password-reset token remains valid.
// Short-lived by design — a reset link should expire quickly to limit the window
// in which a stolen token could be misused.
const RESET_TOKEN_EXPIRY = "15m";

// Documentation only: Creates a short-lived (15 minutes) signed JWT for the
// password-reset flow. The payload includes a "type: password_reset" discriminator
// so that verifyResetToken can reject ordinary access tokens if someone attempts
// to misuse them in the reset endpoint.
// Accepts a payload object with id (number) and email (string).
// Returns the signed reset-token string.
export const signResetToken = (payload: { id: number; email: string }): string => {
  const secret = getJwtSecret();

  const resetPayload: ResetTokenPayload = {
    id: payload.id,
    email: payload.email,
    type: "password_reset",
  };

  return jwt.sign(resetPayload, secret, { expiresIn: RESET_TOKEN_EXPIRY });
};

// Documentation only: Verifies a password-reset token string and extracts its payload.
// In addition to standard signature and expiry checks, this function asserts that
// the "type" claim equals "password_reset" — rejecting regular access tokens even
// if they are otherwise valid.
// Throws an Error (message: "invalid reset token") if the token is malformed,
// expired, or carries the wrong type claim. The service layer converts this into
// an AppError 401 with a human-readable message.
// Accepts the raw reset-token string.
// Returns the decoded { id, email } (type claim is stripped before returning).
export const verifyResetToken = (token: string): { id: number; email: string } => {
  const secret = getJwtSecret();

  const decoded = jwt.verify(token, secret) as ResetTokenPayload;

  // Reject regular access tokens that happen to be valid signatures.
  if (decoded.type !== "password_reset") {
    throw new Error("invalid reset token");
  }

  return { id: decoded.id, email: decoded.email };
};
