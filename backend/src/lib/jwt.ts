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
}

// How long an issued token remains valid before the client must log in again.
const TOKEN_EXPIRY = "7d";

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

// Documentation only: Creates a signed JWT containing the user's id and email.
// The token expires after 7 days and is signed with JWT_SECRET_KEY.
// Accepts a payload object with id (number) and email (string).
// Returns the signed token string.
export const signToken = (payload: JwtPayload): string => {
  const secret = getJwtSecret();

  return jwt.sign(payload, secret, { expiresIn: TOKEN_EXPIRY });
};

// Documentation only: Verifies a JWT string and extracts the embedded payload.
// Throws a JsonWebTokenError if the token is malformed, has been tampered with,
// or has expired — the caller (auth middleware) converts these into 401 responses.
// Accepts the raw token string (without the "Bearer " prefix).
// Returns the decoded JwtPayload { id, email }.
export const verifyToken = (token: string): JwtPayload => {
  const secret = getJwtSecret();

  const decoded = jwt.verify(token, secret) as JwtPayload;

  return { id: decoded.id, email: decoded.email };
};
